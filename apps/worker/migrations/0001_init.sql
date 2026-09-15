-- OpenPartyGames platform MVP schema.
-- Content pack headers, their items, the daily room counter and completed-match stats.

CREATE TABLE IF NOT EXISTS packs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  rating TEXT NOT NULL,
  language TEXT NOT NULL,
  license TEXT NOT NULL,
  attribution TEXT,
  item_count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pack_items (
  pack_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (pack_id, idx)
);

CREATE TABLE IF NOT EXISTS daily_rooms (
  day TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS match_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  player_count INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  completed INTEGER NOT NULL,
  finished_at INTEGER NOT NULL
);
