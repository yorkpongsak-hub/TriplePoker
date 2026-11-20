import { readFileSync } from 'fs'
import { resolve } from 'path'
import { membershipSchema } from '../../src/telemetry/schema'

test('additive nullable column validates the same strict membership allowlist as ingestion', () => {
  const sql = readFileSync(resolve(__dirname, '../../../supabase/migrations/091_telemetry_membership_persistence.sql'), 'utf8')
  expect(sql).toContain('ADD COLUMN membership jsonb;')
  expect(sql).toContain('membership IS NULL OR COALESCE(')
  expect(sql).toContain("IN ('FREE','PRO','PRO_PLUS')")
  expect(sql).toContain("membership - ARRAY['plan','entitled','entitlements']")
  for (const key of Object.keys(membershipSchema.shape.entitlements.shape)) {
    expect(sql).toContain("jsonb_typeof(membership->'entitlements'->'" + key + "') = 'boolean'")
  }
  expect(sql).toContain("jsonb_typeof(membership->'entitled') = 'boolean'")
  expect(sql).not.toMatch(/NOT NULL|DROP COLUMN|UPDATE public|DELETE FROM|TRUNCATE/i)
})

test('RPC mapping adds only membership; batch bounds, privileges and conflict handling remain identical', () => {
  const read = (name: string) => readFileSync(resolve(__dirname, '../../../supabase/migrations/' + name), 'utf8')
  const old = read('089_telemetry_gameplay_funnel.sql')
  const current = read('091_telemetry_membership_persistence.sql')
  const rpc = (sql: string) => sql.slice(sql.indexOf('CREATE'), sql.indexOf("GRANT EXECUTE ON FUNCTION public.telemetry_ingest_events(jsonb) TO service_role;") + "GRANT EXECUTE ON FUNCTION public.telemetry_ingest_events(jsonb) TO service_role;".length).trim()
  const oldRpc = rpc(old.slice(old.indexOf('CREATE FUNCTION')))
  const normalized = rpc(current.slice(current.indexOf('CREATE OR REPLACE FUNCTION')))
    .replace('CREATE OR REPLACE FUNCTION', 'CREATE FUNCTION')
    .replace(/,membership jsonb/g, '').replace(/,membership/g, '')
  expect(normalized).toBe(oldRpc)
  expect(current).toContain('platform,properties,membership)')
  expect(current).toMatch(/SELECT[^\n]+platform,properties,membership/)
  expect(current).toContain('properties jsonb,membership jsonb)')
})
