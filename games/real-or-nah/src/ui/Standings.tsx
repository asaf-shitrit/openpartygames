// Real or Nah reveal: the standings row that slides in and counts scores up, then reorders.
import { useMemo } from "react";
import type { AvatarId, PlayerId, PlayerSummary } from "@opg/protocol";
import { Avatar, CountUp, Marker, formatPoints, rankChanges, useFlipList } from "@opg/ui";
import { format, useLocale } from "@opg/i18n";
import { avatarOf, nameOf } from "./common";

export function previousTotal(
  totals: Record<PlayerId, number>,
  pointsThisFact: Record<PlayerId, number>,
  id: PlayerId,
): number {
  return (totals[id] ?? 0) - (pointsThisFact[id] ?? 0);
}

/**
 * Descending by `value`, ties broken by the original order. ES2022 has no
 * Array#toSorted, and `Array#sort` mutates, so this picks the best remaining
 * id one at a time instead.
 */
function orderBy(
  playerIds: readonly PlayerId[],
  value: (id: PlayerId) => number,
): PlayerId[] {
  const remaining = [...playerIds];
  const ordered: PlayerId[] = [];
  while (remaining.length > 0) {
    let bestIndex = 0;
    for (let index = 1; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const best = remaining[bestIndex];
      if (candidate !== undefined && best !== undefined && value(candidate) > value(best)) {
        bestIndex = index;
      }
    }
    ordered.push(...remaining.splice(bestIndex, 1));
  }
  return ordered;
}

/** Order by previous totals until reorder, then by new totals. */
export function standingsOrder(
  playerIds: readonly PlayerId[],
  totals: Record<PlayerId, number>,
  pointsThisFact: Record<PlayerId, number>,
  reorderReached: boolean,
): PlayerId[] {
  if (reorderReached) return orderBy(playerIds, (id) => totals[id] ?? 0);
  return orderBy(playerIds, (id) => previousTotal(totals, pointsThisFact, id));
}

/** "▲2" / "▼1"; no badge for an unchanged rank. */
export function rankBadge(change: number): string | null {
  if (change > 0) return `▲${change}`;
  if (change < 0) return `▼${Math.abs(change)}`;
  return null;
}

export interface StandingsProps {
  players: PlayerSummary[];
  playerIds: PlayerId[];
  totals: Record<PlayerId, number>;
  pointsThisFact: Record<PlayerId, number>;
  countReached: boolean;
  countLive: boolean;
  reorderReached: boolean;
}

interface StandingsRowProps {
  registerRef: (el: HTMLElement | null) => void;
  name: string;
  avatarId: AvatarId | null;
  from: number;
  to: number;
  countReached: boolean;
  countLive: boolean;
  change: number;
}

function StandingsRow({
  registerRef,
  name,
  avatarId,
  from,
  to,
  countReached,
  countLive,
  change,
}: StandingsRowProps) {
  const { t } = useLocale();
  const badge = rankBadge(change);
  return (
    <div
      ref={registerRef}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        padding: "14px 26px",
        background: "var(--opg-card)",
        border: "4px solid var(--opg-ink)",
        borderRadius: "var(--opg-radius-m)",
      }}
    >
      <Avatar id={avatarId} size={56} alt={format(t.realOrNah.avatarAlt, { name })} />
      <div style={{ flexGrow: 1, fontSize: 34, fontWeight: 700 }}>{name}</div>
      {badge ? (
        <div style={{ fontSize: 30, fontWeight: 700 }}>{badge}</div>
      ) : null}
      <div style={{ fontSize: 38, fontWeight: 700, minWidth: 150, textAlign: "end" }}>
        {countReached ? (
          <CountUp from={from} to={to} live={countLive} />
        ) : (
          formatPoints(from)
        )}
      </div>
    </div>
  );
}

export function Standings({
  players,
  playerIds,
  totals,
  pointsThisFact,
  countReached,
  countLive,
  reorderReached,
}: StandingsProps) {
  const { t } = useLocale();
  const beforeOrder = useMemo(
    () => standingsOrder(playerIds, totals, pointsThisFact, false),
    [playerIds, totals, pointsThisFact],
  );
  const afterOrder = useMemo(
    () => standingsOrder(playerIds, totals, pointsThisFact, true),
    [playerIds, totals, pointsThisFact],
  );
  const order = reorderReached ? afterOrder : beforeOrder;
  const changes = useMemo(
    () => rankChanges(beforeOrder, afterOrder),
    [beforeOrder, afterOrder],
  );
  const { register } = useFlipList(order);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Marker size={48}>{t.realOrNah.standingsLabel}</Marker>
      {order.map((id) => (
        <StandingsRow
          key={id}
          registerRef={register(id)}
          name={nameOf(players, id, t.common.someone)}
          avatarId={avatarOf(players, id)}
          from={previousTotal(totals, pointsThisFact, id)}
          to={totals[id] ?? 0}
          countReached={countReached}
          countLive={countLive}
          change={reorderReached ? (changes[id] ?? 0) : 0}
        />
      ))}
    </div>
  );
}
