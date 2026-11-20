-- เพิ่มเฉพาะ gameplay/funnel; เก็บข้อมูลและ schema เดิมไว้
BEGIN;
ALTER TABLE public.telemetry_events DROP CONSTRAINT telemetry_events_event_name_check;
ALTER TABLE public.telemetry_events ADD CONSTRAINT telemetry_events_event_name_check CHECK (event_name IN (
  'app_open','session_start','session_end','telemetry_upload_failure','game_start','game_end',
  'tutorial_start','tutorial_step','tutorial_complete','first_game_complete','launch_step'
));
ALTER TABLE public.telemetry_events DROP CONSTRAINT telemetry_events_source_check;
ALTER TABLE public.telemetry_events ADD CONSTRAINT telemetry_events_source_check CHECK (source IN ('client','server'));
ALTER TABLE public.telemetry_events ADD CONSTRAINT telemetry_game_authority_check CHECK (
  event_name NOT IN ('game_start','game_end','first_game_complete') OR source='server'
  OR COALESCE(properties->>'mode'='training' AND properties->>'tier'='training',false)
);
CREATE UNIQUE INDEX telemetry_game_once_idx ON public.telemetry_events(environment,player_id,event_name,(properties->>'game_id'))
  WHERE event_name IN ('game_start','game_end');
CREATE UNIQUE INDEX telemetry_first_game_once_idx ON public.telemetry_events(environment,player_id)
  WHERE event_name='first_game_complete';

-- ไม่ระบุ conflict target เพื่อรองรับทั้ง UUID ซ้ำและ lifecycle key ซ้ำใน batch เดียว
CREATE FUNCTION public.telemetry_ingest_events(p_events jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF jsonb_typeof(p_events) <> 'array' OR jsonb_array_length(p_events) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'INVALID_TELEMETRY_BATCH';
  END IF;
  INSERT INTO public.telemetry_events(event_id,schema_version,event_name,occurred_at,environment,source,player_id,session_id,app_version,build_number,platform,properties)
  SELECT event_id,schema_version,event_name,occurred_at,environment,source,player_id,session_id,app_version,build_number,platform,properties
  FROM jsonb_to_recordset(p_events) AS e(event_id uuid,schema_version smallint,event_name text,occurred_at timestamptz,environment text,source text,player_id uuid,session_id uuid,app_version text,build_number text,platform text,properties jsonb)
  ON CONFLICT DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.telemetry_ingest_events(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.telemetry_ingest_events(jsonb) TO service_role;
COMMENT ON TABLE public.telemetry_events IS 'Anonymous launch analytics. Server owns online gameplay, client owns training/funnel. No raw cards, account IDs, economy, ad or VIP payloads.';
NOTIFY pgrst,'reload schema';
COMMIT;
