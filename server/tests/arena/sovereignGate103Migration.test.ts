import fs from 'fs'
import path from 'path'

const sql = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/018_sovereign_wallet_and_standby_rpc.sql'),
  'utf8',
)

describe('Gate 10.3 migration contract', () => {
  test('adds source ledger and mixed-source atomic RPCs', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS sovereign_wallet_source_ledger')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION sovereign_reserve_crown')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION sovereign_settle_crown_reservation')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION sovereign_release_crown_reservation')
    expect(sql).toContain('v_take_earned := LEAST')
    expect(sql).toContain("IF v_purchase_debt > 0 THEN RAISE EXCEPTION 'PURCHASE_DEBT_ACTIVE'")
  })

  test('uses row locks, advisory idempotency, and FCFS standby claim', () => {
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toContain('FOR UPDATE OF entry SKIP LOCKED LIMIT 1')
    expect(sql).toContain('ORDER BY entry.joined_at_server, entry.queue_sequence')
    expect(sql).toContain("selection_source = 'LIVE_STANDBY'")
  })

  test('keeps RPCs service-role only and reloads PostgREST', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION sovereign_reserve_crown')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION sovereign_claim_first_standby')
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'")
  })
})
