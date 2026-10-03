// Real or Nah: the lie-by-lie TV reveal. Beat-driven, so a reconnect mid-reveal lands on the
// settled state with no replayed cues (see reveal-timeline.ts).
//
// Composition follows design/TVRealOrNahReveal.dc.html: the fact on the left, the lies as an
// aligned table on the right. Two things about the timeline shape it, and both are deliberate
// departures from that frame, which draws one settled instant and has no build to do:
//
//  - Rows land one at a time over ~22 seconds, appended below the rows already on stage, and
//    the list is top-aligned — so a row that has landed never moves again. That fixes the play
//    order: duds first (they share one beat, 2s in), then foolers fewest-fooled first, building
//    to the best lie. The design puts the winner on top instead.
//  - The left column holds the fact from the first frame rather than an empty space waiting for
//    a truth card that does not exist until 14.5s in. The blank in the sentence fills with the
//    answer on the same beat the answer stamps below it, so nothing jumps.
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
import { format, joinNamesAnd, useLocale } from "@opg/i18n";
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
import {
  ANSWER_WIDTH,
  answerSize,
  fooledAvatarSize,
  showsFinderTags,
  tableDensity,
  TRUTH_CARD_PADDING,
  TRUTH_CARD_WIDTH,
} from "./reveal-layout";
import type { TableDensity } from "./reveal-layout";
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
  gap: 12,
  minHeight: 0,
  overflow: "hidden",
};

/** Truth card on the left, lies table on the right. */
const COLUMNS: CSSProperties = {
  display: "grid",
  gridTemplateColumns: `${TRUTH_CARD_WIDTH}px minmax(0, 1fr)`,
  gap: 40,
  alignItems: "start",
  flexGrow: 1,
  minHeight: 0,
};

const LABEL: CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--opg-ink-secondary)",
};

/**
 * Lie, its NAH stamp, who wrote it, who it fooled, what it paid. Every row is a `subgrid` of
 * these tracks rather than a grid of its own, so the columns line up down the table however
 * long one row's lie or name runs. A grid per row cannot do that, and fixed pixel widths only
 * do it until a 40-character lie, eight fooled avatars or a Hebrew heading turns up.
 */
function liesGrid(density: TableDensity): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 250px) minmax(0, 270px) auto",
    columnGap: 16,
    rowGap: density.rowGap,
    alignContent: "start",
  };
}

const ROW_SPAN: CSSProperties = {
  gridColumn: "1 / -1",
  display: "grid",
  gridTemplateColumns: "subgrid",
  alignItems: "center",
};

/**
 * A row's own box. Rows are `FxIn` divs rather than `Card`s so that the element that animates
 * in is the same element that carries the subgrid — a wrapper between the two would break the
 * chain from the table's tracks to the row's cells, and the columns would stop lining up.
 */
function rowStyle(dud: boolean, alt: boolean, density: TableDensity): CSSProperties {
  return {
    ...ROW_SPAN,
    padding: `${density.paddingY}px 18px`,
    minHeight: density.minHeight,
    boxSizing: "border-box",
    background: dud ? "rgba(255, 255, 255, 0.6)" : "var(--opg-card)",
    border: dud ? "4px dashed var(--opg-muted)" : "4px solid var(--opg-ink)",
    borderRadius: alt ? "var(--opg-radius-m-alt)" : "var(--opg-radius-m)",
  };
}

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

function IntroHeading({ live, t }: { live: boolean; t: Dictionary }) {
  return (
    <FxIn live={live} preset="slideIn">
      <Marker size={36} level={1}>{t.realOrNah.introHeading}</Marker>
    </FxIn>
  );
}

/** "House lie" for an authorless decoy, otherwise the writer's name. */
function authorName(t: Dictionary, players: PlayerSummary[], authorId: PlayerId | null): string {
  return authorId === null ? t.realOrNah.houseLie : nameOf(players, authorId, t.common.someone);
}

// ---------- The truth card ----------

/** The answer at the size it fits, with REAL beside it — wrapping below it on a long answer. */
function AnswerLine({
  reveal,
  progress,
  t,
}: {
  reveal: RonReveal;
  progress: RevealProgress;
  t: Dictionary;
}) {
  const shown = progress.truthStamped ? reveal.answer : "?";
  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 18 }}>
      <Highlight>
        <span
          style={{ fontSize: answerSize(shown, ANSWER_WIDTH), fontWeight: 700, lineHeight: 1.1 }}
        >
          {shown}
        </span>
      </Highlight>
      {progress.truthStamped ? (
        <SlamStamp live={progress.truthStampedLive} shake="small" size={40}>
          {t.realOrNah.realStamp}
        </SlamStamp>
      ) : null}
    </div>
  );
}

/** Avatar tags while they fit the card, a joined list of the same names once they do not. */
function FinderNames({
  reveal,
  players,
  t,
}: {
  reveal: RonReveal;
  players: PlayerSummary[];
  t: Dictionary;
}) {
  const names = reveal.foundByIds.map((id) => nameOf(players, id, t.common.someone));
  if (!showsFinderTags(names.length)) {
    return (
      <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.25 }}>
        {joinNamesAnd(t.common, names)}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      {reveal.foundByIds.map((id, index) => (
        <PersonTag
          key={id}
          name={names[index] ?? t.common.someone}
          avatar={avatarOf(players, id)}
          avatarSize={40}
          fontSize={30}
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 30,
          fontWeight: 700,
          color: "var(--opg-ink-secondary)",
        }}
      >
        <Icon name="eye-off" size={30} color="var(--opg-ink-secondary)" />
        {t.realOrNah.nobodyFoundIt}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div style={{ fontSize: 30, fontWeight: 700 }}>{t.realOrNah.foundByLabel}</div>
        <Marker size={30} color="var(--opg-marker)">
          {format(t.realOrNah.pointsEach, { points: POINTS_TRUTH.toLocaleString("en-US") })}
        </Marker>
      </div>
      <FinderNames reveal={reveal} players={players} t={t} />
    </div>
  );
}

/**
 * The fact, from the first frame: it is the question the room just voted on, so it holds the
 * left column on its own until the truth lands inside it. The label, the answer and the finders
 * all arrive in this same card rather than as a second card sliding in underneath.
 */
function TruthCard({
  view,
  reveal,
  progress,
  players,
  t,
}: {
  view: RonHostView;
  reveal: RonReveal;
  progress: RevealProgress;
  players: PlayerSummary[];
  t: Dictionary;
}) {
  return (
    <Card
      variant="L"
      tilt={-1}
      style={{
        padding: `24px ${TRUTH_CARD_PADDING}px`,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {progress.truthShown ? (
        <h2 style={{ ...LABEL, margin: 0 }}>{t.realOrNah.theTruthLabel}</h2>
      ) : null}
      {/* The blank is an underline until the truth stamps, then the answer — the same beat that
          fills the big answer below it. Passing neither leaves a hole in the sentence. */}
      <PromptText
        prompt={view.prompt}
        answer={progress.truthStamped ? reveal.answer : null}
        blank={{ width: 140, height: 16, thickness: 11, verticalAlign: "-3px" }}
        style={{ fontSize: 32, fontWeight: 400, lineHeight: 1.35 }}
      />
      {progress.truthShown ? <AnswerLine reveal={reveal} progress={progress} t={t} /> : null}
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

// ---------- The lies table ----------

const HEADER_CELL: CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  color: "var(--opg-ink-secondary)",
};

function LiesHeader({ t }: { t: Dictionary }) {
  return (
    <div style={{ ...ROW_SPAN, padding: "0 20px" }}>
      <div style={HEADER_CELL}>{t.realOrNah.colLie}</div>
      <div />
      <div style={HEADER_CELL}>{t.realOrNah.colWrittenBy}</div>
      <div style={HEADER_CELL}>{t.realOrNah.colFooled}</div>
      <div style={{ ...HEADER_CELL, justifySelf: "end" }}>{t.realOrNah.colPoints}</div>
    </div>
  );
}

function LieText({ text, density }: { text: string; density: TableDensity }) {
  return (
    <div style={{ fontSize: density.fontSize, fontWeight: 700, lineHeight: density.lineHeight }}>
      {text}
    </div>
  );
}

/**
 * Who the lie fooled — or, for a dud, that it fooled nobody. Never the dashed border alone.
 *
 * `null` is a lie whose victims have not been revealed yet, which is not the same thing as a
 * lie that fooled nobody: a fooler spends the beat between landing and its "fooled" beat with
 * this cell empty, and must not claim in the meantime that it fooled nobody.
 */
function FooledCell({
  fooledIds,
  players,
  calloutText,
  t,
}: {
  fooledIds: readonly PlayerId[] | null;
  players: PlayerSummary[];
  calloutText: string | null;
  t: Dictionary;
}) {
  if (fooledIds === null) return <div />;
  if (fooledIds.length === 0) {
    return (
      <div style={{ fontSize: 28, fontWeight: 700, color: "var(--opg-ink-secondary)" }}>
        {t.realOrNah.fooledNobody}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {fooledIds.map((id) => (
        <Avatar
          key={id}
          id={avatarOf(players, id)}
          size={fooledAvatarSize(fooledIds.length)}
          alt={format(t.realOrNah.avatarAlt, { name: nameOf(players, id, t.common.someone) })}
        />
      ))}
      {calloutText === null ? null : (
        <Stamp size={28} tilt={-4}>
          {calloutText}
        </Stamp>
      )}
    </div>
  );
}

function PointsCell({ points, shown }: { points: number; shown: boolean }) {
  if (!shown) return <div />;
  return (
    <Marker size={34} color="var(--opg-marker)" style={{ justifySelf: "end" }}>
      <bdi dir="ltr">+{points.toLocaleString("en-US")}</bdi>
    </Marker>
  );
}

function AuthorCell({
  players,
  authorId,
  density,
  t,
}: {
  players: PlayerSummary[];
  authorId: PlayerId | null;
  density: TableDensity;
  t: Dictionary;
}) {
  return (
    <PersonTag
      name={authorName(t, players, authorId)}
      avatar={avatarOf(players, authorId)}
      avatarSize={density.avatarSize}
      fontSize={28}
    />
  );
}

/** A lie whose author was kicked: `optionId` still holds its beat, with nothing to show. */
function RemovedLieRow({
  live,
  density,
  t,
}: {
  live: boolean;
  density: TableDensity;
  t: Dictionary;
}) {
  return (
    <FxIn live={live} preset="slideIn" style={rowStyle(true, false, density)}>
      <div
        style={{
          fontSize: density.fontSize,
          fontWeight: 700,
          color: "var(--opg-ink-secondary)",
        }}
      >
        {t.realOrNah.removedLie}
      </div>
      <div />
      <div />
      <div />
      <div />
    </FxIn>
  );
}

interface RowProps {
  players: PlayerSummary[];
  density: TableDensity;
  t: Dictionary;
}

function FoolerRow({
  lie,
  players,
  voterCount,
  shakeRef,
  density,
  t,
}: RowProps & {
  lie: LieViewData;
  voterCount: number;
  shakeRef: RefObject<HTMLElement | null>;
}) {
  if (lie.removed) {
    return <RemovedLieRow live={lie.progress.live.in} density={density} t={t} />;
  }
  // The lie lands first and is stamped and attributed on its flip beat, the way the card this
  // replaces turned over: who wrote it is the beat, so it cannot be on screen before it.
  const flipped = lie.progress.flipped;
  return (
    <FxIn
      live={lie.progress.live.in}
      preset="slideIn"
      style={rowStyle(false, lie.index % 2 === 1, density)}
    >
      <LieText text={lie.text} density={density} />
      {flipped ? (
        <SlamStamp live={lie.progress.live.author} shake="small" shakeRef={shakeRef} size={28}>
          {t.realOrNah.nahStamp}
        </SlamStamp>
      ) : (
        <div />
      )}
      {flipped ? (
        <AuthorCell players={players} authorId={lie.authorId} density={density} t={t} />
      ) : (
        <div />
      )}
      <FooledCell
        fooledIds={lie.progress.fooledShown ? lie.fooledIds : null}
        players={players}
        calloutText={lie.progress.pointsShown ? callout(t, lie.fooledIds.length, voterCount) : null}
        t={t}
      />
      <PointsCell points={lie.points} shown={lie.progress.pointsShown} />
    </FxIn>
  );
}

function DudRow({ lie, players, live, density, t }: RowProps & { lie: RonFooledLie; live: boolean }) {
  return (
    <FxIn live={live} preset="tapeOn" style={rowStyle(true, false, density)}>
      <LieText text={lie.text} density={density} />
      <Stamp size={28} tilt={-6}>
        {t.realOrNah.nahStamp}
      </Stamp>
      <AuthorCell players={players} authorId={lie.authorId} density={density} t={t} />
      <FooledCell fooledIds={[]} players={players} calloutText={null} t={t} />
      <PointsCell points={0} shown />
    </FxIn>
  );
}

/**
 * Duds first as one block (they share a beat), then each fooler as it lands. Rows only ever
 * append at the bottom, so nothing already on stage moves when the next one arrives.
 *
 * The density comes from every lie in the reveal, not from the rows on stage so far: a table
 * that started roomy and tightened as its seventh row landed would move every row above it.
 */
function LiesTable({
  reveal,
  lies,
  progress,
  players,
  voterCount,
  shakeRef,
  t,
}: {
  reveal: RonReveal;
  lies: LieViewData[];
  progress: RevealProgress;
  players: PlayerSummary[];
  voterCount: number;
  shakeRef: RefObject<HTMLElement | null>;
  t: Dictionary;
}) {
  const duds = reveal.lies.filter((lie) => lie.fooledIds.length === 0);
  const shownLies = lies.filter((lie) => lie.progress.shown);
  const anyDuds = progress.dudsShown && duds.length > 0;
  if (!anyDuds && shownLies.length === 0) return null;
  const density = tableDensity(duds.length + lies.length);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: density.headingGap,
        minHeight: 0,
      }}
    >
      <Marker size={density.headingSize} level={2}>
        {t.realOrNah.theLiesLabel}
      </Marker>
      <div style={liesGrid(density)}>
        <LiesHeader t={t} />
        {anyDuds
          ? duds.map((lie) => (
              <DudRow
                key={lie.optionId}
                lie={lie}
                players={players}
                live={progress.dudsLive}
                density={density}
                t={t}
              />
            ))
          : null}
        {shownLies.map((lie) => (
          <FoolerRow
            key={lie.optionId}
            lie={lie}
            players={players}
            voterCount={voterCount}
            shakeRef={shakeRef}
            density={density}
            t={t}
          />
        ))}
      </div>
    </div>
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
  const announcer = (
    <output aria-live="polite" style={HIDDEN}>
      {announcement}
    </output>
  );

  // The standings take the whole stage once they land, instead of piling up under the
  // duds/lies/truth stack above them: a full room of players and their fact-by-fact
  // deltas is tall on its own (see Standings.tsx), and the TV stage doesn't scroll. By
  // the time standings are due, the room has already seen the lies and the truth, so
  // nothing is lost by retiring them rather than stacking a second screen's worth of
  // content underneath.
  if (progress.standingsShown) {
    return (
      <div ref={rootRef} style={STAGE}>
        <StandingsSection view={view} players={players} progress={progress} />
        {announcer}
      </div>
    );
  }

  return (
    <div ref={rootRef} style={STAGE}>
      <IntroHeading live={progress.introLive} t={t} />
      <div style={COLUMNS}>
        <TruthCard view={view} reveal={reveal} progress={progress} players={players} t={t} />
        <LiesTable
          reveal={reveal}
          lies={lies}
          progress={progress}
          players={players}
          voterCount={view.playerIds.length}
          shakeRef={rootRef}
          t={t}
        />
      </div>
      {announcer}
    </div>
  );
}
