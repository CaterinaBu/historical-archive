CREATE TABLE IF NOT EXISTS archive_players (
    id uuid PRIMARY KEY,
    facts jsonb NOT NULL DEFAULT '{}',
    discovered jsonb NOT NULL DEFAULT '{}',
    earned integer NOT NULL DEFAULT 0 CHECK (earned >= 0),
    reputation integer NOT NULL DEFAULT 0 CHECK (reputation >= 0),
    last_normal_result jsonb
);

CREATE TABLE IF NOT EXISTS archive_quiz_rounds (
    player_id uuid NOT NULL REFERENCES archive_players (id),
    id uuid NOT NULL,
    questions jsonb NOT NULL,
    answers jsonb NOT NULL DEFAULT '[]',
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished', 'abandoned')),
    finished_day date,
    score integer NOT NULL DEFAULT 0 CHECK (score >= 0),
    PRIMARY KEY (player_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS archive_one_active_round
    ON archive_quiz_rounds (player_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS archive_rounds_by_day
    ON archive_quiz_rounds (player_id, finished_day) WHERE finished_day IS NOT NULL;
