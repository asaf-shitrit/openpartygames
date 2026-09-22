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
import { format, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import { LAST_CHANCE_MS, POINTS_PER_WORD, type ImposterHostView } from "../state";

function findPlayer(
  players: PlayerSummary[],
  id: PlayerId | null,
): PlayerSummary | null {
  if (!id) return null;
  return players.find((player) => player.id === id) ?? null;
}

function nameOf(t: Dictionary, players: PlayerSummary[], id: PlayerId | null): string {
  return findPlayer(players, id)?.name ?? t.common.someone;
}

function avatarOf(players: PlayerSummary[], id: PlayerId | null) {
  return findPlayer(players, id)?.avatar ?? null;
}

function avatarLabel(t: Dictionary, players: PlayerSummary[], id: PlayerId | null): string {
  return format(t.imposter.avatarAlt, { name: nameOf(t, players, id) });
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
  const { t } = useLocale();
  const text = format(
    guessLength === 0 ? t.imposter.lastChance.thinking : t.imposter.lastChance.typing,
    { name: imposter },
  );
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
  const { t } = useLocale();
  const imposter = nameOf(t, players, view.imposterId);
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
        alt={avatarLabel(t, players, view.imposterId)}
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
  const { t } = useLocale();
  const imposter = nameOf(t, players, view.imposterId);
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
        <Marker size={112}>{format(t.imposter.lastChance.heading, { name: imposter })}</Marker>
        <div
          style={{
            maxWidth: 1500,
            fontSize: 44,
            fontWeight: 700,
            lineHeight: 1.25,
          }}
        >
          {format(t.imposter.lastChance.countdown, {
            seconds,
            points: money(POINTS_PER_WORD),
          })}
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
          <div style={{ fontSize: 34, ...SECONDARY }}>{t.imposter.lastChance.secondsLeft}</div>
        </div>
      </div>
    </div>
  );
}
