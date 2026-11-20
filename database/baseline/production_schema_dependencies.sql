-- Catalog metadata only. No application/auth/storage rows are selected.
BEGIN READ ONLY;
SELECT jsonb_build_object(
  'extensions', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name',e.extname,'version',e.extversion,'schema',n.nspname
    ) ORDER BY e.extname),'[]'::jsonb)
    FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
  ),
  'external_auth_triggers', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'table',rn.nspname||'.'||c.relname,'name',t.tgname,
      'definition',pg_get_triggerdef(t.oid),
      'enabled',t.tgenabled,
      'handler',pn.nspname||'.'||p.proname,
      'handler_owner',pg_get_userbyid(p.proowner),
      'handler_arguments',pg_get_function_identity_arguments(p.oid),
      'handler_extension',(
        SELECT e.extname FROM pg_depend d JOIN pg_extension e ON e.oid=d.refobjid
        WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid
          AND d.refclassid='pg_extension'::regclass AND d.deptype='e' LIMIT 1
      )
    ) ORDER BY t.tgname),'[]'::jsonb)
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace rn ON rn.oid=c.relnamespace
    JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace
    WHERE rn.nspname='auth' AND c.relname='users' AND NOT t.tgisinternal
  ),
  'public_external_dependencies', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'object',dep.identity,'object_type',dep.type,
      'dependency',ref.identity,'dependency_type',ref.type,
      'dependency_schema',ref.schema
    ) ORDER BY dep.identity,ref.identity),'[]'::jsonb)
    FROM pg_depend d
    CROSS JOIN LATERAL pg_identify_object(d.classid,d.objid,d.objsubid) dep
    CROSS JOIN LATERAL pg_identify_object(d.refclassid,d.refobjid,d.refobjsubid) ref
    WHERE dep.schema='public' AND ref.schema IS NOT NULL
      AND ref.schema NOT IN ('public','pg_catalog','information_schema')
  ),
  'public_foreign_tables', (
    SELECT coalesce(jsonb_agg(c.relname ORDER BY c.relname),'[]'::jsonb)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='f'
  )
);
ROLLBACK;
