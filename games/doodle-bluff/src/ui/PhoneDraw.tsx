// The draw phase: two prompts, one phase. Wraps the shared DoodlePad, batches new strokes to the
// "strokes" action, and mirrors each drawing to sessionStorage so a reload doesn't lose it
// (plan/0003-doodle-bluff.md, "The phone drawing pad").
//
// The cursor per drawing is where the room's own copy ends, and it is the whole correctness
// story here, because the rules append a chunk only when its `from` is exactly that number and
// drop it in silence otherwise (src/index.ts, applyStrokes). Two things follow, and both were
// wrong before:
//
//   - a fresh mount has to start from `view.myStrokeCounts`, not from nothing. A phone that
//     remounts mid-phase — a reload, or a socket blip — otherwise sends `from: 0` at a room
//     that already holds N strokes, so nothing lands until the pad's own count passes N and
//     the rest of the drawing then grafts onto the pre-blip one. The artist sees a clean
//     picture and the room sees a mutilated one.
//   - the cursor moves on the room's ack and on what we send, never on the pad's stroke count.
import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { ServerClock } from "@opg/ui";
import { Button, Card, DoodlePad, Icon, Marker, PRESSABLE_CLASS } from "@opg/ui";
import type { Doodle, Stroke } from "@opg/ui";
import { format, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import { doodleSchema, emptyDoodle, MAX_POINTS_PER_CHUNK, type DoodleAction, type DoodlePlayerPrompt, type DoodlePlayerView } from "../state";

const TAP_TARGET = 44;

/** A small, fixed drawing well over MIN_STROKES, for players who can't or don't want to draw. */
export const SQUIGGLE_DOODLE: Doodle = {
  v: 1,
  s: [
    { c: 0, d: 420, g: 0, p: [200, 500, 120, -80, 120, 80, 120, -80, 120, 80, 120, -80] },
    { c: 0, d: 260, g: 120, p: [860, 300, -60, 120, -60, -120, -60, 120] },
  ],
};

/** Groups pending strokes into chunks that each fit MAX_POINTS_PER_CHUNK. */
export function pendingChunks(strokes: readonly Stroke[], from: number): Stroke[][] {
  const chunks: Stroke[][] = [];
  let current: Stroke[] = [];
  let points = 0;
  for (const stroke of strokes.slice(from)) {
    const strokePoints = stroke.p.length / 2;
    if (current.length > 0 && points + strokePoints > MAX_POINTS_PER_CHUNK) {
      chunks.push(current);
      current = [];
      points = 0;
    }
    current.push(stroke);
    points += strokePoints;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** drawingId -> how many of its strokes the room is believed to hold. */
export type SentCursors = Record<string, number>;

/** Pulls the cursor back to the room's own accepted count when it has run ahead of it: the
 * chunk in between never landed, so everything past the ack is pending again. `ackCount` has to
 * be `view.myStrokeCounts`, the room's number. Feeding this the pad's own stroke count — which
 * is what it used to get — tells it the room agreed to something it never saw. */
export function resyncCursor(sentRef: MutableRefObject<SentCursors>, drawingId: string, ackCount: number): void {
  const sent = sentRef.current[drawingId] ?? 0;
  if (ackCount < sent) sentRef.current = { ...sentRef.current, [drawingId]: ackCount };
}

export function storageKey(code: string, drawingId: string): string {
  return `opg:doodle:${code}:${drawingId}`;
}

/** Best-effort read of a mirrored doodle; null on any parse, validation or access failure
 * (private window, or a shape from an older encoding). sessionStorage is client-controlled,
 * so it is parsed with the same zod schema the server uses for a "strokes" action. */
export function readMirror(code: string, drawingId: string): Doodle | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(code, drawingId));
    if (raw === null) return null;
    const result = doodleSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function writeMirror(code: string, drawingId: string, doodle: Doodle): void {
  try {
    window.sessionStorage.setItem(storageKey(code, drawingId), JSON.stringify(doodle));
  } catch {
    // private window, or storage full: the drawing still lives in phone state until submit.
  }
}

/** The mirrored drawing a remounting pad picks up again: one holding at least everything the
 * room has already accepted. The mirror is written before its strokes go out, so a mirror level
 * with the ack is that same drawing — the ordinary case, and the one a "strictly ahead" test
 * used to throw away, remounting the pad blank — and one ahead of it is that drawing plus
 * whatever the blip swallowed. Only a mirror behind the ack is some older, shorter version of
 * the drawing, and picking that up would put the pad and the room permanently out of step. */
export function restoreMirror(code: string, drawingId: string, ackCount: number): Doodle | undefined {
  const mirrored = readMirror(code, drawingId);
  return mirrored !== null && mirrored.s.length >= ackCount ? mirrored : undefined;
}

function sendChunks(
  send: (action: DoodleAction) => void,
  sentRef: MutableRefObject<SentCursors>,
  drawingId: string,
  doodle: Doodle,
): void {
  const from = sentRef.current[drawingId] ?? 0;
  let cursor = from;
  for (const chunk of pendingChunks(doodle.s, from)) {
    send({ type: "strokes", drawingId, from: cursor, strokes: chunk });
    cursor += chunk.length;
  }
  // `cursor`, not the pad's stroke count: with nothing to send the cursor must stay where the
  // room is. Setting it from the pad is how a remounted pad talked the cursor back down to its
  // own blank state and started sending into a void.
  sentRef.current = { ...sentRef.current, [drawingId]: cursor };
}

export interface PhoneDrawProps {
  view: DoodlePlayerView;
  roomCode: string;
  clock: ServerClock;
  send: (action: DoodleAction) => void;
}

function progressLabel(t: Dictionary, index: number, total: number): string {
  return format(t.doodleBluff.drawingOfTotal, { current: index + 1, total });
}

interface OneDrawingProps {
  prompt: DoodlePlayerPrompt;
  active: boolean;
  ack: number;
  done: boolean;
  clock: ServerClock;
  roomCode: string;
  sentRef: MutableRefObject<SentCursors>;
  send: (action: DoodleAction) => void;
}

export interface CommitDrawingChangeParams {
  roomCode: string;
  drawingId: string;
  doodle: Doodle;
  sentRef: MutableRefObject<SentCursors>;
  send: (action: DoodleAction) => void;
}

/** Runs on every DoodlePad commit: mirror to sessionStorage, then send whatever the room does
 * not have yet. The mirror is written first so a blip between the two leaves the pad able to
 * pick up exactly where the room did. */
export function commitDrawingChange({ roomCode, drawingId, doodle, sentRef, send }: CommitDrawingChangeParams): void {
  writeMirror(roomCode, drawingId, doodle);
  sendChunks(send, sentRef, drawingId, doodle);
}

function OneDrawing({ prompt, active, ack, done, clock, roomCode, sentRef, send }: OneDrawingProps) {
  const { drawingId } = prompt;
  const [initialDoodle] = useState(() => restoreMirror(roomCode, drawingId, ack));
  const latestRef = useRef<Doodle>(initialDoodle ?? emptyDoodle());

  // On mount, and again whenever the room's count for this drawing moves: put the cursor back
  // on the room's number if it has run ahead, then send whatever sits past it. On mount that is
  // the restored mirror's unsent tail; later it is a chunk whose ack never came. A finished
  // drawing is skipped — the rules refuse chunks for one, so there is nothing left to repair.
  useEffect(() => {
    if (done) return;
    resyncCursor(sentRef, drawingId, ack);
    sendChunks(send, sentRef, drawingId, latestRef.current);
  }, [ack, done, drawingId, send, sentRef]);

  const onChange = useCallback(
    (doodle: Doodle) => {
      latestRef.current = doodle;
      commitDrawingChange({ roomCode, drawingId, doodle, sentRef, send });
    },
    [drawingId, roomCode, send, sentRef],
  );

  const onSquiggle = useCallback(() => {
    latestRef.current = SQUIGGLE_DOODLE;
    commitDrawingChange({ roomCode, drawingId, doodle: SQUIGGLE_DOODLE, sentRef, send });
    send({ type: "doodle-done", drawingId });
  }, [drawingId, roomCode, send, sentRef]);

  return (
    <div style={{ display: active ? "flex" : "none", flexDirection: "column", gap: 12 }}>
      <DoodlePad prompt={prompt.prompt} clock={clock} initialDoodle={initialDoodle} onChange={onChange} />
      <DoneButton drawingId={drawingId} done={done} send={send} />
      <SquiggleButton done={done} onSquiggle={onSquiggle} />
    </div>
  );
}

function DoneButton({ drawingId, done, send }: { drawingId: string; done: boolean; send: (a: DoodleAction) => void }) {
  const { t } = useLocale();
  return (
    <Button
      fullWidth
      disabled={done}
      onClick={() => {
        if (!done) send({ type: "doodle-done", drawingId });
      }}
    >
      <Icon name="check" size={22} />
      {done ? t.doodleBluff.doneShort : t.doodleBluff.imDoneWithThisOne}
    </Button>
  );
}

function SquiggleButton({ done, onSquiggle }: { done: boolean; onSquiggle: () => void }) {
  const { t } = useLocale();
  return (
    <button
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
      {t.doodleBluff.cantDrawSendSquiggle}
    </button>
  );
}

export function PhoneDraw({ view, roomCode, clock, send }: PhoneDrawProps) {
  const { t } = useLocale();
  const prompts = view.myPrompts;
  const [activeIndex, setActiveIndex] = useState(0);
  // Seeded from the room's own accepted counts, once, at mount. Held in state rather than a ref
  // only because a ref's initial value is recomputed on every render.
  const [sentRef] = useState<MutableRefObject<SentCursors>>(() => ({ current: { ...view.myStrokeCounts } }));
  const active = prompts[Math.min(activeIndex, Math.max(0, prompts.length - 1))];

  if (prompts.length === 0 || active === undefined) {
    return (
      <Card style={{ padding: 20, textAlign: "center" }}>
        <Marker size={26}>{t.doodleBluff.waitingOnPrompts}</Marker>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Label at one end, button at the other — until the two together are wider than the
          phone, which is what zooming to 200% does to them. Wrapping drops the button to its
          own line rather than off the edge; at normal size they still share one. */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <Marker size={24} style={{ minWidth: 0, overflowWrap: "anywhere" }}>
          {progressLabel(t, activeIndex, prompts.length)}
        </Marker>
        {prompts.length > 1 ? (
          <button
            type="button"
            className={`opg-reset ${PRESSABLE_CLASS}`}
            onClick={() => setActiveIndex((i) => (i + 1) % prompts.length)}
            style={{ minHeight: TAP_TARGET, padding: "0 14px", fontWeight: 700 }}
          >
            {t.doodleBluff.nextDrawing}
          </button>
        ) : null}
      </div>
      <Card style={{ padding: "10px 14px", fontSize: 18, fontWeight: 700 }}>{format(t.doodleBluff.drawThisNoWords, { prompt: active.prompt })}</Card>
      {prompts.map((prompt, index) => (
        <OneDrawing
          key={prompt.drawingId}
          prompt={prompt}
          active={index === activeIndex}
          ack={view.myStrokeCounts[prompt.drawingId] ?? 0}
          done={view.myDone[prompt.drawingId] === true}
          clock={clock}
          roomCode={roomCode}
          sentRef={sentRef}
          send={send}
        />
      ))}
    </div>
  );
}
