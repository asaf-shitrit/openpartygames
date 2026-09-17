// Phone reveal: the same beats as the TV, held back until 200ms after the TV's verdict.
// A teaser stays up until then, then the personal result lands with its own buzz.
import { useRef } from "react";
import type { RefObject } from "react";
import type { PlayerId, PlayerSummary } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import {
  anchorAt,
  Card,
  EyesOnTv,
  formatPoints,
  Marker,
  PhoneStrip,
  reached,
  StickerBurst,
  Timer,
  useBeatEntries,
  useBuzz,
  useMoment,
} from "@opg/ui";
import {
  REVEAL_MS,
  type MltOutcome,
  type MltPlayerView,
  type MltReveal,
} from "../state";
import { nameOf, PromptLine } from "./common";
import { personalReveal, phoneRevealBeats } from "./reveal-timeline";
import type { PersonalReveal } from "./reveal-timeline";

function ResultCard({
  personal,
  live,
  totals,
  me,
  cardRef,
}: {
  personal: PersonalReveal;
  live: boolean;
  totals: Record<string, number>;
  me: PlayerId;
  cardRef: RefObject<HTMLDivElement | null>;
}) {
  const total = totals[me] ?? 0;
  return (
    <div ref={cardRef} style={{ flexGrow: 1, display: "flex" }}>
      <Card
        variant="L"
        tilt={-1}
        style={{
          flexGrow: 1,
          padding: "28px 22px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          textAlign: "center",
          position: "relative",
        }}
      >
        {personal.celebrate ? (
          <div
            data-testid="reveal-burst"
            style={{ position: "absolute", inset: 0, zIndex: 0 }}
          >
            <StickerBurst live={live} count={14} size={340} />
          </div>
        ) : null}
        <div
          data-testid="reveal-content"
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <Marker size={30}>{personal.headline}</Marker>
          <div style={{ fontSize: 19, fontWeight: 700 }}>{personal.sub}</div>
          <div style={{ fontSize: 17, color: "var(--opg-ink-secondary)" }}>
            {formatPoints(total)} total
          </div>
        </div>
      </Card>
    </div>
  );
}

/** Stands in for a reveal that has not reached this phone yet: reads as "no votes". */
const NO_REVEAL: MltReveal = {
  playerIds: [],
  tally: {},
  outcome: { kind: "no-votes" },
  matchedIds: [],
};

function pickedIdOf(outcome: MltOutcome): PlayerId | null {
  return outcome.kind === "picked" ? outcome.pickedId : null;
}

/** This phone's personal reveal card, built from the frozen reveal. */
function buildPersonal(
  view: MltPlayerView,
  players: PlayerSummary[],
  meId: PlayerId,
): PersonalReveal {
  const reveal = view.reveal ?? NO_REVEAL;
  const pickedId = pickedIdOf(reveal.outcome);
  return personalReveal({
    outcome: reveal.outcome,
    me: meId,
    myVote: view.myVote,
    matched: reveal.matchedIds.includes(meId),
    pickedName: pickedId === null ? null : nameOf(players, pickedId),
  });
}

export interface PhoneRevealProps {
  view: MltPlayerView;
  players: PlayerSummary[];
  me: PlayerSummary | null;
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
}

export function PhoneReveal(props: PhoneRevealProps) {
  const { view, players, me } = props;
  const meId = me?.id ?? "";
  const personal = buildPersonal(view, players, meId);
  const beats = phoneRevealBeats(personal.haptic);
  const startedAt = anchorAt(props.timerStartedAt, props.deadline, REVEAL_MS);
  const moment = useMoment(beats, startedAt, props.clock);
  const buzz = useBuzz();
  const cardRef = useRef<HTMLDivElement>(null);
  const suspense = reached(moment, beats, "suspense");
  const personalReached = reached(moment, beats, "personal");

  useBeatEntries(beats, moment, (beat) => {
    if (beat.haptic === undefined) return;
    buzz(beat.haptic, cardRef.current);
  });

  return (
    <>
      <PhoneStrip
        gameName="Most Likely To"
        progress="Here comes the verdict"
        right={<Timer deadline={props.deadline} clock={props.clock} />}
      />
      {personalReached ? (
        <ResultCard
          personal={personal}
          live={moment.live}
          totals={view.totals}
          me={meId}
          cardRef={cardRef}
        />
      ) : (
        <>
          <PromptLine prompt={view.prompt} size={20} />
          <EyesOnTv
            title="Eyes on the TV"
            detail={suspense ? "Here it comes…" : "The votes are in…"}
            tempo={suspense ? "fast" : "slow"}
          />
        </>
      )}
    </>
  );
}
