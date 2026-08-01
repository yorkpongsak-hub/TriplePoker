import fs from 'fs'
import path from 'path'

const sql = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/019_last_boss_atomic_succession.sql'), 'utf8')

describe('Gate 10.4 succession migration contract', () => {
  test('activates CAELUM and atomically rotates one active reign', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION sovereign_activate_caelum')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION sovereign_begin_last_boss_succession')
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended('LAST_BOSS_ACTIVE_REIGN'")
    expect(sql).toContain("UPDATE last_boss_reigns SET status = 'CLOSED'")
  })

  test('permanently reserves the former player name and requires rename', () => {
    expect(sql).toContain('INSERT INTO last_boss_reserved_names')
    expect(sql).toContain('INSERT INTO reserved_names')
    expect(sql).toContain('INSERT INTO last_boss_mandatory_renames')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION sovereign_complete_mandatory_rename')
    expect(sql).toContain('completion_idempotency_key = p_idempotency_key')
  })

  test('grants cosmetic-only conquest entitlements and protects RPCs', () => {
    expect(sql).toContain("'THRONEBREAKER'")
    expect(sql).toContain("'LAST_BOSS_TABLE_SKIN'")
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION sovereign_begin_last_boss_succession')
  })
})
