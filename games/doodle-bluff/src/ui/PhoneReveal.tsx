// Phone reveal: a personal result card, held back behind the TV's beat. In a no-TV room there
// is no TV, so the phone stages the whole storyboard itself by reusing HostReveal on the stage
// view (plan/0003-doodle-bluff.md, "No-TV mode").
import { useRef } from "react";
import type { PlayerId, PlayerSummary } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import { anchorAt, Card, EyesOnTv, formatPoints, Marker, reached, StickerBurst, useBeatEntries, useBuzz, useMoment } from "@opg/ui";
import { format, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import { REVEAL_MS, type DoodleHostView, type DoodlePlayerView } from "../state";
import { HostReveal } from "./HostReveal";
import type { PersonalReveal } from "./reveal-timeline";
import { personalReveal, phoneRevealBeats } from "./reveal-timeline";

function buildPersonal(t: Dictionary, view: DoodlePlayerView): PersonalReveal {
  const reveal = view.reveal;
  return personalReveal(t, {
    isArtist: view.isArtist,
    myVote: view.myVote,
    truthOptionId: reveal?.truthOptionId ?? "",
    myPoints: view.myPoints,
    foundByCount: reveal?.foundByIds.length ?? 0,
  });
}

function ResultCard({ personal, live, total, t }: { personal: PersonalReveal; live: boolean; total: number; t: Dictionary }) {
  return (
    <div style={{ flexGrow: 1, minWidth: 0, display: "flex" }}>
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
          position: "relative",
        }}
      >
        {personal.celebrate ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 0,
              pointerEvents: "none",
              // Stickers fly wider than the card. Without this the page itself grows with
              // them and the phone scrolls sideways mid-celebration.
              overflow: "hidden",
            }}
          >
            <StickerBurst live={live} count={14} size={340} />
          </div>
        ) : null}
        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <Marker size={30}>{personal.headline}</Marker>
          <div style={{ fontSize: 19, fontWeight: 700 }}>{personal.sub}</div>
          <div style={{ fontSize: 17, color: "var(--opg-ink-secondary)" }}>{format(t.doodleBluff.totalPoints, { points: formatPoints(total) })}</div>
        </div>
      </Card>
    </div>
  );
}

function Waiting({ suspense, t }: { suspense: boolean; t: Dictionary }) {
  return (
    <div style={{ minWidth: 0, width: "100%" }}>
      <EyesOnTv
        detail={suspense ? t.doodleBluff.hereItComes : t.doodleBluff.votesAreIn}
        tempo={suspense ? "fast" : "slow"}
      />
    </div>
  );
}

export interface PhoneRevealProps {
  view: DoodlePlayerView;
  players: PlayerSummary[];
  me: PlayerId;
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
  /** The host view, in a no-TV room only; null in a room with a shared screen. */
  stage: DoodleHostView | null;
}

export function PhoneReveal({ view, players, me, deadline, timerStartedAt, clock, stage }: PhoneRevealProps) {
  if (stage !== null) {
    return <HostReveal view={stage} players={players} deadline={deadline} timerStartedAt={timerStartedAt} clock={clock} />;
  }
  return <TvFollowingReveal view={view} me={me} deadline={deadline} timerStartedAt={timerStartedAt} clock={clock} />;
}

function TvFollowingReveal({
  view,
  me,
  deadline,
  timerStartedAt,
  clock,
}: {
  view: DoodlePlayerView;
  me: PlayerId;
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
}) {
  const { t } = useLocale();
  const personal = buildPersonal(t, view);
  const beats = phoneRevealBeats(personal.haptic);
  const startedAt = anchorAt(timerStartedAt, deadline, REVEAL_MS);
  const moment = useMoment(beats, startedAt, clock);
  const buzz = useBuzz();
  const cardRef = useRef<HTMLDivElement>(null);
  const suspense = reached(moment, beats, "titles");
  const personalReached = reached(moment, beats, "personal");

  useBeatEntries(beats, moment, (beat) => {
    if (beat.haptic === undefined) return;
    buzz(beat.haptic, cardRef.current);
  });

  return (
    <div ref={cardRef} style={{ flexGrow: 1, minWidth: 0, display: "flex" }}>
      {personalReached ? (
        <ResultCard personal={personal} live={moment.live} total={view.totals[me] ?? 0} t={t} />
      ) : (
        <Waiting suspense={suspense} t={t} />
      )}
    </div>
  );
}
