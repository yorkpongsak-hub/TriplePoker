-- PostgreSQL round-trip test, NOT executed in2D.1.
-- Requires088–091 already applied to confirmed staging and explicit test approval.
-- Run with psql -X -v ON_ERROR_STOP=1; all fixture rows roll back.
BEGIN;
DO $$
DECLARE
  plan text;
  event jsonb;
  snapshot jsonb;
  fixture_id uuid;
  player_id uuid := gen_random_uuid();
  session_id uuid := gen_random_uuid();
  bad jsonb;
BEGIN
  FOREACH plan IN ARRAY ARRAY['FREE','PRO','PRO_PLUS'] LOOP
    fixture_id := gen_random_uuid();
    snapshot := jsonb_build_object('plan',plan,'entitled',plan <> 'FREE',
      'entitlements','{"hasNoForcedInterstitialAds":false,"canUseRewardedAdsForExtras":false,"canCreatePrivateTable":false,"canUsePrivateTablePin":false,"canUseGolfGroupMode":false,"canViewAnalysisWithoutAd":false,"canUseProPlusSocialBenefits":false}'::jsonb);
    event := jsonb_build_object('event_id',fixture_id,'schema_version',1,
      'event_name','app_open','occurred_at',now(),'environment','development',
      'source','client','player_id',player_id,'session_id',session_id,
      'app_version','1.0.0','platform','android','properties','{}'::jsonb,
      'membership',snapshot);
    PERFORM public.telemetry_ingest_events(jsonb_build_array(event,event));
    IF (SELECT count(*) FROM public.telemetry_events t WHERE t.event_id=fixture_id) <> 1
       OR (SELECT t.membership FROM public.telemetry_events t WHERE t.event_id=fixture_id) IS DISTINCT FROM snapshot THEN
      RAISE EXCEPTION 'MEMBERSHIP_ROUND_TRIP_FAILED: %',plan;
    END IF;
    PERFORM public.telemetry_ingest_events(jsonb_build_array(
      jsonb_set(event,'{membership,entitled}',to_jsonb(plan = 'FREE'))));
    IF (SELECT t.membership FROM public.telemetry_events t WHERE t.event_id=fixture_id) IS DISTINCT FROM snapshot THEN
      RAISE EXCEPTION 'RETRY_OVERWROTE_SNAPSHOT';
    END IF;
  END LOOP;
  fixture_id := gen_random_uuid();
  event := jsonb_set(event - 'membership','{event_id}',to_jsonb(fixture_id));
  PERFORM public.telemetry_ingest_events(jsonb_build_array(event));
  IF NOT EXISTS (SELECT 1 FROM public.telemetry_events t WHERE t.event_id=fixture_id AND t.membership IS NULL) THEN
    RAISE EXCEPTION 'LEGACY_ENVELOPE_FAILED';
  END IF;
  FOREACH bad IN ARRAY ARRAY[
    jsonb_set(snapshot,'{plan}','"GOLD"'::jsonb),
    snapshot || '{"payment_token":"forbidden"}'::jsonb,
    snapshot - 'entitled',
    jsonb_set(snapshot,'{entitled}','"true"'::jsonb),
    jsonb_set(snapshot,'{entitlements}','{}'::jsonb),
    jsonb_set(snapshot,'{entitlements}',snapshot->'entitlements' || '{"email":"forbidden"}'::jsonb)
  ] LOOP
    BEGIN
      PERFORM public.telemetry_ingest_events(jsonb_build_array(
        event || jsonb_build_object('event_id',gen_random_uuid(),'membership',bad)));
      RAISE EXCEPTION 'INVALID_MEMBERSHIP_ACCEPTED';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
  END LOOP;
END;
$$;
ROLLBACK;
