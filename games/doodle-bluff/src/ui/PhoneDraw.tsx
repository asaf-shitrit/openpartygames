// The draw phase: two prompts, one phase. Wraps the shared DoodlePad, batches new strokes to the
// "strokes" action using the view's ack count as the resend cursor, and mirrors each drawing to
// sessionStorage so a reload doesn't lose it (plan/0003-doodle-bluff.md, "The phone drawing pad").
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { ServerClock } from "@opg/ui";
import { Button, Card, DoodlePad, Icon, Marker, PRESSABLE_CLASS } from "@opg/ui";
import type { Doodle, Stroke } from "@opg/ui";
import { format, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import { doodleSchema, MAX_POINTS_PER_CHUNK, type DoodleAction, type DoodlePlayerPrompt, type DoodlePlayerView } from "../state";

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

export type SentCursors = Record<string, number>;

/** Pulls the cursor back to the server's ack when it falls behind — a resend after a drop. */
export function resyncCursor(sentRef: MutableRefObject<SentCursors>, drawingId: string, ackCount: number): void {
  const sent = sentRef.current[drawingId] ?? 0;
  if (ackCount < sent) sentRef.current = { ...sentRef.current, [drawingId]: ackCount };
}

function sendPending(
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
  sentRef.current = { ...sentRef.current, [drawingId]: doodle.s.length };
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
  onStrokeCountChange: (drawingId: string, count: number) => void;
}

export interface CommitDrawingChangeParams {
  roomCode: string;
  drawingId: string;
  doodle: Doodle;
  sentRef: MutableRefObject<SentCursors>;
  send: (action: DoodleAction) => void;
  onStrokeCountChange: (drawingId: string, count: number) => void;
}

/** Runs on every DoodlePad commit: mirror to sessionStorage, send the new strokes, report the
 * new count so the caller can resync its cursor against the server's next ack. */
export function commitDrawingChange({ roomCode, drawingId, doodle, sentRef, send, onStrokeCountChange }: CommitDrawingChangeParams): void {
  writeMirror(roomCode, drawingId, doodle);
  sendPending(send, sentRef, drawingId, doodle);
  onStrokeCountChange(drawingId, doodle.s.length);
}

function OneDrawing({ prompt, active, ack, done, clock, roomCode, sentRef, send, onStrokeCountChange }: OneDrawingProps) {
  const { drawingId } = prompt;
  const initialDoodle = useMemo(() => {
    const mirrored = readMirror(roomCode, drawingId);
    return mirrored !== null && mirrored.s.length > ack ? mirrored : undefined;
  }, [ack, drawingId, roomCode]);

  const flushedRef = useRef(false);
  useEffect(() => {
    if (flushedRef.current) return;
    flushedRef.current = true;
    if (initialDoodle !== undefined) sendPending(send, sentRef, drawingId, initialDoodle);
  }, [drawingId, initialDoodle, send, sentRef]);

  const onChange = useCallback(
    (doodle: Doodle) => commitDrawingChange({ roomCode, drawingId, doodle, sentRef, send, onStrokeCountChange }),
    [drawingId, onStrokeCountChange, roomCode, send, sentRef],
  );

  return (
    <div style={{ display: active ? "block" : "none" }}>
      <DoodlePad prompt={prompt.prompt} clock={clock} initialDoodle={initialDoodle} onChange={onChange} />
      <DoneButton drawingId={drawingId} done={done} send={send} />
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
      style={{ marginTop: 12 }}
    >
      <Icon name="check" size={22} />
      {done ? t.doodleBluff.doneShort : t.doodleBluff.imDoneWithThisOne}
    </Button>
  );
}

function SquiggleButton({
  drawingId,
  done,
  roomCode,
  sentRef,
  send,
}: {
  drawingId: string;
  done: boolean;
  roomCode: string;
  sentRef: MutableRefObject<SentCursors>;
  send: (action: DoodleAction) => void;
}) {
  const { t } = useLocale();
  return (
    <button
      type="button"
      className={`opg-reset ${PRESSABLE_CLASS}`}
      disabled={done}
      onClick={() => {
        if (done) return;
        writeMirror(roomCode, drawingId, SQUIGGLE_DOODLE);
        sendPending(send, sentRef, drawingId, SQUIGGLE_DOODLE);
        send({ type: "doodle-done", drawingId });
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
  const sentRef = useRef<SentCursors>({});
  const active = prompts[Math.min(activeIndex, Math.max(0, prompts.length - 1))];

  const handleStrokeCountChange = useCallback((drawingId: string, count: number) => {
    resyncCursor(sentRef, drawingId, count);
  }, []);

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
          onStrokeCountChange={handleStrokeCountChange}
        />
      ))}
      <SquiggleButton
        drawingId={active.drawingId}
        done={view.myDone[active.drawingId] === true}
        roomCode={roomCode}
        sentRef={sentRef}
        send={send}
      />
    </div>
  );
}
