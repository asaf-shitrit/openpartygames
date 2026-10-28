// Phone screens for Sketch Phone: writing a phrase, drawing, describing, the sent-away wait,
// presenting and watching a replay, voting, and the favourite. In a no-TV room the phone also
// carries the chain itself, so a phones-only table still sees what a shared screen would show.
import { useState } from "react";
import type { ReactNode } from "react";
import type { PlayerRoomView, PlayerSummary } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import {
  Button,
  Card,
  DoodleView,
  Marker,
  PhoneScreen,
  PhoneStrip,
  PhaseEnter,
  Timer,
  phoneRoomCode,
} from "@opg/ui";
import { format, pickPluralByCount, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import type { SketchAction, SketchLinkView, SketchPlayerOption, SketchPlayerView } from "../state";
import { POINTS_PER_VOTE, TEXT_MAX_LENGTH } from "../state";
import { linkLabel, nameOf } from "./common";
import { PhoneDraw } from "./PhoneDraw";

interface BodyProps {
  view: SketchPlayerView;
  room: PlayerRoomView;
  players: PlayerSummary[];
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
  send: (action: SketchAction) => void;
  /** True when this room has no shared screen, so the phone carries the chain. */
  noTv: boolean;
}

function progressLabel(t: Dictionary, view: SketchPlayerView): string {
  if (view.phase === "replay" || view.phase === "vote" || view.phase === "favourite") {
    return format(t.sketchPhone.chainOfShort, { current: view.chainNumber, count: view.chainCount });
  }
  if (view.phase === "write") return t.sketchPhone.progressWrite;
  return format(t.sketchPhone.roundOf, { round: view.roundNumber, count: view.roundCount });
}

function votesLabel(t: Dictionary, votes: number): string {
  return format(pickPluralByCount(votes, t.sketchPhone.votes), { count: votes });
}

// ---------- writing and describing ----------

interface WordsCardProps {
  view: SketchPlayerView;
  players: PlayerSummary[];
  clock: ServerClock;
  send: (action: SketchAction) => void;
  describing: boolean;
}

/** A phrase can go when there is a link to fill and the words fit. */
function sendableWords(linkId: string | null, clean: string): boolean {
  return linkId !== null && clean.length > 0 && clean.length <= TEXT_MAX_LENGTH;
}

/**
 * What a describer has to put into words, with where it came from. A drawing shows itself; the
 * rare case where a drawing never arrived shows the words it was meant to draw, so the describer
 * still has something to describe.
 */
function DrawingToDescribe({
  input,
  inputLabel,
  clock,
}: {
  input: SketchPlayerView["input"];
  inputLabel: string;
  clock: ServerClock;
}) {
  const { t } = useLocale();
  if (input === null) return null;
  return (
    <>
      {input.doodle !== null ? (
        <DoodleView doodle={input.doodle} label={inputLabel} clock={clock} size={200} />
      ) : (
        <div style={{ fontSize: 22, fontWeight: 700, overflowWrap: "anywhere" }}>{input.text}</div>
      )}
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--opg-ink-secondary)" }}>
        {format(t.sketchPhone.itCameFrom, { label: inputLabel })}
      </div>
    </>
  );
}

const CHIP = {
  minHeight: 44,
  padding: "0 12px",
  fontSize: 16,
  fontWeight: 700,
  border: "3px dashed var(--opg-ink)",
  borderRadius: 999,
  color: "var(--opg-ink)",
} as const;

/**
 * Starting points, offered as taps rather than invented: the phrases the room's packs dealt this
 * phone, so a player who cannot think of one still has three the table's own content carries.
 */
function SuggestionChips({ phrases, onPick }: { phrases: readonly string[]; onPick: (phrase: string) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
      {phrases.map((phrase) => (
        <button key={phrase} type="button" className="opg-reset" onClick={() => onPick(phrase)} style={CHIP}>
          {phrase}
        </button>
      ))}
    </div>
  );
}

function WordsCard({ view, players, clock, send, describing }: WordsCardProps) {
  const { t } = useLocale();
  const [text, setText] = useState(view.myWords ?? "");
  const linkId = view.myLinkId;
  const clean = text.trim().replace(/\s+/g, " ");
  const sendable = sendableWords(linkId, clean);
  const input = view.input;
  const inputLabel =
    input === null ? "" : linkLabel(t, input.kind, nameOf(players, input.authorId, t.common.someone));
  return (
    <Card style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
      <Marker size={30} level={1}>
        {describing ? t.sketchPhone.whatIsThis : t.sketchPhone.startChain}
      </Marker>
      {describing ? <DrawingToDescribe input={input} inputLabel={inputLabel} clock={clock} /> : null}
      <label style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 17, fontWeight: 700 }}>
        {t.sketchPhone.writeSomething}
        <input
          value={text}
          maxLength={TEXT_MAX_LENGTH}
          onChange={(event) => setText(event.target.value)}
          placeholder={view.mySuggestions[0] ?? ""}
          style={{
            minHeight: 56,
            padding: "0 14px",
            fontSize: 20,
            fontWeight: 400,
            fontFamily: "var(--opg-font-body)",
            background: "var(--opg-card)",
            border: "3px solid var(--opg-ink)",
            borderRadius: "var(--opg-radius-button)",
            color: "var(--opg-ink)",
          }}
        />
      </label>
      <span style={{ fontSize: 16, color: "var(--opg-ink-secondary)" }}>
        {format(t.sketchPhone.counter, { count: clean.length, max: TEXT_MAX_LENGTH })}
      </span>
      <SuggestionChips phrases={view.mySuggestions} onPick={setText} />
      <div style={{ fontSize: 16, color: "var(--opg-ink-secondary)" }}>
        {describing ? t.sketchPhone.describeHint : t.sketchPhone.writeHint}
      </div>
      <Button
        fullWidth
        size="lg"
        disabled={!sendable}
        onClick={() => {
          if (linkId !== null && sendable) send({ type: "words", text: clean });
        }}
      >
        {t.sketchPhone.sendIt}
      </Button>
    </Card>
  );
}

// ---------- sent ----------

function SentStage({ view, room }: BodyProps) {
  const { t } = useLocale();
  const waiting = Math.max(0, view.playerCount - view.doneCount);
  const next = view.myKind === "drawing" ? t.sketchPhone.nextUpDrawing : t.sketchPhone.nextUpWords;
  return (
    <Card style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12, textAlign: "center" }}>
      <Marker size={32} level={1}>
        {t.sketchPhone.sent}
      </Marker>
      <div style={{ fontSize: 18, fontWeight: 700 }}>
        {format(pickPluralByCount(waiting, t.sketchPhone.waitingForMore), { count: waiting })}
      </div>
      {view.myWords !== null && view.myWords !== "" ? (
        <div style={{ fontSize: 20, overflowWrap: "anywhere" }}>“{view.myWords}”</div>
      ) : null}
      <div style={{ fontSize: 16, color: "var(--opg-ink-secondary)" }}>{next}</div>
      <div style={{ fontSize: 16, color: "var(--opg-ink-secondary)" }}>
        {format(t.sketchPhone.chainOfShort, { current: view.chainNumber, count: view.chainCount })}
      </div>
      <div style={{ fontSize: 16, color: "var(--opg-ink-secondary)" }}>{room.code}</div>
    </Card>
  );
}

// ---------- the chain on a phone ----------

function ChainLinks({
  links,
  players,
  clock,
  size = 120,
}: {
  links: readonly SketchLinkView[];
  players: PlayerSummary[];
  clock: ServerClock;
  size?: number;
}) {
  const { t } = useLocale();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {links.map((link) => {
        const label = linkLabel(t, link.kind, nameOf(players, link.authorId, t.common.someone));
        return (
          <Card key={link.id} style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--opg-ink-secondary)" }}>{label}</div>
            {link.doodle !== null ? (
              <DoodleView doodle={link.doodle} label={label} clock={clock} size={size} />
            ) : (
              <div style={{ fontSize: 19, fontWeight: 700, overflowWrap: "anywhere" }}>{link.text}</div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function secondsHint(t: Dictionary, deadline: number | null, clock: ServerClock): string {
  if (deadline === null) return "";
  return format(t.sketchPhone.movesOnIn, { seconds: Math.max(0, Math.ceil((deadline - clock.now()) / 1000)) });
}

function PresentStage({ view, players, deadline, clock, send }: BodyProps) {
  const { t } = useLocale();
  const links = view.links ?? [];
  const current = links[links.length - 1];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Card style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        <Marker size={26} level={1}>
          {t.sketchPhone.yourChainOnTv}
        </Marker>
        <div style={{ fontSize: 16 }}>{t.sketchPhone.yourChainHint}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--opg-ink-secondary)" }}>
          {format(t.sketchPhone.linkOf, { current: links.length, count: view.linkCount })}
        </div>
      </Card>
      {current !== undefined ? <ChainLinks links={[current]} players={players} clock={clock} size={160} /> : null}
      <Button
        fullWidth
        size="lg"
        onClick={() => {
          send({ type: "next-link" });
        }}
      >
        {t.sketchPhone.nextLink}
      </Button>
      <div style={{ fontSize: 16, textAlign: "center", color: "var(--opg-ink-secondary)" }}>
        {secondsHint(t, deadline, clock)}
      </div>
    </div>
  );
}

function WatchStage({ view, players, clock, noTv }: BodyProps) {
  const { t } = useLocale();
  if (!noTv) {
    return (
      <Card style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 8, textAlign: "center" }}>
        <Marker size={28} level={1}>
          {t.sketchPhone.lookUp}
        </Marker>
        <div style={{ fontSize: 16, color: "var(--opg-ink-secondary)" }}>
          {format(t.sketchPhone.chainOfShort, { current: view.chainNumber, count: view.chainCount })}
        </div>
      </Card>
    );
  }
  return <ChainLinks links={view.links ?? []} players={players} clock={clock} size={140} />;
}

// ---------- voting ----------

/** The row's shell: a picked option is outlined in marker, a locked room greys everything. */
function rowStyle(selected: boolean, mine: boolean) {
  return {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
    width: "100%",
    minHeight: 44,
    textAlign: "start" as const,
    padding: "10px 12px",
    background: "var(--opg-card)",
    border: `${selected ? 4 : 3}px solid ${selected ? "var(--opg-marker)" : "var(--opg-ink)"}`,
    borderRadius: "var(--opg-radius-button)",
    opacity: mine ? 0.7 : 1,
  };
}

function OptionRow({
  option,
  players,
  selected,
  locked,
  onPick,
  clock,
}: {
  option: SketchPlayerOption;
  players: PlayerSummary[];
  selected: boolean;
  locked: boolean;
  onPick: () => void;
  clock: ServerClock;
}) {
  const { t } = useLocale();
  const label = linkLabel(t, option.kind, nameOf(players, option.authorId, t.common.someone));
  return (
    <button
      type="button"
      className="opg-reset"
      disabled={option.mine || locked}
      onClick={onPick}
      style={rowStyle(selected, option.mine)}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 16, fontWeight: 700 }}>
        <span style={{ color: "var(--opg-ink-secondary)", overflowWrap: "anywhere" }}>{label}</span>
        {option.mine ? <span>{t.sketchPhone.yours}</span> : null}
        {selected && !option.mine ? <span>{t.sketchPhone.picked}</span> : null}
      </div>
      {option.doodle !== null ? (
        <DoodleView doodle={option.doodle} label={label} clock={clock} size={96} />
      ) : (
        <div style={{ fontSize: 19, fontWeight: 700, overflowWrap: "anywhere" }}>{option.text}</div>
      )}
    </button>
  );
}

function VoteStage({ view, players, deadline, clock, send }: BodyProps) {
  const { t } = useLocale();
  const [selected, setSelected] = useState<string | null>(null);
  const options = view.options ?? [];
  const locked = view.myVote !== null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Card style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
        <Marker size={26} level={1}>
          {t.sketchPhone.pickFavouritePhone}
        </Marker>
        <div style={{ fontSize: 16 }}>{t.sketchPhone.voteHint}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--opg-ink-secondary)" }}>
          {format(t.sketchPhone.votedOfTotal, { voted: view.votedCount, total: view.playerCount })}
        </div>
        <div style={{ fontSize: 16, color: "var(--opg-ink-secondary)" }}>{secondsHint(t, deadline, clock)}</div>
      </Card>
      {options.map((option) => (
        <OptionRow
          key={option.id}
          option={option}
          players={players}
          selected={selected === option.id || view.myVote === option.id}
          locked={locked}
          onPick={() => setSelected(option.id)}
          clock={clock}
        />
      ))}
      <Button
        fullWidth
        size="lg"
        disabled={locked || selected === null}
        onClick={() => {
          if (!locked && selected !== null) send({ type: "vote", linkId: selected });
        }}
      >
        {locked ? t.sketchPhone.picked : t.sketchPhone.lockIn}
      </Button>
    </div>
  );
}

// ---------- the favourite ----------

/** The viewer's own link's tally, or null when nobody voted for it. */
function yourLineOf(t: Dictionary, mine: SketchLinkView | null, myVotes: number): string | null {
  if (mine === null || myVotes === 0) return null;
  return format(mine.kind === "drawing" ? t.sketchPhone.yourDrawingVotes : t.sketchPhone.yourWordsVotes, {
    votes: votesLabel(t, myVotes),
    points: myVotes * POINTS_PER_VOTE,
  });
}

/** How many votes a link collected, zero included. */
function votesOf(counts: Record<string, number>, linkId: string): number {
  return counts[linkId] ?? 0;
}

/** The crowned link: whose it is, what it pays, and how many votes it took. */
function CrownedFavourite({ favourite, votes, players, t }: {
  favourite: SketchLinkView;
  votes: number;
  players: PlayerSummary[];
  t: Dictionary;
}) {
  return (
    <>
      <div style={{ fontSize: 17, fontWeight: 700 }}>
        {linkLabel(t, favourite.kind, nameOf(players, favourite.authorId, t.common.someone))}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700 }}>
        {format(t.sketchPhone.pointsAwarded, { points: votes * POINTS_PER_VOTE })}
      </div>
      <div style={{ fontSize: 16 }}>{votesLabel(t, votes)}</div>
    </>
  );
}

/** The favourite itself, with its points, its votes and the viewer's own tally underneath. */
function FavouriteCard({ view, players, t, yourLine }: {
  view: SketchPlayerView;
  players: PlayerSummary[];
  t: Dictionary;
  yourLine: string | null;
}) {
  const links = view.links ?? [];
  const counts = view.voteCounts ?? {};
  const favourite = links.find((link) => link.id === view.favouriteId) ?? null;
  return (
    <Card style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8, textAlign: "center" }}>
      <Marker size={30} level={1}>
        {t.sketchPhone.favourite}
      </Marker>
      <div style={{ fontSize: 16, color: "var(--opg-ink-secondary)" }}>
        {format(t.sketchPhone.chainOfShort, { current: view.chainNumber, count: view.chainCount })}
      </div>
      {favourite !== null ? (
        <CrownedFavourite favourite={favourite} votes={votesOf(counts, favourite.id)} players={players} t={t} />
      ) : null}
      {yourLine !== null ? <div style={{ fontSize: 16, fontWeight: 700 }}>{yourLine}</div> : null}
    </Card>
  );
}

function FavouriteStage({ view, room, players, clock }: BodyProps) {
  const { t } = useLocale();
  const links = view.links ?? [];
  const counts = view.voteCounts ?? {};
  const mine = links.find((link) => link.authorId === room.you) ?? null;
  const myVotes = mine === null ? 0 : votesOf(counts, mine.id);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <FavouriteCard view={view} players={players} t={t} yourLine={yourLineOf(t, mine, myVotes)} />
      <ChainLinks
        links={links.filter((link) => link.id !== view.favouriteId).slice(0, 3)}
        players={players}
        clock={clock}
        size={96}
      />
    </div>
  );
}

// ---------- the screen ----------

function DrawBody(props: BodyProps) {
  return (
    <PhoneDraw
      view={props.view}
      roomCode={props.room.code}
      startedAt={props.timerStartedAt}
      clock={props.clock}
      send={props.send}
    />
  );
}

function ReplayBody(props: BodyProps) {
  return props.view.isPresenter ? <PresentStage {...props} /> : <WatchStage {...props} />;
}

const BODIES = {
  write: (props) => <WordsCard {...props} describing={false} />,
  describe: (props) => <WordsCard {...props} describing />,
  draw: DrawBody,
  replay: ReplayBody,
  vote: (props) => <VoteStage {...props} />,
  favourite: (props) => <FavouriteStage {...props} />,
} satisfies Record<BodyProps["view"]["phase"], (props: BodyProps) => ReactNode>;

function isWorking(view: SketchPlayerView): boolean {
  return view.phase === "write" || view.phase === "draw" || view.phase === "describe";
}

/**
 * A player the round pulled in after the links were dealt has nothing of its own to hand in.
 * `myDone` is true for them (the room is not waiting on a link that does not exist), so this has
 * to be checked first, or they would read "Sent it!" about a phrase they never wrote.
 */
function WaitingCard() {
  const { t } = useLocale();
  return (
    <Card style={{ padding: 20, textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{t.sketchPhone.waitingOnLink}</div>
    </Card>
  );
}

function bodyFor(props: BodyProps): ReactNode {
  if (isWorking(props.view) && props.view.myLinkId === null) return <WaitingCard />;
  if (props.view.myDone && isWorking(props.view)) return <SentStage {...props} />;
  return BODIES[props.view.phase](props);
}

export interface PhoneProps {
  view: SketchPlayerView;
  room: PlayerRoomView;
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
  send: (action: SketchAction) => void;
  /** The host view in a no-TV room; null when a shared screen is showing. */
  stage: unknown;
}

export function Phone(props: PhoneProps) {
  const { t } = useLocale();
  const noTv = props.stage !== null;
  return (
    <PhoneScreen roomCode={phoneRoomCode(props.room)} fit>
      <PhoneStrip
        gameName={t.sketchPhone.title}
        progress={progressLabel(t, props.view)}
        right={<Timer deadline={props.deadline} clock={props.clock} size={78} startedAt={props.timerStartedAt} haptics />}
      />
      <PhaseEnter
        phaseKey={`${props.view.phase}:${props.view.chainNumber}:${props.view.myLinkId ?? ""}:${props.view.myDone}`}
        // The phase's own box takes the height the strip leaves, so a phase that needs to (the
        // drawing pad) can put its action at the bottom edge and give the middle what is left.
        style={{ flex: "1 1 0", minHeight: 0 }}
      >
        {bodyFor({ ...props, players: props.room.players, noTv })}
      </PhaseEnter>
    </PhoneScreen>
  );
}
