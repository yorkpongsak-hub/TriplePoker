-- READ ONLY. Run only after owner confirms the separate staging project.
BEGIN READ ONLY;
SELECT current_database(), current_user;
SELECT to_regclass('supabase_migrations.schema_migrations') AS migration_history,
       to_regclass('public.users') AS users_table,
       to_regclass('public.telemetry_events') AS telemetry_table;
SELECT CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL
  THEN 'SELECT ''Migration history absent: STOP and reconcile manual SQL records/schema before applying files.'' AS action'
  ELSE 'SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version'
END
\gexec
SELECT column_name, data_type, is_nullable
FROM information_schema.columns WHERE table_schema='public' AND table_name='telemetry_events'
ORDER BY ordinal_position;
SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='telemetry_events';
SELECT conname,pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid=to_regclass('public.telemetry_events');
SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=to_regclass('public.telemetry_events');
SELECT grantee,privilege_type FROM information_schema.table_privileges
WHERE table_schema='public' AND table_name='telemetry_events';
SELECT * FROM pg_policies WHERE schemaname='public' AND tablename='telemetry_events';
SELECT p.proname,p.prosecdef,p.proacl,pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='telemetry_ingest_events';
ROLLBACK;
