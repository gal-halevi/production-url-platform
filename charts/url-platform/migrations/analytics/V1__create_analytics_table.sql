-- Analytics table: tracks redirect counts per short code.
-- Using BIGINT for count to safely handle high-volume URL shorteners
-- without overflow risk.
CREATE TABLE IF NOT EXISTS analytics (
    code        TEXT        PRIMARY KEY,
    count       BIGINT      NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
