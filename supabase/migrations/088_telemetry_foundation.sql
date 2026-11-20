-- ใช้ SQL Editor ใน staging ก่อน ไม่รัน migration เก่าใหม่ระหว่าง deploy
BEGIN;
CREATE TABLE public.telemetry_events (
  event_id uuid PRIMARY KEY,
  schema_version smallint NOT NULL CHECK (schema_version = 1),
  event_name text NOT NULL CHECK (event_name IN ('app_open', 'session_start', 'session_end', 'telemetry_upload_failure')),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  environment text NOT NULL CHECK (environment IN ('development', 'production')),
  source text NOT NULL CHECK (source = 'client'),
  player_id uuid NOT NULL,
  session_id uuid NOT NULL,
  app_version text NOT NULL CHECK (length(app_version) BETWEEN 1 AND 40),
  build_number text CHECK (length(build_number) BETWEEN 1 AND 20),
  platform text NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  properties jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(properties) = 'object' AND octet_length(properties::text) <= 4096)
);
CREATE INDEX telemetry_events_time_idx ON public.telemetry_events(environment, occurred_at);
CREATE INDEX telemetry_events_name_time_idx ON public.telemetry_events(environment, event_name, occurred_at);
CREATE INDEX telemetry_events_player_time_idx ON public.telemetry_events(environment, player_id, occurred_at);
ALTER TABLE public.telemetry_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telemetry_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.telemetry_events TO service_role;
COMMENT ON TABLE public.telemetry_events IS 'Launch analytics; anonymous installation UUIDs only. No account IDs, credentials, raw errors or gameplay data in foundation 2A.';
NOTIFY pgrst, 'reload schema';
COMMIT;
