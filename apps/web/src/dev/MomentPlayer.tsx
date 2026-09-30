// /dev/moments — replay each game's reveal, last-chance, result and gallery previews on a
// scrubbable fake clock. Dev-only.
//
// A game opts in by exporting a `PreviewMoment` list from its `preview.ts`, naming previews by
// label; the player renders them through the same registry the rooms use.
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button, Chip, Marker, TvHeader } from "@opg/ui";
import type { PreviewMoment, ServerClock } from "@opg/ui";
import { doodleBluffMoments, doodleBluffPreviews } from "@opg/game-doodle-bluff/preview";
import { imposterMoments, imposterPreviews } from "@opg/game-imposter/preview";
import {
  mostLikelyToMoments,
  mostLikelyToPreviews,
} from "@opg/game-most-likely-to/preview";
import { realOrNahMoments, realOrNahPreviews } from "@opg/game-real-or-nah/preview";
import { gameUiFor } from "../games";
import { TvPage } from "../screens/shared";
import { casesFor } from "./screens";
import type { HostCase, PhoneCase, PreviewEntry, ScreenCase } from "./screens";

/** One game's previews and the moments it builds from them. */
export interface MomentSource {
  gameId: string;
  previews: readonly PreviewEntry[];
  moments: readonly PreviewMoment[];
}

export const MOMENT_SOURCES: readonly MomentSource[] = [
  { gameId: "imposter", previews: imposterPreviews, moments: imposterMoments },
  { gameId: "real-or-nah", previews: realOrNahPreviews, moments: realOrNahMoments },
  { gameId: "most-likely-to", previews: mostLikelyToPreviews, moments: mostLikelyToMoments },
  { gameId: "doodle-bluff", previews: doodleBluffPreviews, moments: doodleBluffMoments },
];

export interface DevMoment {
  /** Stable id: the game and the host preview's label. */
  id: string;
  gameId: string;
  /** Short chip copy: "caught", "wrong", "typing", "got it"… */
  chip: string;
  host: HostCase;
  phones: PhoneCase[];
  noTvPhones: PhoneCase[];
  /** This moment's own phase length, in ms. */
  durationMs: number;
}

const TV_WIDTH = 1920;
const TV_HEIGHT = 1080;
const TV_SCALE = 0.5;
const PHONE_WIDTH = 390;
const PHONE_HEIGHT = 844;
const PHONE_SCALE = 0.45;
const TICK_MS = 100;

function hostCaseOf(cases: ReadonlyMap<string, ScreenCase>, label: string): HostCase | null {
  const found = cases.get(label);
  return found?.kind === "game" && found.surface === "host" ? found : null;
}

function isPhoneCase(found: ScreenCase | undefined): found is PhoneCase {
  return found?.kind === "game" && found.surface === "phone";
}

function phoneCasesOf(cases: ReadonlyMap<string, ScreenCase>, labels: readonly string[]): PhoneCase[] {
  return labels.map((label) => cases.get(label)).filter(isPhoneCase);
}

/** One DevMoment per moment whose host preview exists, in the game's order. */
export function devMomentsFor(source: MomentSource): DevMoment[] {
  const cases = new Map(
    casesFor(source.gameId, source.previews).map((found) => [found.label, found]),
  );
  const moments: DevMoment[] = [];
  for (const moment of source.moments) {
    const host = hostCaseOf(cases, moment.host);
    if (host === null) continue;
    moments.push({
      id: `${source.gameId}/${moment.host}`,
      gameId: source.gameId,
      chip: moment.chip,
      host,
      phones: phoneCasesOf(cases, moment.phones),
      noTvPhones: phoneCasesOf(cases, moment.noTvPhones),
      durationMs: moment.durationMs,
    });
  }
  return moments;
}

/** Every game's moments, game by game. */
export function devMoments(sources: readonly MomentSource[] = MOMENT_SOURCES): DevMoment[] {
  return sources.flatMap(devMomentsFor);
}

/** The games with at least one moment, in first-seen order. */
export function momentGameIds(moments: readonly DevMoment[]): string[] {
  return [...new Set(moments.map((moment) => moment.gameId))];
}

/** The moment's clock anchor: `timerStartedAt`, or the fixture's server clock. */
export function anchorFor(fixture: HostCase | PhoneCase): number {
  return fixture.room.game?.timerStartedAt ?? fixture.room.serverNow;
}

function deadlineOf(fixture: HostCase | PhoneCase): number | null {
  return fixture.room.game?.deadline ?? null;
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

function Missing({ gameId }: { gameId: string }) {
  return <div style={{ fontSize: 24 }}>No UI registered for {gameId}</div>;
}

interface FrameProps {
  /** Which column the frame sits in; tests count frames by it. */
  surface: "tv" | "phone" | "no-tv";
  width: number;
  height: number;
  scale: number;
  radius: number;
  border: string;
  gridClass: string;
  children: ReactNode;
}

/** A surface drawn at its real size and scaled down into the column. */
function Frame({ surface, width, height, scale, radius, border, gridClass, children }: FrameProps) {
  return (
    <div
      data-surface={surface}
      style={{
        width: width * scale,
        height: height * scale,
        overflow: "hidden",
        border: `4px solid ${border}`,
        borderRadius: radius,
        flexShrink: 0,
      }}
    >
      <div
        className={`opg-root ${gridClass}`}
        style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
        {children}
      </div>
    </div>
  );
}

interface SurfaceProps {
  gameId: string;
  elapsedMs: number;
  mountKey: string;
}

function TvPreview({ gameId, fixture, elapsedMs, mountKey }: SurfaceProps & { fixture: HostCase }) {
  const Ui = gameUiFor(gameId);
  const clock: ServerClock = { now: () => anchorFor(fixture) + elapsedMs };
  return (
    <Frame
      surface="tv"
      width={TV_WIDTH}
      height={TV_HEIGHT}
      scale={TV_SCALE}
      radius={14}
      border="var(--opg-ink)"
      gridClass="opg-grid-tv"
    >
      {Ui === null ? (
        <Missing gameId={gameId} />
      ) : (
        <Ui.Host
          key={mountKey}
          view={fixture.view}
          room={fixture.room}
          deadline={deadlineOf(fixture)}
          timerStartedAt={anchorFor(fixture)}
          clock={clock}
        />
      )}
    </Frame>
  );
}

interface PhonePreviewProps extends SurfaceProps {
  fixture: PhoneCase;
  /** The host preview a no-TV phone stages, or null beside a shared screen. */
  staged: HostCase | null;
}

/** A phone, beside the TV (`stage` null) or on its own with the host view staged above it --
 * exactly what a real no-TV room sends, per `def.hostView(state, ctx)` (plan/0004-no-tv-mode.md §1). */
function PhonePreview({ gameId, fixture, staged, elapsedMs, mountKey }: PhonePreviewProps) {
  const Ui = gameUiFor(gameId);
  const noTv = staged !== null;
  const clock: ServerClock = { now: () => anchorFor(fixture) + elapsedMs };
  return (
    <Frame
      surface={noTv ? "no-tv" : "phone"}
      width={PHONE_WIDTH}
      height={PHONE_HEIGHT}
      scale={PHONE_SCALE}
      radius={18}
      border={noTv ? "var(--opg-marker)" : "var(--opg-ink)"}
      gridClass="opg-grid-phone"
    >
      {Ui === null ? (
        <Missing gameId={gameId} />
      ) : (
        <Ui.Phone
          key={mountKey}
          view={fixture.view}
          room={fixture.room}
          stage={staged?.view ?? null}
          deadline={deadlineOf(fixture)}
          timerStartedAt={anchorFor(fixture)}
          clock={clock}
          send={ignoreAction}
        />
      )}
    </Frame>
  );
}

function Column({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{title}</div>
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
        {children}
      </div>
    </div>
  );
}

interface MomentColumnsProps {
  selected: DevMoment;
  playback: Playback;
  mountKey: string;
}

/** The TV, shared-screen-phone and no-TV-phone columns for the selected moment. */
function MomentColumns({ selected, playback, mountKey }: MomentColumnsProps) {
  const surface = { gameId: selected.gameId, elapsedMs: playback.elapsed, mountKey };
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
      <Column title="TV">
        <TvPreview {...surface} fixture={selected.host} />
      </Column>
      <Column title="Phones (shared screen)">
        {selected.phones.map((fixture) => (
          <PhonePreview key={fixture.id} {...surface} fixture={fixture} staged={null} />
        ))}
      </Column>
      <Column title="Phones (no TV)">
        {selected.noTvPhones.map((fixture) => (
          <PhonePreview key={fixture.id} {...surface} fixture={fixture} staged={selected.host} />
        ))}
      </Column>
    </div>
  );
}

function PickerChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="opg-reset"
      aria-pressed={selected}
      onClick={onClick}
      style={{ background: "none", border: "none", padding: 0 }}
    >
      <Chip
        height={48}
        fontSize={24}
        style={{ background: selected ? "var(--opg-highlight)" : undefined }}
      >
        {selected ? "✓ " : ""}
        {label}
      </Chip>
    </button>
  );
}

function ChipRow({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
      {children}
    </div>
  );
}

interface PickerProps {
  moments: readonly DevMoment[];
  selected: DevMoment;
  onSelect: (id: string) => void;
}

/** One chip per game; picking one jumps to that game's first moment. */
function GamePicker({ moments, selected, onSelect }: PickerProps) {
  return (
    <ChipRow>
      {momentGameIds(moments).map((gameId) => (
        <PickerChip
          key={gameId}
          label={gameId}
          selected={gameId === selected.gameId}
          onClick={() => {
            const first = moments.find((moment) => moment.gameId === gameId);
            if (first !== undefined) onSelect(first.id);
          }}
        />
      ))}
    </ChipRow>
  );
}

/** One chip per moment of the selected game. */
function MomentPicker({ moments, selected, onSelect }: PickerProps) {
  return (
    <ChipRow>
      {moments
        .filter((moment) => moment.gameId === selected.gameId)
        .map((moment) => (
          <PickerChip
            key={moment.id}
            label={moment.chip}
            selected={moment.id === selected.id}
            onClick={() => onSelect(moment.id)}
          />
        ))}
    </ChipRow>
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
  /** Moments in the picker. Defaults to every game's `preview.ts` moments. */
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

const ALL_MOMENTS = devMoments();

export function MomentPlayer({ moments = ALL_MOMENTS }: MomentPlayerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    () => moments[0]?.id ?? null,
  );
  const selected =
    moments.find((moment) => moment.id === selectedId) ?? moments[0] ?? null;
  const playback = useMomentPlayback(selected?.durationMs ?? 0);

  function select(id: string): void {
    setSelectedId(id);
    playback.restart();
  }

  if (selected === null) return <EmptyMoments />;

  const mountKey = `${selected.id}-${playback.generation}`;

  return (
    <TvPage gap={20}>
      <TvHeader variant="brand" />
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <Marker size={56}>Moments</Marker>
        <GamePicker moments={moments} selected={selected} onSelect={select} />
      </div>
      <MomentPicker moments={moments} selected={selected} onSelect={select} />
      <PlaybackControls
        playing={playback.playing}
        elapsed={playback.elapsed}
        durationMs={selected.durationMs}
        onToggle={playback.toggle}
        onRestart={playback.restart}
        onScrub={playback.scrub}
      />
      <MomentColumns selected={selected} playback={playback} mountKey={mountKey} />
    </TvPage>
  );
}
