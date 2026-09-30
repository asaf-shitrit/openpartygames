// Screen-reader line for the finale ceremony: each award as it stamps in, then the crown.
// The TV and every phone mount it off the same beats, so a reader hears the same moments
// the room sees, whichever surface they are holding.
import type { Award, PlayerId, PlayerSummary } from "@opg/protocol";
import { SR_ONLY } from "@opg/ui";
import type { Beat, Moment } from "@opg/ui";
import { format, joinNamesAnd } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import { awardCopyFor, describableAwards } from "../games";

/** How many award beats the ceremony has reached, live or already past. */
export function countAwardsShown(beats: readonly Beat[], moment: Moment): number {
  let shown = 0;
  for (let index = 0; index <= moment.index; index += 1) {
    if (beats[index]?.id.startsWith("award-")) shown += 1;
  }
  return shown;
}

function nameOf(
  players: readonly PlayerSummary[],
  id: PlayerId,
  someone: string,
): string {
  return players.find((player) => player.id === id)?.name ?? someone;
}

function awardAnnouncement(
  t: Dictionary,
  gameId: string,
  award: Award,
  players: readonly PlayerSummary[],
): string {
  const copy = awardCopyFor(gameId, award, t);
  if (copy === null) return "";
  const names = joinNamesAnd(
    t.common,
    award.playerIds.map((id) => nameOf(players, id, t.common.someone)),
  );
  return format(t.results.awardAnnounce, { title: copy.title, names });
}

export interface FinaleAnnouncerProps {
  t: Dictionary;
  gameId: string;
  /** Every award on the result; only the ones the game can describe get a beat. */
  awards: readonly Award[];
  players: readonly PlayerSummary[];
  awardsShown: number;
  crownReached: boolean;
  crownLine: string | null;
}

/** The sentence for the latest beat reached: the crown once it lands, else the newest award. */
export function finaleAnnouncement(props: FinaleAnnouncerProps): string {
  const { t, crownReached, crownLine } = props;
  if (crownReached) {
    // A fuller sentence than the on-screen marker, so the two never collide under an exact text match.
    return crownLine ? format(t.results.crownAnnounce, { crownLine }) : "";
  }
  const staged = describableAwards(props.gameId, props.awards, t);
  const latest = staged[props.awardsShown - 1];
  if (latest === undefined) return "";
  return awardAnnouncement(t, props.gameId, latest, props.players);
}

export function FinaleAnnouncer(props: FinaleAnnouncerProps) {
  return (
    <output aria-live="polite" style={SR_ONLY}>
      {finaleAnnouncement(props)}
    </output>
  );
}
