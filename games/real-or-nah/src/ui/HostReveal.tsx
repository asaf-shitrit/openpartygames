// Real or Nah: the lie-by-lie TV reveal. Beat-driven, so a reconnect mid-reveal lands on the
// settled state with no replayed cues (see reveal-timeline.ts).
import { useMemo, useRef } from "react";
import type { CSSProperties, RefObject } from "react";
import type { PlayerId, PlayerSummary } from "@opg/protocol";
import type { CueId, CueOptions, ServerClock } from "@opg/ui";
import {
  anchorAt,
  Avatar,
  Card,
  FxIn,
  Highlight,
  Icon,
  Marker,
  SlamStamp,
  Stamp,
  useBeatEntries,
  useCue,
  useMoment,
} from "@opg/ui";
import { format, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import { revealDurationMs, revealPlan } from "../reveal-plan";
import type { RevealSegment } from "../reveal-plan";
import {
  planLiesOf,
  POINTS_TRUTH,
  type RonFooledLie,
  type RonHostView,
  type RonReveal,
} from "../types";
import { avatarOf, nameOf, PersonTag, PromptText } from "./common";
import { Standings } from "./Standings";
import { callout, hostRevealBeats, revealProgress } from "./reveal-timeline";
import type { LieProgress, RevealProgress } from "./reveal-timeline";

const HIDDEN: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

const STAGE: CSSProperties = {
  position: "relative",
  flexGrow: 1,
  display: "flex",
  flexDirection: "column",
  gap: 32,
  overflow: "hidden",
};

const LABEL: CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--opg-ink-secondary)",
};

function cueOptionsFor(cue: CueId): CueOptions | undefined {
  if (cue === "drumroll") return { durationMs: 1200 };
  return undefined;
}

interface LieViewData {
  optionId: string;
  index: number;
  text: string;
  authorId: PlayerId | null;
  fooledIds: PlayerId[];
  points: number;
  progress: LieProgress;
  /** Its author was kicked: `optionId` is still in the frozen plan, but not in `lies`. */
  removed: boolean;
}

function lieData(reveal: RonReveal, progress: RevealProgress): LieViewData[] {
  return progress.lies.map((p) => {
    const lie = reveal.lies.find((l) => l.optionId === p.optionId);
    return {
      optionId: p.optionId,
      index: p.index,
      text: lie?.text ?? "",
      authorId: lie?.authorId ?? null,
      fooledIds: lie?.fooledIds ?? [],
      points: lie?.points ?? 0,
      progress: p,
      removed: lie === undefined,
    };
  });
}

function activeLieIndex(
  lies: readonly LieViewData[],
  truthShown: boolean,
): number {
  if (truthShown) return -1;
  let index = -1;
  for (const lie of lies) if (lie.progress.shown) index = lie.index;
  return index;
}

function IntroHeading({ live, t }: { live: boolean; t: Dictionary }) {
  return (
    <FxIn live={live} preset="slideIn">
      <Marker size={64}>{t.realOrNah.introHeading}</Marker>
    </FxIn>
  );
}

/** "House lie" for an authorless decoy, otherwise the writer's name. */
function authorName(t: Dictionary, players: PlayerSummary[], authorId: PlayerId | null): string {
  return authorId === null ? t.realOrNah.houseLie : nameOf(players, authorId, t.common.someone);
}

function DudCard({
  lie,
  players,
  t,
}: {
  lie: RonFooledLie;
  players: PlayerSummary[];
  t: Dictionary;
}) {
  return (
    <Card
      variant="M"
      tilt={-1}
      style={{
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 30, fontWeight: 700 }}>{lie.text}</div>
      <Stamp size={28} tilt={-6}>
        {t.realOrNah.nahStamp}
      </Stamp>
      <PersonTag
        name={authorName(t, players, lie.authorId)}
        avatar={avatarOf(players, lie.authorId)}
        avatarSize={44}
        fontSize={28}
      />
    </Card>
  );
}

function DudsRow({
  reveal,
  players,
  shown,
  live,
  t,
}: {
  reveal: RonReveal;
  players: PlayerSummary[];
  shown: boolean;
  live: boolean;
  t: Dictionary;
}) {
  const duds = reveal.lies.filter((lie) => lie.fooledIds.length === 0);
  if (!shown || duds.length === 0) return null;
  return (
    <FxIn
      live={live}
      preset="tapeOn"
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
        {duds.map((lie) => (
          <DudCard key={lie.optionId} lie={lie} players={players} t={t} />
        ))}
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, color: "var(--opg-ink-secondary)" }}>
        {t.realOrNah.noneFooled}
      </div>
    </FxIn>
  );
}

function FooledAvatars({
  lie,
  players,
  compact,
  t,
}: {
  lie: LieViewData;
  players: PlayerSummary[];
  compact: boolean;
  t: Dictionary;
}) {
  if (!lie.progress.fooledShown || lie.fooledIds.length === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {lie.fooledIds.map((id) => (
        <Avatar
          key={id}
          id={avatarOf(players, id)}
          size={compact ? 32 : 48}
          alt={format(t.realOrNah.avatarAlt, { name: nameOf(players, id, t.common.someone) })}
        />
      ))}
    </div>
  );
}

function LieAuthorFooter({
  lie,
  players,
  live,
  shakeRef,
  compact,
  t,
}: {
  lie: LieViewData;
  players: PlayerSummary[];
  live: boolean;
  shakeRef: RefObject<HTMLElement | null>;
  compact: boolean;
  t: Dictionary;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <PersonTag
        name={authorName(t, players, lie.authorId)}
        avatar={avatarOf(players, lie.authorId)}
        avatarSize={compact ? 36 : 52}
        fontSize={compact ? 24 : 32}
      >
        <SlamStamp live={live} shake="small" shakeRef={shakeRef} size={compact ? 22 : 30}>
          {t.realOrNah.nahStamp}
        </SlamStamp>
      </PersonTag>
      {lie.progress.pointsShown ? (
        <Marker size={compact ? 26 : 34} color="var(--opg-marker)">
          +{lie.points.toLocaleString("en-US")}
        </Marker>
      ) : null}
    </div>
  );
}

function lieCalloutText(t: Dictionary, lie: LieViewData, voterCount: number): string | null {
  if (!lie.progress.pointsShown) return null;
  return callout(t, lie.fooledIds.length, voterCount);
}

const LIE_CARD_TRANSITION =
  "width 300ms var(--opg-ease-out), padding 300ms var(--opg-ease-out), min-width 300ms var(--opg-ease-out)";

/**
 * The size a card tweens between compact and active. Never `transform`: width, padding
 * and min-width are the properties allowed to move here (see reduced-motion.ts, which
 * shortens `transition-duration` globally).
 */
function lieCardStyle(compact: boolean): CSSProperties {
  const size = compact ? 220 : 420;
  return {
    padding: compact ? "16px 18px" : "28px 32px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    width: size,
    minWidth: size,
    transition: LIE_CARD_TRANSITION,
  };
}

function LieCardCallout({ text }: { text: string | null }) {
  if (text === null) return null;
  return (
    <div style={{ position: "absolute", top: -18, insetInlineEnd: -18 }}>
      <Stamp size={22} tilt={8}>
        {text}
      </Stamp>
    </div>
  );
}

function LieCardAuthor({
  lie,
  players,
  shakeRef,
  compact,
  t,
}: {
  lie: LieViewData;
  players: PlayerSummary[];
  shakeRef: RefObject<HTMLElement | null>;
  compact: boolean;
  t: Dictionary;
}) {
  if (!lie.progress.flipped) return null;
  return (
    <LieAuthorFooter
      lie={lie}
      players={players}
      live={lie.progress.live.author}
      shakeRef={shakeRef}
      compact={compact}
      t={t}
    />
  );
}

/** A lie whose author was kicked: `optionId` still holds its beat, with nothing to show. */
function RemovedLieCard({ compact, t }: { compact: boolean; t: Dictionary }) {
  return (
    <Card variant={compact ? "M" : "L"} tilt={compact ? 1 : -1} style={lieCardStyle(compact)}>
      <div
        style={{
          fontSize: compact ? 22 : 28,
          fontWeight: 700,
          color: "var(--opg-ink-secondary)",
        }}
      >
        {t.realOrNah.removedLie}
      </div>
    </Card>
  );
}

function LieCard({
  lie,
  compact,
  players,
  voterCount,
  shakeRef,
  t,
}: {
  lie: LieViewData;
  compact: boolean;
  players: PlayerSummary[];
  voterCount: number;
  shakeRef: RefObject<HTMLElement | null>;
  t: Dictionary;
}) {
  if (lie.removed) {
    return (
      <div style={{ position: "relative" }}>
        <RemovedLieCard compact={compact} t={t} />
      </div>
    );
  }
  return (
    <div style={{ position: "relative" }}>
      <Card variant={compact ? "M" : "L"} tilt={compact ? 1 : -1} style={lieCardStyle(compact)}>
        <div style={{ fontSize: compact ? 28 : 40, fontWeight: 700, lineHeight: 1.2 }}>
          {lie.text}
        </div>
        <FooledAvatars lie={lie} players={players} compact={compact} t={t} />
        <LieCardAuthor lie={lie} players={players} shakeRef={shakeRef} compact={compact} t={t} />
      </Card>
      <LieCardCallout text={lieCalloutText(t, lie, voterCount)} />
    </div>
  );
}

function LieStageSection({
  lies,
  truthShown,
  players,
  voterCount,
  shakeRef,
  t,
}: {
  lies: LieViewData[];
  truthShown: boolean;
  players: PlayerSummary[];
  voterCount: number;
  shakeRef: RefObject<HTMLElement | null>;
  t: Dictionary;
}) {
  const shown = lies.filter((l) => l.progress.shown);
  if (shown.length === 0) return null;
  const active = activeLieIndex(lies, truthShown);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "flex-end", gap: 28 }}>
      {shown.map((lie) => (
        <LieCard
          key={lie.optionId}
          lie={lie}
          compact={lie.index !== active}
          players={players}
          voterCount={voterCount}
          shakeRef={shakeRef}
          t={t}
        />
      ))}
    </div>
  );
}

function FindersRow({
  reveal,
  players,
  t,
}: {
  reveal: RonReveal;
  players: PlayerSummary[];
  t: Dictionary;
}) {
  if (reveal.foundByIds.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 30, fontWeight: 700, color: "var(--opg-ink-secondary)" }}>
        <Icon name="eye-off" size={30} color="var(--opg-ink-secondary)" />
        {t.realOrNah.nobodyFoundIt}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
        {reveal.foundByIds.map((id) => (
          <PersonTag
            key={id}
            name={nameOf(players, id, t.common.someone)}
            avatar={avatarOf(players, id)}
            avatarSize={56}
            fontSize={30}
          />
        ))}
      </div>
      <Marker size={30} color="var(--opg-marker)">
        {format(t.realOrNah.pointsEach, { points: POINTS_TRUTH.toLocaleString("en-US") })}
      </Marker>
    </div>
  );
}

function TruthSection({
  progress,
  reveal,
  players,
  t,
}: {
  progress: RevealProgress;
  reveal: RonReveal;
  players: PlayerSummary[];
  t: Dictionary;
}) {
  if (!progress.truthShown) return null;
  return (
    <Card
      variant="L"
      tilt={-1}
      style={{ padding: "36px 40px", display: "flex", flexDirection: "column", gap: 20, alignSelf: "center" }}
    >
      <div style={LABEL}>{t.realOrNah.theTruthLabel}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <Highlight style={{ padding: "0 16px" }}>
          <span style={{ fontSize: 96, fontWeight: 700 }}>
            {progress.truthStamped ? reveal.answer : "?"}
          </span>
        </Highlight>
        {progress.truthStamped ? (
          <SlamStamp live={progress.truthStampedLive} shake="small" size={52}>
            {t.realOrNah.realStamp}
          </SlamStamp>
        ) : null}
      </div>
      {progress.truthFindersShown ? (
        <FindersRow reveal={reveal} players={players} t={t} />
      ) : null}
      {progress.truthStamped ? (
        <div style={{ fontSize: 28, color: "var(--opg-ink-secondary)" }}>
          {format(t.realOrNah.sourceWikipedia, { title: reveal.source.title })}
        </div>
      ) : null}
    </Card>
  );
}

function StandingsSection({
  view,
  players,
  progress,
}: {
  view: RonHostView;
  players: PlayerSummary[];
  progress: RevealProgress;
}) {
  if (!progress.standingsShown) return null;
  return (
    <Standings
      players={players}
      playerIds={view.playerIds}
      totals={view.totals}
      pointsThisFact={view.pointsThisFact ?? {}}
      countReached={progress.standingsCountReached}
      countLive={progress.standingsCountLive}
      reorderReached={progress.standingsReorderReached}
    />
  );
}

export interface HostRevealProps {
  view: RonHostView;
  players: PlayerSummary[];
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
}

export function HostReveal(props: HostRevealProps) {
  const { view, players } = props;
  const { t } = useLocale();
  const reveal = view.reveal;
  const rootRef = useRef<HTMLDivElement>(null);
  // The plan is built from the frozen `planLies`, never live `fooledIds`, so a kick
  // mid-reveal can't reorder or resize the timeline (see reveal-plan.ts).
  const segments = useMemo<RevealSegment[]>(
    () => (reveal ? revealPlan({ lies: planLiesOf(reveal) }) : []),
    [reveal],
  );
  const beats = useMemo(() => hostRevealBeats(segments), [segments]);
  const duration = useMemo(
    () => (reveal ? revealDurationMs({ lies: planLiesOf(reveal) }) : 0),
    [reveal],
  );
  const startedAt = anchorAt(props.timerStartedAt, props.deadline, duration);
  const moment = useMoment(beats, startedAt, props.clock);
  const play = useCue();
  const progress = useMemo(
    () => revealProgress(segments, beats, moment),
    [segments, beats, moment],
  );

  useBeatEntries(beats, moment, (beat) => {
    if (beat.cue !== undefined) play(beat.cue, cueOptionsFor(beat.cue));
  });

  if (reveal === null) return null;

  const lies = lieData(reveal, progress);
  const announcement = progress.truthStamped
    ? format(t.realOrNah.truthAnnouncement, { answer: reveal.answer })
    : "";

  return (
    <div ref={rootRef} style={STAGE}>
      <PromptText
        prompt={view.prompt}
        style={{ fontSize: 30, fontWeight: 700, color: "var(--opg-ink-secondary)" }}
      />
      <IntroHeading live={progress.introLive} t={t} />
      <DudsRow
        reveal={reveal}
        players={players}
        shown={progress.dudsShown}
        live={progress.dudsLive}
        t={t}
      />
      <LieStageSection
        lies={lies}
        truthShown={progress.truthShown}
        players={players}
        voterCount={view.playerIds.length}
        shakeRef={rootRef}
        t={t}
      />
      <TruthSection progress={progress} reveal={reveal} players={players} t={t} />
      <StandingsSection view={view} players={players} progress={progress} />
      <output aria-live="polite" style={HIDDEN}>
        {announcement}
      </output>
    </div>
  );
}
