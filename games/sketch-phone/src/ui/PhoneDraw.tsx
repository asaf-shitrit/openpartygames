// The draw phase: one link, one prompt. Batches new strokes into "strokes" actions and mirrors
// the drawing to sessionStorage so a reload doesn't lose it. The cursor is where the room's own
// copy ends, and the rules append a chunk only when its `from` is exactly that number — so the
// cursor is seeded from `view.myStrokeCount`, moved on what we send, and pulled back only to the
// room's count when it has run ahead.
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import type { ServerClock } from "@opg/ui";
import {
  Button,
  Card,
  DoodlePad,
  Icon,
  PRESSABLE_CLASS,
  useFitSquare,
} from "@opg/ui";
import { doodleSchema, emptyDoodle, type Doodle, type Stroke } from "@opg/sdk";
import { MAX_MESSAGE_LENGTH } from "@opg/protocol";
import { useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import { type SketchAction, type SketchPlayerView } from "../state";
import { MAX_POINTS_PER_CHUNK } from "../rules";

const TAP_TARGET = 44;
const PAD_MAX = 320;
const PAD_MIN = 140;
/** The column's own gap: the card, the pad, the squiggle row and the bar are all one gap apart. */
const PAD_GAP = 12;
/**
 * The bar is the column's last row, in flow, never laid over what is above it: a `fit` screen
 * that cannot fit its content (200% text, a short phone) scrolls its middle instead, so the
 * action stays on the screen and nothing ends up underneath it. The negative margins run the
 * opaque paper strip to the screen edges (PhoneScreen pads 18px at the sides, 28px at the
 * bottom).
 */
const BAR_STYLE: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "stretch",
  gap: 8,
  background: "var(--opg-paper)",
  margin: "0 -18px -28px",
  padding: "8px 18px 12px",
};
/** The pad and the squiggle row: the part of the column that gives up space when there is too little. */
const PAD_AREA_STYLE: CSSProperties = {
  flex: "1 1 0",
  minHeight: 0,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: PAD_GAP,
  alignItems: "stretch",
};

/** A small, fixed drawing well over the platform's minimum, for players who can't or won't draw. */
export const SQUIGGLE_DOODLE: Doodle = {
  v: 1,
  s: [
    { c: 0, d: 420, g: 0, p: [200, 500, 120, -80, 120, 80, 120, -80, 120, 80, 120, -80] },
    { c: 0, d: 260, g: 120, p: [860, 300, -60, 120, -60, -120, -60, 120] },
  ],
};

function frameOverhead(linkId: string, widestFrom: number): number {
  return JSON.stringify({
    t: "game-action",
    action: { type: "strokes", linkId, from: widestFrom, strokes: [] },
  }).length;
}

/**
 * Groups pending strokes into chunks that each cross the wire whole: a chunk's frame must fit
 * `MAX_MESSAGE_LENGTH` (a longer one is dropped in silence at the socket) and its points must fit
 * `MAX_POINTS_PER_CHUNK` (the rules refuse more). Both bounds are needed, in opposite directions.
 */
export function pendingChunks(strokes: readonly Stroke[], from: number, linkId: string): Stroke[][] {
  const pending = strokes.slice(from);
  const overhead = frameOverhead(linkId, Math.max(from, strokes.length));
  const chunks: Stroke[][] = [];
  let current: Stroke[] = [];
  let chars = 0;
  let points = 0;
  for (const stroke of pending) {
    const strokeChars = JSON.stringify(stroke).length;
    const strokePoints = stroke.p.length / 2;
    const overFrame = overhead + chars + strokeChars + current.length > MAX_MESSAGE_LENGTH;
    if (current.length > 0 && (overFrame || points + strokePoints > MAX_POINTS_PER_CHUNK)) {
      chunks.push(current);
      current = [];
      chars = 0;
      points = 0;
    }
    current.push(stroke);
    chars += strokeChars;
    points += strokePoints;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export function mirrorKey(roomCode: string, linkId: string, startedAt: number | null): string {
  return `opg:sketch:${roomCode}:${startedAt ?? 0}:${linkId}`;
}

function readMirror(key: string): Doodle | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw === null) return null;
    const result = doodleSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function writeMirror(key: string, doodle: Doodle): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(doodle));
  } catch {
    // private window, or storage full: the drawing still lives in phone state until submit.
  }
}

/** The mirror to pick up again: one holding at least everything the room accepted. Behind the
 * room's count means some older, shorter version of the drawing, and would put pad and room out
 * of step for good. */
export function restoreMirror(key: string, ackCount: number): Doodle | undefined {
  const mirrored = readMirror(key);
  return mirrored !== null && mirrored.s.length >= ackCount ? mirrored : undefined;
}

interface SendChunksParams {
  send: (action: SketchAction) => void;
  sentRef: { current: number };
  linkId: string;
  doodle: Doodle;
  canTruncate?: boolean;
}

export function sendChunks({ send, sentRef, linkId, doodle, canTruncate = false }: SendChunksParams): void {
  const from = sentRef.current;
  if (doodle.s.length < from) {
    if (!canTruncate) return;
    send({ type: "truncate", linkId, from, to: doodle.s.length });
    sentRef.current = doodle.s.length;
    return;
  }
  let cursor = from;
  for (const chunk of pendingChunks(doodle.s, from, linkId)) {
    send({ type: "strokes", linkId, from: cursor, strokes: chunk });
    cursor += chunk.length;
  }
  sentRef.current = cursor;
}

export interface PhoneDrawProps {
  view: SketchPlayerView;
  roomCode: string;
  /** When this game began: identifies the mirror. Not re-anchored when a phase is pulled in. */
  startedAt: number | null;
  clock: ServerClock;
  send: (action: SketchAction) => void;
}

/** A player pulled in mid-round has no link yet, so there is nothing to draw on. */
function WaitingCard({ t }: { t: Dictionary }) {
  return (
    <Card style={{ padding: 20, textAlign: "center" }}>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{t.sketchPhone.waitingOnLink}</div>
    </Card>
  );
}

export function PhoneDraw(props: PhoneDrawProps) {
  const { t } = useLocale();
  const linkId = props.view.myLinkId;
  if (linkId === null) return <WaitingCard t={t} />;
  return <DrawPad {...props} linkId={linkId} />;
}

/** The pad itself, for a player who does have a link to fill. */
function DrawPad({ view, roomCode, startedAt, clock, send, linkId }: PhoneDrawProps & { linkId: string }) {
  const { t } = useLocale();
  const prompt = view.input?.text ?? "";
  const ack = view.myStrokeCount;
  const barRef = useRef<HTMLDivElement>(null);
  // Measured against the pad's own box, which now scrolls when the column is too short.
  const padAreaRef = useRef<HTMLDivElement>(null);
  const squiggleRef = useRef<HTMLButtonElement>(null);
  const padSide = useFitSquare(padAreaRef, barRef, {
    min: PAD_MIN,
    max: PAD_MAX,
    gap: PAD_GAP,
    below: squiggleRef,
  });
  const [controlsSlot, setControlsSlot] = useState<HTMLElement | null>(null);
  const key = mirrorKey(roomCode, linkId, view.gameStartedAt ?? startedAt);
  const [{ initialDoodle, canTruncate }] = useState(() => {
    const restored = restoreMirror(key, ack);
    return { initialDoodle: restored, canTruncate: ack === 0 || restored !== undefined };
  });
  const [sentRef] = useState<{ current: number }>({ current: ack });
  const latestRef = useRef<Doodle>(initialDoodle ?? emptyDoodle());
  const done = view.myDone;

  useEffect(() => {
    if (done) return;
    if (sentRef.current > ack) sentRef.current = ack;
    sendChunks({ send, sentRef, linkId, doodle: latestRef.current });
  }, [ack, done, linkId, send, sentRef]);

  const onChange = useCallback(
    (doodle: Doodle) => {
      latestRef.current = doodle;
      writeMirror(key, doodle);
      sendChunks({ send, sentRef, linkId, doodle, canTruncate });
    },
    [canTruncate, key, linkId, send, sentRef],
  );

  const onSquiggle = useCallback(() => {
    sendChunks({ send, sentRef, linkId, doodle: emptyDoodle(), canTruncate: true });
    latestRef.current = SQUIGGLE_DOODLE;
    writeMirror(key, SQUIGGLE_DOODLE);
    sendChunks({ send, sentRef, linkId, doodle: SQUIGGLE_DOODLE, canTruncate: true });
    send({ type: "done", linkId });
  }, [key, linkId, send, sentRef]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: PAD_GAP, flex: "1 1 0", minHeight: 0 }}>
      <PromptCard prompt={prompt} t={t} />
      <div ref={padAreaRef} style={PAD_AREA_STYLE}>
        <div inert={done} style={{ flexShrink: 0 }}>
          <DoodlePad
            prompt={prompt}
            clock={clock}
            size={padSide}
            initialDoodle={initialDoodle}
            onChange={onChange}
            controlsSlot={controlsSlot}
          />
        </div>
        <SquiggleButton done={done} onSquiggle={onSquiggle} t={t} buttonRef={squiggleRef} />
      </div>
      <div ref={barRef} style={BAR_STYLE}>
        <div ref={setControlsSlot} inert={done} style={{ display: "contents" }} />
        <div style={{ order: 4, flex: "1 1 160px", display: "flex" }}>
          <DoneButton done={done} onDone={() => send({ type: "done", linkId })} t={t} />
        </div>
      </div>
    </div>
  );
}

/** What the player was handed, in big words above the pad. */
function PromptCard({ prompt, t }: { prompt: string; t: Dictionary }) {
  return (
    <Card style={{ padding: "6px 14px 10px" }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: "var(--opg-ink-secondary)" }}>
        {t.sketchPhone.drawThisNoWords}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, overflowWrap: "anywhere" }}>{prompt}</div>
    </Card>
  );
}

/** The way out for anyone who cannot draw: one squiggle, handed in for them. */
function SquiggleButton({
  done,
  onSquiggle,
  t,
  buttonRef,
}: {
  done: boolean;
  onSquiggle: () => void;
  t: Dictionary;
  /** Measured by the pad's fit: this row sits between the canvas and the pinned bar. */
  buttonRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`opg-reset ${PRESSABLE_CLASS}`}
      disabled={done}
      onClick={() => {
        if (!done) onSquiggle();
      }}
      style={{
        minHeight: TAP_TARGET,
        padding: "0 16px",
        fontSize: 16,
        fontWeight: 700,
        color: "var(--opg-ink-secondary)",
        textDecoration: "underline",
      }}
    >
      {t.sketchPhone.cantDrawSendSquiggle}
    </button>
  );
}

function DoneButton({ done, onDone, t }: { done: boolean; onDone: () => void; t: Dictionary }) {
  return (
    <Button
      fullWidth
      size="md"
      style={{ padding: "0 10px", gap: 8 }}
      disabled={done}
      onClick={() => {
        if (!done) onDone();
      }}
    >
      <Icon name="check" size={22} />
      {t.sketchPhone.imDone}
    </Button>
  );
}
