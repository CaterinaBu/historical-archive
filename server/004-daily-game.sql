ALTER TABLE archive_players
    ADD COLUMN IF NOT EXISTS first_seen_day date,
    ADD COLUMN IF NOT EXISTS last_entry_day date,
    ADD COLUMN IF NOT EXISTS salary_day date,
    ADD COLUMN IF NOT EXISTS salary_joke text,
    ADD COLUMN IF NOT EXISTS salary_seen_day date,
    ADD COLUMN IF NOT EXISTS yesterday_seen_day date,
    ADD COLUMN IF NOT EXISTS display_name text,
    ADD COLUMN IF NOT EXISTS display_photo text;

ALTER TABLE archive_quiz_rounds
    ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'normal',
    ADD COLUMN IF NOT EXISTS started_day date;

CREATE UNIQUE INDEX IF NOT EXISTS archive_one_daily_result
    ON archive_quiz_rounds (player_id, started_day)
    WHERE mode = 'day' AND status = 'finished';

CREATE TABLE IF NOT EXISTS archive_daily_tasks (
    day date PRIMARY KEY,
    person_id text NOT NULL
);

CREATE TABLE IF NOT EXISTS archive_daily_scores (
    player_id uuid NOT NULL REFERENCES archive_players (id),
    day date NOT NULL,
    score integer NOT NULL CHECK (score >= 0),
    name text,
    photo text,
    PRIMARY KEY (player_id, day)
);

CREATE INDEX IF NOT EXISTS archive_daily_score_rank ON archive_daily_scores (day, score DESC);

INSERT INTO archive_daily_scores (player_id, day, score)
    SELECT player_id, finished_day, SUM(score)::integer
      FROM archive_quiz_rounds
     WHERE finished_day IS NOT NULL
     GROUP BY player_id, finished_day
    ON CONFLICT (player_id, day) DO NOTHING;

UPDATE archive_players AS player
   SET first_seen_day = history.first_day, last_entry_day = history.last_day
  FROM (
    SELECT player_id, MIN(finished_day) AS first_day, MAX(finished_day) AS last_day
      FROM archive_quiz_rounds WHERE finished_day IS NOT NULL GROUP BY player_id
  ) AS history
 WHERE player.id = history.player_id AND player.first_seen_day IS NULL;
