-- Fix dropped optional envelope snapshot; historical migrations remain unchanged.
BEGIN;
ALTER TABLE public.telemetry_events ADD COLUMN membership jsonb;
ALTER TABLE public.telemetry_events ADD CONSTRAINT telemetry_membership_check CHECK (
  membership IS NULL OR COALESCE(
    jsonb_typeof(membership) = 'object'
    AND membership - ARRAY['plan','entitled','entitlements'] = '{}'::jsonb
    AND membership->>'plan' IN ('FREE','PRO','PRO_PLUS')
    AND jsonb_typeof(membership->'entitled') = 'boolean'
    AND jsonb_typeof(membership->'entitlements') = 'object'
    AND (membership->'entitlements') - ARRAY['hasNoForcedInterstitialAds','canUseRewardedAdsForExtras','canCreatePrivateTable','canUsePrivateTablePin','canUseGolfGroupMode','canViewAnalysisWithoutAd','canUseProPlusSocialBenefits'] = '{}'::jsonb
    AND jsonb_typeof(membership->'entitlements'->'hasNoForcedInterstitialAds') = 'boolean'
    AND jsonb_typeof(membership->'entitlements'->'canUseRewardedAdsForExtras') = 'boolean'
    AND jsonb_typeof(membership->'entitlements'->'canCreatePrivateTable') = 'boolean'
    AND jsonb_typeof(membership->'entitlements'->'canUsePrivateTablePin') = 'boolean'
    AND jsonb_typeof(membership->'entitlements'->'canUseGolfGroupMode') = 'boolean'
    AND jsonb_typeof(membership->'entitlements'->'canViewAnalysisWithoutAd') = 'boolean'
    AND jsonb_typeof(membership->'entitlements'->'canUseProPlusSocialBenefits') = 'boolean'
  , false)
);
COMMENT ON COLUMN public.telemetry_events.membership IS 'Optional anonymous FREE/PRO/PRO_PLUS entitlement snapshot; no account, payment or personal fields.';
CREATE OR REPLACE FUNCTION public.telemetry_ingest_events(p_events jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF jsonb_typeof(p_events) <> 'array' OR jsonb_array_length(p_events) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'INVALID_TELEMETRY_BATCH';
  END IF;
  INSERT INTO public.telemetry_events(event_id,schema_version,event_name,occurred_at,environment,source,player_id,session_id,app_version,build_number,platform,properties,membership)
  SELECT event_id,schema_version,event_name,occurred_at,environment,source,player_id,session_id,app_version,build_number,platform,properties,membership
  FROM jsonb_to_recordset(p_events) AS e(event_id uuid,schema_version smallint,event_name text,occurred_at timestamptz,environment text,source text,player_id uuid,session_id uuid,app_version text,build_number text,platform text,properties jsonb,membership jsonb)
  ON CONFLICT DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.telemetry_ingest_events(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.telemetry_ingest_events(jsonb) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;

