-- TriplePoker Staging security audit. READ-ONLY: safe to run in Supabase SQL Editor.

-- Public tables without RLS should be empty before launch.
select n.nspname as schema_name, c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
order by c.relname;

-- Direct table privileges granted to app roles. Review every write privilege.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

-- SECURITY DEFINER functions must have an explicit search_path.
select n.nspname as schema_name, p.proname,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and not coalesce(p.proconfig, array[]::text[]) && array['search_path=public', 'search_path=pg_catalog, public']
order by p.proname;

-- Sensitive definer functions must not be callable by PUBLIC/anon/authenticated.
select routine_name, grantee, privilege_type
from information_schema.role_routine_grants
where specific_schema = 'public'
  and grantee in ('PUBLIC', 'anon', 'authenticated')
  and privilege_type = 'EXECUTE'
order by routine_name, grantee;

-- Policy inventory for manual owner/participant-scope review.
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
