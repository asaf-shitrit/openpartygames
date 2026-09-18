// Phone reveal: the same beats as the TV, held back until 200ms after the TV's big beat. A
// teaser buzzes a heartbeat until then, then the personal result lands with its own buzz. In
// a no-TV room the stage above carries the ceremony itself, so there is no TV to follow: the
// personal line lands with the stage's own verdict instead.
import { useRef } from "react";
import type { RefObject } from "react";
import type { PlayerSummary } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import {
  anchorAt,
  Avatar,
  Card,
  EyesOnTv,
  Marker,
  PhoneStrip,
  reached,
  StickerBurst,
  Timer,
  useBeatEntries,
  useBuzz,
  useMoment,
} from "@opg/ui";
import { REVEAL_MS, type ImposterHostView, type ImposterPlayerView } from "../state";
import {
  phoneRevealBeats,
  personalReveal,
  revealRole,
} from "./reveal-timeline";
import type { PersonalReveal } from "./reveal-timeline";
import { StageReveal } from "./stage/Reveal";
import { avatarOf, nameOf } from "./stage/common";

function ResultCard({
  view,
  players,
  personal,
  live,
  cardRef,
}: {
  view: ImposterPlayerView;
  players: PlayerSummary[];
  personal: PersonalReveal;
  live: boolean;
  cardRef: RefObject<HTMLDivElement | null>;
}) {
  const imposter = nameOf(players, view.imposterId);
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
        }}
      >
        {personal.celebrate ? (
          <div
            data-testid="reveal-burst"
            // Decorative only. It covers the whole card, so without this it swallows taps
            // on anything underneath for as long as the celebration runs.
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 0,
              pointerEvents: "none",
            }}
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
          <Avatar
            id={avatarOf(players, view.imposterId)}
            size={120}
            alt={`${imposter}'s avatar`}
          />
          <Marker size={30}>{personal.headline}</Marker>
          <div style={{ fontSize: 19, fontWeight: 700 }}>{personal.sub}</div>
        </div>
      </Card>
    </div>
  );
}

/** Stage region above the controls: the room's ceremony, only in a no-TV room. */
function StageArea({
  stage,
  players,
  deadline,
  timerStartedAt,
  clock,
}: {
  stage: ImposterHostView | null;
  players: PlayerSummary[];
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
}) {
  if (stage === null) return null;
  return (
    <StageReveal
      view={stage}
      players={players}
      deadline={deadline}
      timerStartedAt={timerStartedAt}
      clock={clock}
    />
  );
}

/** Controls region before the personal result lands: TV mode waits on the TV; a no-TV room
 * already shows the ceremony on its own stage above, so there is nothing extra to say here. */
function Waiting({ noTv, suspense }: { noTv: boolean; suspense: boolean }) {
  if (noTv) return null;
  return (
    <EyesOnTv
      title="Eyes on the TV"
      detail={suspense ? "Here it comes…" : "The votes are in…"}
      tempo={suspense ? "fast" : "slow"}
    />
  );
}

export interface PhoneRevealProps {
  view: ImposterPlayerView;
  players: PlayerSummary[];
  me: PlayerSummary | null;
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
  /** The host view, in a no-TV room only; the stage carries the ceremony this phone stages. */
  stage: ImposterHostView | null;
}

export function PhoneReveal(props: PhoneRevealProps) {
  const { view, players, me, stage } = props;
  const caught = view.caught === true;
  const role = revealRole(view.imposterId, me?.id ?? "", view.myVote);
  const imposter = nameOf(players, view.imposterId);
  const personal = personalReveal(caught, role, imposter);
  // No TV to follow in a no-TV room: the stage's verdict and this line land together.
  const beats = phoneRevealBeats(caught, personal.haptic, stage === null ? undefined : 0);
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
        gameName="Imposter"
        progress="The votes are in"
        right={<Timer deadline={props.deadline} clock={props.clock} />}
      />
      <StageArea
        stage={stage}
        players={players}
        deadline={props.deadline}
        timerStartedAt={props.timerStartedAt}
        clock={props.clock}
      />
      {personalReached ? (
        <ResultCard
          view={view}
          players={players}
          personal={personal}
          live={moment.live}
          cardRef={cardRef}
        />
      ) : (
        <Waiting noTv={stage !== null} suspense={suspense} />
      )}
    </>
  );
}
