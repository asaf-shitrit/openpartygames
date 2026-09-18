// /dev/moments — replay the Imposter reveal, last-chance and result previews on a
// scrubbable fake clock. Dev-only.
import { useEffect, useRef, useState } from "react";
import type { HostRoomView, PlayerRoomView } from "@opg/protocol";
import { Button, Chip, Marker, TvHeader } from "@opg/ui";
import type { ServerClock } from "@opg/ui";
import { LAST_CHANCE_MS, REVEAL_MS, resultDurationMs } from "@opg/game-imposter";
import type {
  ImposterAction,
  ImposterHostView,
  ImposterPlayerView,
} from "@opg/game-imposter";
import { imposterUi } from "@opg/game-imposter/ui";
import { imposterPreviews } from "@opg/game-imposter/preview";
import { TvPage } from "../screens/shared";

/** A preview as exported by a game package: the surface tag ties the two unions together. */
export interface PreviewInput {
  label: string;
  surface: "host" | "phone";
  view: ImposterHostView | ImposterPlayerView;
  room: HostRoomView | PlayerRoomView;
}

export interface HostPreview {
  label: string;
  surface: "host";
  view: ImposterHostView;
  room: HostRoomView;
}

export interface PhonePreview {
  label: string;
  surface: "phone";
  view: ImposterPlayerView;
  room: PlayerRoomView;
}

export type PreviewFixture = HostPreview | PhonePreview;

export type MomentKind = "reveal" | "last-chance" | "result";

export interface DevMoment {
  /** Stable id, the fixture label. */
  id: string;
  /** Short chip copy: "caught", "wrong", "typing", "got it"… */
  chip: string;
  fixture: HostPreview;
  kind: MomentKind;
  /** This moment's own phase length, in ms. */
  durationMs: number;
}

const REVEAL_PHONE_PREFIX = "phone:";
const TV_WIDTH = 1920;
const TV_HEIGHT = 1080;
const TV_SCALE = 0.5;
const PHONE_WIDTH = 390;
const PHONE_HEIGHT = 844;
const PHONE_SCALE = 0.45;
const TICK_MS = 100;

/** The moments offered in the picker, in display order. */
const MOMENT_DEFS: Array<{ label: string; chip: string; kind: MomentKind }> =
  [
    { label: "Host: reveal", chip: "caught", kind: "reveal" },
    { label: "Host: reveal wrong", chip: "wrong", kind: "reveal" },
    { label: "Host: reveal tie", chip: "tie", kind: "reveal" },
    { label: "Host: reveal no votes", chip: "no votes", kind: "reveal" },
    {
      label: "Host: last chance typing",
      chip: "typing",
      kind: "last-chance",
    },
    {
      label: "Host: result caught got it",
      chip: "got it",
      kind: "result",
    },
    { label: "Host: result caught nope", chip: "nope", kind: "result" },
    { label: "Host: result escaped", chip: "escaped", kind: "result" },
  ];

/** Imposter host views carry `votedIds`; player views do not. */
function isHostView(
  view: ImposterHostView | ImposterPlayerView,
): view is ImposterHostView {
  return "votedIds" in view;
}

/** A host fixture, or null when the preview is not a host preview. */
function hostFixtureOf(preview: PreviewInput): HostPreview | null {
  if (preview.surface !== "host") return null;
  if (preview.room.role !== "host") return null;
  if (!isHostView(preview.view)) return null;
  return {
    label: preview.label,
    surface: "host",
    view: preview.view,
    room: preview.room,
  };
}

/** A phone fixture, or null when the preview is not a phone preview. */
function phoneFixtureOf(preview: PreviewInput): PhonePreview | null {
  if (preview.surface !== "phone") return null;
  if (preview.room.role !== "player") return null;
  if (isHostView(preview.view)) return null;
  return {
    label: preview.label,
    surface: "phone",
    view: preview.view,
    room: preview.room,
  };
}

/** Narrows each loose preview into a surface-tagged fixture, dropping mismatched entries. */
export function toPreviewFixtures(
  previews: readonly PreviewInput[],
): PreviewFixture[] {
  const fixtures: PreviewFixture[] = [];
  for (const preview of previews) {
    const fixture = hostFixtureOf(preview) ?? phoneFixtureOf(preview);
    if (fixture !== null) fixtures.push(fixture);
  }
  return fixtures;
}

/** This moment kind's own phase length, from the fixture's view. */
function durationFor(kind: MomentKind, view: ImposterHostView): number {
  if (kind === "reveal") return REVEAL_MS;
  if (kind === "last-chance") return LAST_CHANCE_MS;
  return resultDurationMs(view.caught);
}

/** One DevMoment per entry in MOMENT_DEFS whose fixture exists, in that order. */
export function devMoments(fixtures: readonly PreviewFixture[]): DevMoment[] {
  const hosts = new Map(
    fixtures
      .filter((fixture): fixture is HostPreview => fixture.surface === "host")
      .map((fixture) => [fixture.label, fixture]),
  );
  const moments: DevMoment[] = [];
  for (const def of MOMENT_DEFS) {
    const fixture = hosts.get(def.label);
    if (fixture === undefined) continue;
    moments.push({
      id: fixture.label,
      chip: def.chip,
      fixture,
      kind: def.kind,
      durationMs: durationFor(def.kind, fixture.view),
    });
  }
  return moments;
}

/** The label substring that ties a phone fixture to a moment kind. */
function phoneKeyword(kind: MomentKind): string {
  if (kind === "reveal") return "reveal";
  if (kind === "last-chance") return "last chance";
  return "result";
}

function isPhoneFor(fixture: PreviewFixture, kind: MomentKind): fixture is PhonePreview {
  if (fixture.surface !== "phone") return false;
  const label = fixture.label.toLowerCase();
  return (
    label.startsWith(REVEAL_PHONE_PREFIX) && label.includes(phoneKeyword(kind))
  );
}

/** The phone fixtures shown beside the TV for this moment kind. */
export function phoneFixturesFor(
  kind: MomentKind,
  fixtures: readonly PreviewFixture[],
): PhonePreview[] {
  return fixtures.filter((fixture): fixture is PhonePreview =>
    isPhoneFor(fixture, kind),
  );
}

/** The moment's clock anchor: `timerStartedAt`, or the fixture's server clock. */
export function anchorFor(fixture: PreviewFixture): number {
  return fixture.room.game?.timerStartedAt ?? fixture.room.serverNow;
}

/** Elapsed ms, advanced from `playStartedAt` while playing and clamped to 0..durationMs. */
export function elapsedAt(
  playStartedAt: number | null,
  baseElapsed: number,
  now: number,
  durationMs: number,
): number {
  const raw =
    playStartedAt === null ? baseElapsed : baseElapsed + (now - playStartedAt);
  return Math.min(Math.max(raw, 0), durationMs);
}

export function secondsLabel(elapsedMs: number): string {
  return `${(elapsedMs / 1000).toFixed(1)}s`;
}

// Previews are read-only; their actions go nowhere.
function ignoreAction(): void {
  /* no server behind the preview */
}

function TvPreview({
  fixture,
  elapsedMs,
  mountKey,
}: {
  fixture: HostPreview;
  elapsedMs: number;
  mountKey: string;
}) {
  const Host = imposterUi.Host;
  const clock: ServerClock = { now: () => anchorFor(fixture) + elapsedMs };
  return (
    <div
      style={{
        width: TV_WIDTH * TV_SCALE,
        height: TV_HEIGHT * TV_SCALE,
        overflow: "hidden",
        border: "4px solid var(--opg-ink)",
        borderRadius: 14,
        flexShrink: 0,
      }}
    >
      <div
        className="opg-root opg-grid-tv"
        style={{
          width: TV_WIDTH,
          height: TV_HEIGHT,
          transform: `scale(${TV_SCALE})`,
          transformOrigin: "top left",
        }}
      >
        <Host
          key={mountKey}
          view={fixture.view}
          room={fixture.room}
          deadline={fixture.room.game?.deadline ?? null}
          timerStartedAt={anchorFor(fixture)}
          clock={clock}
        />
      </div>
    </div>
  );
}

function PhonePreview({
  fixture,
  elapsedMs,
  mountKey,
}: {
  fixture: PhonePreview;
  elapsedMs: number;
  mountKey: string;
}) {
  const Phone = imposterUi.Phone;
  const send: (action: ImposterAction) => void = ignoreAction;
  const clock: ServerClock = { now: () => anchorFor(fixture) + elapsedMs };
  return (
    <div
      style={{
        width: PHONE_WIDTH * PHONE_SCALE,
        height: PHONE_HEIGHT * PHONE_SCALE,
        overflow: "hidden",
        border: "4px solid var(--opg-ink)",
        borderRadius: 18,
        flexShrink: 0,
      }}
    >
      <div
        className="opg-root opg-grid-phone"
        style={{
          width: PHONE_WIDTH,
          height: PHONE_HEIGHT,
          transform: `scale(${PHONE_SCALE})`,
          transformOrigin: "top left",
        }}
      >
        <Phone
          key={mountKey}
          view={fixture.view}
          room={fixture.room}
          stage={null}
          deadline={fixture.room.game?.deadline ?? null}
          timerStartedAt={anchorFor(fixture)}
          clock={clock}
          send={send}
        />
      </div>
    </div>
  );
}

function MomentPicker({
  moments,
  selectedId,
  onSelect,
}: {
  moments: readonly DevMoment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      {moments.map((moment) => {
        const selected = moment.id === selectedId;
        return (
          <button
            key={moment.id}
            type="button"
            className="opg-reset"
            aria-pressed={selected}
            onClick={() => onSelect(moment.id)}
            style={{ background: "none", border: "none", padding: 0 }}
          >
            <Chip
              height={56}
              fontSize={28}
              style={{
                background: selected ? "var(--opg-highlight)" : undefined,
              }}
            >
              {selected ? "✓ " : ""}
              {moment.chip}
            </Chip>
          </button>
        );
      })}
    </div>
  );
}

function PlaybackControls({
  playing,
  elapsed,
  durationMs,
  onToggle,
  onRestart,
  onScrub,
}: {
  playing: boolean;
  elapsed: number;
  durationMs: number;
  onToggle: () => void;
  onRestart: () => void;
  onScrub: (elapsedMs: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <Button size="md" onClick={onToggle}>
        {playing ? "Pause" : "Play"}
      </Button>
      <Button size="md" variant="secondary" onClick={onRestart}>
        Restart
      </Button>
      <input
        type="range"
        aria-label="Scrub the reveal"
        min={0}
        max={durationMs}
        step={100}
        value={elapsed}
        onChange={(event) => onScrub(Number(event.target.value))}
        style={{ width: 520, height: 32 }}
      />
      <Chip height={56} fontSize={28}>
        {secondsLabel(elapsed)}
      </Chip>
    </div>
  );
}

interface Playback {
  playing: boolean;
  elapsed: number;
  generation: number;
  toggle: () => void;
  restart: () => void;
  scrub: (elapsedMs: number) => void;
}

/** Real-time elapsed state for the fake clock; one 100ms tick, computed from performance.now(). */
function useMomentPlayback(durationMs: number): Playback {
  const [elapsed, setElapsed] = useState(0);
  const [playStartedAt, setPlayStartedAt] = useState<number | null>(null);
  const [generation, setGeneration] = useState(0);
  const baseElapsed = useRef(0);

  useEffect(() => {
    if (playStartedAt === null) return undefined;
    const id = window.setInterval(() => {
      const next = elapsedAt(
        playStartedAt,
        baseElapsed.current,
        performance.now(),
        durationMs,
      );
      setElapsed(next);
      if (next >= durationMs) setPlayStartedAt(null);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [playStartedAt, durationMs]);

  function toggle(): void {
    if (playStartedAt !== null) {
      setElapsed(
        elapsedAt(
          playStartedAt,
          baseElapsed.current,
          performance.now(),
          durationMs,
        ),
      );
      setPlayStartedAt(null);
      return;
    }
    // Remount so the moment's beats schedule from here and cues play live. At the end, start over.
    const from = elapsed >= durationMs ? 0 : elapsed;
    baseElapsed.current = from;
    setElapsed(from);
    setGeneration((value) => value + 1);
    setPlayStartedAt(performance.now());
  }

  function restart(): void {
    setPlayStartedAt(null);
    setElapsed(0);
    baseElapsed.current = 0;
    setGeneration((value) => value + 1);
  }

  function scrub(nextElapsed: number): void {
    setPlayStartedAt(null);
    setElapsed(nextElapsed);
    baseElapsed.current = nextElapsed;
    setGeneration((value) => value + 1);
  }

  return {
    playing: playStartedAt !== null,
    elapsed,
    generation,
    toggle,
    restart,
    scrub,
  };
}

export interface MomentPlayerProps {
  /** Moments in the picker. Defaults to the Imposter reveal/last-chance/result host previews. */
  moments?: readonly DevMoment[];
}

function EmptyMoments() {
  return (
    <TvPage>
      <TvHeader variant="brand" />
      <Marker size={72}>Moments</Marker>
      <div style={{ fontSize: 34 }}>No moments found.</div>
    </TvPage>
  );
}

const ALL_FIXTURES = toPreviewFixtures(imposterPreviews);

export function MomentPlayer({
  moments = devMoments(ALL_FIXTURES),
}: MomentPlayerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    () => moments[0]?.id ?? null,
  );
  const selected =
    moments.find((moment) => moment.id === selectedId) ?? moments[0] ?? null;
  const playback = useMomentPlayback(selected?.durationMs ?? REVEAL_MS);

  function select(id: string): void {
    setSelectedId(id);
    playback.restart();
  }

  if (selected === null) return <EmptyMoments />;

  const mountKey = `${selected.id}-${playback.generation}`;
  const phones = phoneFixturesFor(selected.kind, ALL_FIXTURES);

  return (
    <TvPage>
      <TvHeader variant="brand" />
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <Marker size={64}>Moments</Marker>
        <MomentPicker
          moments={moments}
          selectedId={selected.id}
          onSelect={select}
        />
      </div>
      <PlaybackControls
        playing={playback.playing}
        elapsed={playback.elapsed}
        durationMs={selected.durationMs}
        onToggle={playback.toggle}
        onRestart={playback.restart}
        onScrub={playback.scrub}
      />
      <div style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
        <TvPreview
          fixture={selected.fixture}
          elapsedMs={playback.elapsed}
          mountKey={mountKey}
        />
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignContent: "flex-start",
            gap: 24,
            maxHeight: TV_HEIGHT * TV_SCALE,
            overflowY: "auto",
          }}
        >
          {phones.map((fixture) => (
            <PhonePreview
              key={fixture.label}
              fixture={fixture}
              elapsedMs={playback.elapsed}
              mountKey={mountKey}
            />
          ))}
        </div>
      </div>
    </TvPage>
  );
}
