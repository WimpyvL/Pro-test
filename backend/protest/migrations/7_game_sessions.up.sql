CREATE TABLE game_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX game_sessions_user_id_started_at_idx ON game_sessions (user_id, started_at DESC);
CREATE INDEX game_sessions_game_id_started_at_idx ON game_sessions (game_id, started_at DESC);
CREATE INDEX game_sessions_active_idx ON game_sessions (user_id, game_id) WHERE ended_at IS NULL;
