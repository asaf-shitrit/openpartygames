// Phone's personal result after a word: the guess, the crew word, and the running total.
// Held back until 200ms after the TV's own big beat, same as the reveal. In a no-TV room the
// stage above already carries the ceremony, so there is no TV to follow: the personal line
// lands with the stage's own verdict instead.
import { useRef } from "react";
import type { RefObject } from "react";
import type { PlayerId, PlayerSummary } from "@opg/protocol";
import type { Beat, Moment, ServerClock } from "@opg/ui";
import {
  anchorAt,
  Card,
  Confetti,
  CountUp,
  EyesOnTv,
  Highlight,
  Marker,
  PhoneStrip,
  reached,
  Timer,
  useBeatEntries,
  useBuzz,
  useMoment,
} from "@opg/ui";
import { format, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import { resultDurationMs } from "../state";
import type { ImposterHostView, ImposterPlayerView } from "../state";
import {
  personalResult,
  phoneResultBeats,
  resultPath,
} from "./result-timeline";
import type { PersonalResult, ResultPath } from "./result-timeline";
import type { SectionProps } from "./Phone";
import { StageResult } from "./stage/Result";

function findPlayer(
  players: PlayerSummary[],
  id: PlayerId | null,
): PlayerSummary | null {
  if (!id) return null;
  return players.find((player) => player.id === id) ?? null;
}

function nameOf(players: PlayerSummary[], id: PlayerId | null, someone: string): string {
  return findPlayer(players, id)?.name ?? someone;
}

/** Whether this phone's owner voted for the imposter. */
function votedImposter(view: ImposterPlayerView): boolean {
  return view.imposterId !== null && view.myVote === view.imposterId;
}

/** The teaser shown before the personal beat lands. */
function preResultTitle(
  t: Dictionary,
  path: ResultPath,
  isImposter: boolean,
  guesserName: string,
): string {
  const r = t.imposter.result;
  if (path === "escaped") return r.preImposterGotAway;
  if (isImposter) return r.preYourGuessIn;
  return format(r.preNameGuessed, { name: guesserName });
}

function PreResult({
  path,
  isImposter,
  guesserName,
}: {
  path: ResultPath;
  isImposter: boolean;
  guesserName: string;
}) {
  const { t } = useLocale();
  return (
    <EyesOnTv
      title={preResultTitle(t, path, isImposter, guesserName)}
      tempo={path === "caught" ? "fast" : "slow"}
    />
  );
}

interface ResultCardProps {
  personal: PersonalResult;
  crewWord: string | null;
  live: boolean;
  cardRef: RefObject<HTMLDivElement | null>;
}

/** The burst renders behind the text: a wrapper at z-index 0, content at z-index 1. */
function ResultCard({ personal, crewWord, live, cardRef }: ResultCardProps) {
  const { t } = useLocale();
  return (
    <div ref={cardRef} style={{ flexGrow: 1, minWidth: 0, display: "flex" }}>
      <Card
        variant="L"
        tilt={-1}
        style={{
          flexGrow: 1,
          minWidth: 0,
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
            data-testid="result-burst"
            // Decorative only. It covers the whole card, so without this it swallows taps
            // on anything underneath for as long as the celebration runs.
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 0,
              pointerEvents: "none",
              // Confetti flies wider than the card. Without this the page itself grows with it
              // and the phone scrolls sideways mid-celebration.
              overflow: "hidden",
            }}
          >
            <Confetti live={live} surface="phone" />
          </div>
        ) : null}
        <div
          data-testid="result-content"
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
          {crewWord === null ? null : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
              }}
            >
              <div style={{ fontSize: 17 }}>{t.imposter.result.crewWordWas}</div>
              <Highlight style={{ maxWidth: "100%", padding: "0 10px" }}>
                <Marker size={32} style={{ overflowWrap: "anywhere" }}>
                  {crewWord}
                </Marker>
              </Highlight>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function TotalCard({ from, to, live }: { from: number; to: number; live: boolean }) {
  const { t } = useLocale();
  return (
    <Card
      variant="M"
      tilt={1}
      style={{
        padding: "16px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700 }}>{t.imposter.result.yourTotal}</div>
      <CountUp
        from={from}
        to={to}
        live={live}
        style={{ fontSize: 26, fontWeight: 700 }}
      />
    </Card>
  );
}

/** This phone owner's points for the word, or 0 when the view hasn't settled that yet. */
function myPointsFor(view: ImposterPlayerView): number {
  return view.myPoints ?? 0;
}

/** This phone owner's running total, or 0 for a spectator with no seat in `totals`. */
function myTotal(
  view: ImposterPlayerView,
  me: PlayerSummary | null,
): number {
  return view.totals[me?.id ?? ""] ?? 0;
}

/** Buzzes (with a pulse on the card) the moment a beat carrying a haptic is entered live. */
function useResultBuzz(
  beats: readonly Beat[],
  moment: Moment,
  cardRef: RefObject<HTMLDivElement | null>,
): void {
  const buzz = useBuzz();
  useBeatEntries(beats, moment, (beat) => {
    if (beat.haptic === undefined) return;
    buzz(beat.haptic, cardRef.current);
  });
}

/** Stage region above the controls: the word's outcome and standings, only in a no-TV room. */
function StageArea({
  stage,
  players,
  me,
  deadline,
  timerStartedAt,
  clock,
}: {
  stage: ImposterHostView | null;
  players: PlayerSummary[];
  me: PlayerId | null;
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
}) {
  if (stage === null) return null;
  return (
    <StageResult
      view={stage}
      players={players}
      me={me}
      deadline={deadline}
      timerStartedAt={timerStartedAt}
      clock={clock}
    />
  );
}

export interface PhoneResultProps extends SectionProps {
  progress: string;
}

export function PhoneResult(props: PhoneResultProps) {
  const { t } = useLocale();
  const { view, players, me, deadline, timerStartedAt, clock, progress, stage } =
    props;
  const path = resultPath(view.caught);
  const isImposter = view.role === "imposter";
  const myPoints = myPointsFor(view);
  const personal = personalResult(t, {
    path,
    isImposter,
    votedImposter: votedImposter(view),
    guessCorrect: view.guessCorrect,
    myPoints,
    crewWord: view.crewWord,
  });
  // No TV to follow in a no-TV room: the stage's verdict and this line land together.
  const beats = phoneResultBeats(path, personal.haptic, stage === null ? undefined : 0);
  const startedAt = anchorAt(
    timerStartedAt,
    deadline,
    resultDurationMs(view.caught),
  );
  const moment = useMoment(beats, startedAt, clock);
  const cardRef = useRef<HTMLDivElement>(null);
  const personalReached = reached(moment, beats, "personal");
  const countReached = reached(moment, beats, "count");
  useResultBuzz(beats, moment, cardRef);
  const total = myTotal(view, me);

  return (
    <>
      <PhoneStrip
        gameName={t.imposter.title}
        progress={progress}
        right={<Timer deadline={deadline} clock={clock} />}
      />
      <StageArea
        stage={stage}
        players={players}
        me={me?.id ?? null}
        deadline={deadline}
        timerStartedAt={timerStartedAt}
        clock={clock}
      />
      {personalReached ? (
        <ResultCard
          personal={personal}
          crewWord={view.crewWord}
          live={moment.live}
          cardRef={cardRef}
        />
      ) : (
        <PreResult
          path={path}
          isImposter={isImposter}
          guesserName={nameOf(players, view.imposterId, t.common.someone)}
        />
      )}
      {countReached ? (
        <TotalCard
          from={total - myPoints}
          to={total}
          live={moment.live}
        />
      ) : null}
    </>
  );
}

