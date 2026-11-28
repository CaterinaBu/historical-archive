ALTER TABLE archive_players
    ADD COLUMN IF NOT EXISTS paid integer NOT NULL DEFAULT 0 CHECK (paid >= 0),
    ADD COLUMN IF NOT EXISTS donations integer NOT NULL DEFAULT 0 CHECK (donations >= 0),
    ADD COLUMN IF NOT EXISTS inventory jsonb NOT NULL DEFAULT '{}';

ALTER TABLE archive_quiz_rounds
    ADD COLUMN IF NOT EXISTS used_hints jsonb NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS retry_attempts jsonb NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS archive_shop_operations (
    player_id uuid NOT NULL REFERENCES archive_players (id),
    id uuid NOT NULL,
    command jsonb NOT NULL,
    receipt jsonb NOT NULL,
    PRIMARY KEY (player_id, id)
);
