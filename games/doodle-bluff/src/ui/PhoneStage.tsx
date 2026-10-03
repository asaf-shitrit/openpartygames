// The stage a phone carries above its own controls in a no-TV room (GameDefinition.noTv, and
// "## No-TV mode" in plan/0003-doodle-bluff.md). The reveal and the gallery already stage
// themselves by reusing the host screens; these three phases had nothing at all, so a
// phones-only room spent the whole draw, title and vote with no idea how far the room had got:
// no "who's written", no "{voted} of {total}", no sign of who was still drawing. Imposter's
// src/ui/stage/ is the reference for the shape.
import type { CSSProperties } from "react";
import type { PlayerId, PlayerSummary } from "@opg/protocol";
import { Avatar, Icon, Timer } from "@opg/ui";
import type { ServerClock } from "@opg/ui";
import { format, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import type { DoodleHostView, DoodlePhase } from "../state";
import { avatarOf, nameOf } from "./common";

const WRAP: CSSProperties = {
  boxSizing: "border-box",
  padding: "10px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  background: "var(--opg-card)",
  border: "3px solid var(--opg-ink)",
  borderRadius: "22px 8px 20px 10px / 10px 20px 8px 22px",
};

const LABEL: CSSProperties = { fontSize: 16, fontWeight: 700, color: "var(--opg-ink-secondary)" };

const BADGE: CSSProperties = {
  position: "absolute",
  insetInlineEnd: -5,
  top: -5,
  width: 19,
  height: 19,
  borderRadius: "50%",
  background: "var(--opg-highlight)",
  border: "2.5px solid var(--opg-marker)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

/** Done is a check badge as well as full opacity: dimming alone would be state carried by
 * nothing but contrast. */
function StageAvatar({ id, done, players, t }: { id: PlayerId; done: boolean; players: PlayerSummary[]; t: Dictionary }) {
  const alt = format(t.doodleBluff.avatarAlt, { name: nameOf(players, id, t.common.someone) });
  if (!done) return <Avatar id={avatarOf(players, id)} size={40} alt={alt} style={{ opacity: 0.5 }} />;
  return (
    <div style={{ position: "relative", display: "flex" }} data-testid="stage-done">
      <Avatar id={avatarOf(players, id)} size={40} alt={alt} />
      <div style={BADGE}>
        <Icon name="check" size={12} color="var(--opg-marker)" />
      </div>
    </div>
  );
}

interface StageContent {
  label: string;
  count: string;
  /** Who is shown, in roster order: everyone, or everyone but the artist. */
  ids: PlayerId[];
  doneIds: readonly string[];
}

function othersOf(view: DoodleHostView): PlayerId[] {
  return view.playerIds.filter((id) => id !== view.artistId);
}

function titleContent(view: DoodleHostView, t: Dictionary): StageContent {
  const others = othersOf(view);
  return {
    label: t.doodleBluff.whosWritten,
    count: format(t.doodleBluff.writtenOfEligible, { written: view.writtenIds.length, eligible: others.length }),
    ids: others,
    doneIds: view.writtenIds,
  };
}

function voteContent(view: DoodleHostView, t: Dictionary): StageContent {
  const others = othersOf(view);
  return {
    label: t.doodleBluff.roomIsVoting,
    count: format(t.doodleBluff.votedOfTotal, { voted: view.votedIds.length, total: others.length }),
    ids: others,
    doneIds: view.votedIds,
  };
}

const CONTENT = { title: titleContent, vote: voteContent } as const;

/** The phases with their own controls under a stage. Reveal and gallery stage the whole host
 * screen instead, and the draw phase stages itself as one compact row (DrawHeader). */
export type StagedPhase = "draw" | keyof typeof CONTENT;

/** The phases whose stage is a roster of avatars. */
export type RosterPhase = keyof typeof CONTENT;

export function isStagedPhase(phase: DoodlePhase): phase is StagedPhase {
  return phase === "draw" || phase === "title" || phase === "vote";
}

export interface PhoneStageProps {
  phase: RosterPhase;
  /** The host view, in a no-TV room only; null in a room with a shared screen. */
  stage: DoodleHostView | null;
  players: PlayerSummary[];
}

export function PhoneStage({ phase, stage, players }: PhoneStageProps) {
  const { t } = useLocale();
  if (stage === null) return null;
  const { label, count, ids, doneIds } = CONTENT[phase](stage, t);
  return (
    <div style={WRAP}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <h1 style={{ ...LABEL, margin: 0 }}>{label}</h1>
        <div style={LABEL}>{count}</div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        {ids.map((id) => (
          <StageAvatar key={id} id={id} done={doneIds.includes(id)} players={players} t={t} />
        ))}
      </div>
    </div>
  );
}

export interface DrawHeaderProps {
  /** The host view, in a no-TV room only. */
  stage: DoodleHostView;
  roomCode: string | undefined;
  clock: ServerClock;
  deadline: number | null;
  timerStartedAt: number | null;
}

/**
 * The whole of a no-TV phone's header while drawing: game name, how many have finished, the room
 * code and the clock in one row. The strip and the avatar roster used to stack to about 205px,
 * which on a 360x640 phone left the canvas 150px. The roster is the part given up; the count
 * stays, and so does the room code, the rejoin path for a phone that died.
 */
export function DrawHeader({ stage, roomCode, clock, deadline, timerStartedAt }: DrawHeaderProps) {
  const { t } = useLocale();
  const count = format(t.doodleBluff.drawnOfTotal, { drawn: stage.drawnIds.length, total: stage.playerIds.length });
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <h1 className="opg-marker" style={{ margin: 0, fontSize: 26, lineHeight: 1.1 }}>
          {t.doodleBluff.title}
        </h1>
        <div style={LABEL}>
          {roomCode ? <span>{format(t.kit.roomCode, { code: roomCode })}</span> : null}
          {roomCode ? <span aria-hidden="true"> · </span> : null}
          <span>{count}</span>
        </div>
      </div>
      <Timer deadline={deadline} clock={clock} startedAt={timerStartedAt} size={60} haptics />
    </div>
  );
}
