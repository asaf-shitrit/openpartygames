/** A finished game, as recorded in `match_stats`. */
export interface MatchStats {
  gameId: string;
  playerCount: number;
  durationMs: number;
  completed: boolean;
  finishedAt: number;
}

/** A row of the `daily_rooms` upsert, which returns one row while the cap holds. */
export interface CountRow {
  count: number;
}

export const DAILY_ROOM_SQL = `INSERT INTO daily_rooms (day, count) VALUES (?, 1)
   ON CONFLICT(day) DO UPDATE SET count = count + 1 WHERE daily_rooms.count < ?
   RETURNING count`;

export const MATCH_STATS_SQL =
  "INSERT INTO match_stats (game_id, player_count, duration_ms, completed, finished_at) VALUES (?, ?, ?, ?, ?)";

/** Takes back one room the cap counted, never below zero. */
export const RELEASE_ROOM_SQL =
  "UPDATE daily_rooms SET count = count - 1 WHERE day = ? AND count > 0";

/** Bind values for DAILY_ROOM_SQL. */
export function dailyRoomParams(day: string, cap: number): (string | number)[] {
  return [day, cap];
}

/** Bind values for MATCH_STATS_SQL. */
export function matchParams(stats: MatchStats): (string | number)[] {
  return [
    stats.gameId,
    stats.playerCount,
    stats.durationMs,
    stats.completed ? 1 : 0,
    stats.finishedAt,
  ];
}

/** The conditional upsert denies the day (no row) when the cap is already reached. */
export function withinCap(rows: CountRow[]): boolean {
  return rows.length > 0;
}

/**
 * Atomically counts today's room and reports whether it is within the cap.
 * The conditional upsert means a denied call leaves the counter untouched and
 * returns no row.
 */
export async function consumeDailyRoom(
  db: D1Database,
  day: string,
  cap: number,
): Promise<boolean> {
  const { results } = await db
    .prepare(DAILY_ROOM_SQL)
    .bind(...dailyRoomParams(day, cap))
    .all<CountRow>();
  return withinCap(results);
}

/**
 * Gives back one room the counter took, for a create that produced no room. The count never
 * drops below zero, so a release that arrives twice cannot hand out a free room later.
 */
export async function releaseDailyRoom(
  db: D1Database,
  day: string,
): Promise<void> {
  await db.prepare(RELEASE_ROOM_SQL).bind(day).run();
}

/** Records a finished game. Failures are the caller's to swallow. */
export async function recordMatch(
  db: D1Database,
  stats: MatchStats,
): Promise<void> {
  await db
    .prepare(MATCH_STATS_SQL)
    .bind(...matchParams(stats))
    .run();
}