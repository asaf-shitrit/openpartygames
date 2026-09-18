// Real or Nah: the phone's personal reveal cards. Each card lands 200ms after its TV beat,
// buzzing once on live entry; a late mount (reconnect) shows every card reached so far in silence.
import { useMemo, useRef } from "react";
import type { PlayerId, PlayerSummary } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import {
  anchorAt,
  Confetti,
  EyesOnTv,
  Marker,
  reached,
  useBeatEntries,
  useBuzz,
  useMoment,
} from "@opg/ui";
import { revealDurationMs, revealPlan } from "../reveal-plan";
import { planLiesOf, type RonPlayerView } from "../types";
import {
  hostRevealBeats,
  personalCardBeats,
  personalRevealCards,
} from "./reveal-timeline";
import type { PersonalCard } from "./reveal-timeline";

function nameMap(players: PlayerSummary[]) {
  const map: Record<PlayerId, string> = {};
  for (const player of players) map[player.id] = player.name;
  return map;
}

/** True when `id` ranks strictly ahead of `me`: a higher total, or tied and a lower id. */
function outranks(id: PlayerId, me: PlayerId, totals: Record<PlayerId, number>): boolean {
  const value = totals[id] ?? 0;
  const myValue = totals[me] ?? 0;
  if (value !== myValue) return value > myValue;
  return id < me;
}

/** This player's 1-based rank by total score; ties broken by id for determinism. */
export function ordinalOf(totals: Record<PlayerId, number>, me: PlayerId): number {
  let rank = 1;
  for (const id of Object.keys(totals)) {
    if (id !== me && outranks(id, me, totals)) rank += 1;
  }
  return rank;
}

function ResultCard({ card, live }: { card: PersonalCard; live: boolean }) {
  return (
    <div
      style={{
        position: "relative",
        padding: "20px 18px",
        background: "var(--opg-card)",
        border: "4px solid var(--opg-ink)",
        borderRadius: "var(--opg-radius-m)",
        textAlign: "center",
      }}
    >
      {card.celebrate ? (
        <div data-testid="reveal-burst" // Decorative only. It covers the whole card, so without this it swallows taps
            // on anything underneath for as long as the celebration runs.
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 0,
              pointerEvents: "none",
            }}>
          <Confetti live={live} surface="phone" />
        </div>
      ) : null}
      <div
        data-testid="reveal-content"
        style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 8 }}
      >
        <Marker size={26}>{card.headline}</Marker>
        {card.sub ? (
          <div style={{ fontSize: 18, fontWeight: 700 }}>{card.sub}</div>
        ) : null}
      </div>
    </div>
  );
}

/** `cards` newest-first, each paired with its original index. */
function newestFirst(
  cards: readonly PersonalCard[],
): Array<{ card: PersonalCard; index: number }> {
  const ordered: Array<{ card: PersonalCard; index: number }> = [];
  for (let index = cards.length - 1; index >= 0; index -= 1) {
    const card = cards[index];
    if (card !== undefined) ordered.push({ card, index });
  }
  return ordered;
}

function CardStack({
  cards,
  currentIndex,
  live,
}: {
  cards: PersonalCard[];
  currentIndex: number;
  live: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {newestFirst(cards).map(({ card, index }) => (
        <ResultCard key={card.id} card={card} live={live && index === currentIndex} />
      ))}
    </div>
  );
}

export interface PhoneRevealProps {
  view: RonPlayerView;
  players: PlayerSummary[];
  myId: PlayerId;
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
}

export function PhoneReveal(props: PhoneRevealProps) {
  const { view, players, myId } = props;
  const reveal = view.reveal;
  const buzz = useBuzz();
  const rootRef = useRef<HTMLDivElement>(null);
  // Frozen `planLies`, matching the TV: a kick can't reorder or resize these beats.
  const segments = useMemo(
    () => (reveal ? revealPlan({ lies: planLiesOf(reveal) }) : []),
    [reveal],
  );
  const tvBeats = useMemo(() => hostRevealBeats(segments), [segments]);
  const duration = useMemo(
    () => (reveal ? revealDurationMs({ lies: planLiesOf(reveal) }) : 0),
    [reveal],
  );
  const startedAt = anchorAt(props.timerStartedAt, props.deadline, duration);
  const moment = useMoment(tvBeats, startedAt, props.clock);
  const names = useMemo(() => nameMap(players), [players]);
  const cards = useMemo(() => {
    if (!reveal) return [];
    return personalRevealCards({
      segments,
      reveal,
      me: myId,
      names,
      standingsOrdinal: ordinalOf(view.totals, myId),
      myPointsThisFact: view.myPoints ?? 0,
    });
  }, [segments, reveal, myId, names, view.totals, view.myPoints]);
  const cardBeats = useMemo(() => personalCardBeats(cards), [cards]);
  const cardMoment = useMoment(cardBeats, startedAt, props.clock);

  useBeatEntries(cardBeats, cardMoment, (beat) => {
    if (beat.haptic !== undefined) buzz(beat.haptic, rootRef.current);
  });

  if (reveal === null) return null;

  const inTruth =
    reached(moment, tvBeats, "truth-in") &&
    !reached(moment, tvBeats, "standings-in");
  const shownCards = cards.slice(0, cardMoment.index + 1);

  return (
    <div ref={rootRef} style={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
      {shownCards.length === 0 ? (
        <EyesOnTv
          title="Eyes on the TV"
          detail={inTruth ? "Here it comes…" : "The votes are being read…"}
          tempo={inTruth ? "fast" : "slow"}
        />
      ) : (
        <CardStack cards={shownCards} currentIndex={cardMoment.index} live={cardMoment.live} />
      )}
    </div>
  );
}
