ALTER TABLE archive_players
    ADD COLUMN IF NOT EXISTS finds jsonb NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS audio_settings jsonb;
