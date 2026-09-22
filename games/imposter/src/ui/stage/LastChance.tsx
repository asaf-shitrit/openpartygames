// No-TV stage for last-chance: blank tiles from guessLength only (the imposter's typing action
// already sends a length, never letters -- see views.ts), a draining timer, and the Suspense
// element carrying all 15 silent seconds of tension. The TV covered this moment with a drumroll
// and nothing else; on a silent phone that would read as a frozen screen without this.
import type { CSSProperties } from "react";
import type { PlayerSummary } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import { anchorAt, Card, LetterTiles, Marker, Suspense, Timer } from "@opg/ui";
import { format, useLocale } from "@opg/i18n";
import { LAST_CHANCE_MS, POINTS_PER_WORD, type ImposterHostView } from "../../state";
import { nameOf } from "./common";

function money(value: number): string {
  return value.toLocaleString("en-US");
}

const CARD_STYLE: CSSProperties = {
  padding: "22px 20px 20px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 18,
};

const RING_WRAP: CSSProperties = {
  position: "relative",
  width: 168,
  height: 168,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const TIMER_OVERLAY: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

export interface StageLastChanceProps {
  view: ImposterHostView;
  players: PlayerSummary[];
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
}

/** The stage region during last-chance: the drain everyone watches, with no letters. */
export function StageLastChance({
  view,
  players,
  deadline,
  timerStartedAt,
  clock,
}: StageLastChanceProps) {
  const { t } = useLocale();
  const imposter = nameOf(players, view.imposterId, t.common.someone);
  const guessLength = view.guessLength ?? 0;
  const startedAt = anchorAt(timerStartedAt, deadline, LAST_CHANCE_MS);
  return (
    <Card variant="M" tilt={-0.6} style={CARD_STYLE}>
      <Marker size={26} color="var(--opg-marker)">
        {format(t.imposter.lastChance.caughtStage, { name: imposter })}
      </Marker>
      <div style={RING_WRAP}>
        <Suspense
          startedAt={startedAt}
          durationMs={LAST_CHANCE_MS}
          clock={clock}
          size={168}
          variant="drain"
          label={t.imposter.lastChance.guessingEllipsis}
        />
        <div style={TIMER_OVERLAY}>
          <Timer deadline={deadline} clock={clock} size={120} startedAt={timerStartedAt} />
        </div>
      </div>
      <LetterTiles length={guessLength} live size={34} />
      <div
        style={{
          fontSize: 16,
          fontWeight: 400,
          color: "var(--opg-ink-secondary)",
          textAlign: "center",
        }}
      >
        {format(t.imposter.lastChance.stageDesc, {
          name: imposter,
          points: money(POINTS_PER_WORD),
        })}
      </div>
    </Card>
  );
}
