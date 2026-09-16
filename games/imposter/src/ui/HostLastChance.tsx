// TV last-chance: the imposter's guess row grows and shrinks as they type, without ever
// showing the letters. Mirrors the crew's "eyes on the TV" wait with a scratch/pop sound cue.
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { PlayerId, PlayerSummary } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import {
  Avatar,
  LetterTiles,
  Marker,
  Timer,
  useCue,
  useMusic,
} from "@opg/ui";
import { LAST_CHANCE_MS, POINTS_PER_WORD, type ImposterHostView } from "../state";

function findPlayer(
  players: PlayerSummary[],
  id: PlayerId | null,
): PlayerSummary | null {
  if (!id) return null;
  return players.find((player) => player.id === id) ?? null;
}

function nameOf(players: PlayerSummary[], id: PlayerId | null): string {
  const player = findPlayer(players, id);
  if (player) return player.name;
  return id ?? "Someone";
}

function avatarOf(players: PlayerSummary[], id: PlayerId | null) {
  return findPlayer(players, id)?.avatar ?? null;
}

function avatarLabel(players: PlayerSummary[], id: PlayerId | null): string {
  return `${nameOf(players, id)}'s avatar`;
}

function money(value: number): string {
  return value.toLocaleString("en-US");
}

const SECONDARY: CSSProperties = {
  fontWeight: 700,
  color: "var(--opg-ink-secondary)",
};

interface GuessLengthState {
  value: number;
  previous: number;
}

/** Plays scratch when the guess grows, a soft pop when it shrinks. Never fires on mount. */
function useGuessLengthSound(guessLength: number): void {
  const play = useCue();
  const [state, setState] = useState<GuessLengthState>({
    value: guessLength,
    previous: guessLength,
  });
  if (state.value !== guessLength) {
    setState({ value: guessLength, previous: state.value });
  }
  useEffect(() => {
    if (state.value === state.previous) return;
    if (state.value > state.previous) play("scratch");
    else play("pop", { gain: 0.5 });
  }, [state, play]);
}

function TypingStatus({
  imposter,
  guessLength,
}: {
  imposter: string;
  guessLength: number;
}) {
  const text =
    guessLength === 0 ? `${imposter} is thinking…` : `${imposter} is typing…`;
  return <div style={{ fontSize: 40, fontWeight: 700 }}>{text}</div>;
}

function TypingCard({
  view,
  players,
  guessLength,
}: {
  view: ImposterHostView;
  players: PlayerSummary[];
  guessLength: number;
}) {
  const imposter = nameOf(players, view.imposterId);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 18,
      }}
    >
      <Avatar
        id={avatarOf(players, view.imposterId)}
        size={220}
        alt={avatarLabel(players, view.imposterId)}
      />
      <TypingStatus imposter={imposter} guessLength={guessLength} />
      <LetterTiles length={guessLength} live size={64} />
    </div>
  );
}

export interface HostLastChanceProps {
  view: ImposterHostView;
  players: PlayerSummary[];
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
}

export function HostLastChance({
  view,
  players,
  deadline,
  timerStartedAt,
  clock,
}: HostLastChanceProps) {
  const imposter = nameOf(players, view.imposterId);
  const guessLength = view.guessLength ?? 0;
  const seconds = Math.round(LAST_CHANCE_MS / 1000);
  useGuessLengthSound(guessLength);
  useMusic("tension");
  return (
    <div
      style={{
        flexGrow: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 48,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          textAlign: "center",
        }}
      >
        <Marker size={112}>Last chance, {imposter}!</Marker>
        <div
          style={{
            maxWidth: 1500,
            fontSize: 44,
            fontWeight: 700,
            lineHeight: 1.25,
          }}
        >
          {seconds} seconds to guess the crew&apos;s word. A right guess steals{" "}
          {money(POINTS_PER_WORD)} points.
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 140,
        }}
      >
        <TypingCard view={view} players={players} guessLength={guessLength} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <Timer
            deadline={deadline}
            clock={clock}
            size={260}
            startedAt={timerStartedAt}
            ticks
          />
          <div style={{ fontSize: 34, ...SECONDARY }}>Seconds left</div>
        </div>
      </div>
    </div>
  );
}
