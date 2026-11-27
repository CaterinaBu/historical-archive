ALTER TABLE archive_players
    ADD COLUMN IF NOT EXISTS vk_app_id text,
    ADD COLUMN IF NOT EXISTS vk_user_id text;

CREATE UNIQUE INDEX IF NOT EXISTS archive_vk_player
    ON archive_players (vk_app_id, vk_user_id);
