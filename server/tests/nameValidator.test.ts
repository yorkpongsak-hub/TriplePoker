// ─────────────────────────────────────────────────────────────────────────────
// nameValidator.test.ts — Unit Tests สำหรับ 3-Layer Name Protection
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// อ้างอิง: docs/TriplePoker_NameProtection_Spec_v1_0.md
// ─────────────────────────────────────────────────────────────────────────────

// ─── Mock supabase query chain: .from(table).select(cols).eq(col, val).maybeSingle() ───

const mockMaybeSingle = jest.fn()
const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }))
const mockSelect = jest.fn(() => ({ eq: mockEq }))
const mockFrom = jest.fn(() => ({ select: mockSelect }))

jest.mock('../src/config/supabase', () => ({
  supabase: {
    from: mockFrom,
  },
}))

import { validateDisplayName, normalizeName } from '../src/utils/nameValidator'

beforeEach(() => {
  mockMaybeSingle.mockReset()
  mockEq.mockClear()
  mockSelect.mockClear()
  mockFrom.mockClear()
})

// ────────────────────────────────────────────────────────────
// GROUP 1: normalizeName — pure function
// ────────────────────────────────────────────────────────────

describe('normalizeName', () => {
  test('Case 1: lowercase ทั้งหมด', () => {
    expect(normalizeName('I am York')).toBe('i am york')
  })

  test('Case 2: trim leading/trailing spaces', () => {
    expect(normalizeName('  I am York  ')).toBe('i am york')
  })

  test('Case 3: collapse multiple spaces เป็น 1', () => {
    expect(normalizeName('I  am   York')).toBe('i am york')
  })

  test('Case 4: รวมทั้ง 3 กฎพร้อมกัน', () => {
    expect(normalizeName('  I  AM   York  ')).toBe('i am york')
  })
})

// ────────────────────────────────────────────────────────────
// GROUP 2: Format Check (ก่อนถึง Layer 1)
// ────────────────────────────────────────────────────────────

describe('validateDisplayName — format check', () => {
  test('Case 5: สั้นกว่า 3 ตัวอักษร → INVALID_FORMAT', async () => {
    const result = await validateDisplayName('ab')
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('INVALID_FORMAT')
    expect(mockFrom).not.toHaveBeenCalled()
  })

  // Patch (2026-07-17): ความยาวสูงสุดเปลี่ยนจาก 30 → 9 ตัวอักษร
  test('Case 6: ยาวกว่า 9 ตัวอักษร → INVALID_FORMAT', async () => {
    const result = await validateDisplayName('a'.repeat(10))
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('INVALID_FORMAT')
    expect(mockFrom).not.toHaveBeenCalled()
  })

  test('Case 7: มีอักขระต้องห้าม (emoji/symbol) → INVALID_FORMAT', async () => {
    const result = await validateDisplayName('York😀!!')
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('INVALID_FORMAT')
    expect(mockFrom).not.toHaveBeenCalled()
  })

  test('Case 8: ชื่อไทยผ่าน format check ได้ (ไปต่อ Layer check)', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })

    // Patch (2026-07-17): เดิมใช้ชื่อไทยยาว ("ยอร์คผู้ยิ่งใหญ่") เกิน 9 ตัวอักษรไปแล้วตามกติกาใหม่ —
    // เปลี่ยนเป็นชื่อสั้นลงที่ยังทดสอบ intent เดิม (ภาษาไทยผ่าน FORMAT_REGEX ได้)
    const result = await validateDisplayName('ยอร์ค')
    expect(result.allowed).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────
// GROUP 3: 3-Layer Protected Name Check
// ────────────────────────────────────────────────────────────

describe('validateDisplayName — 3-layer check', () => {
  test('Case 9: ตรงกับ bosses (Layer 1) → BOSS_NAME, ไม่ query ต่อ', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'boss-1' }, error: null })

    const result = await validateDisplayName('I am York')
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('BOSS_NAME')
    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(mockFrom).toHaveBeenCalledWith('bosses')
  })

  test('Case 10: ไม่ตรง bosses แต่ตรง graveyard (Layer 2) → GRAVEYARD_NAME, ไม่ query reserved_names ต่อ', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: 'grave-1' }, error: null })

    // Patch (2026-07-17): "Some Old Boss" เกิน 9 ตัวอักษร — เปลี่ยนเป็นชื่อสั้นลง (mock DB response
    // ไม่ได้อิงชื่อจริงอยู่แล้ว แค่ทดสอบ code path Layer 2)
    const result = await validateDisplayName('OldBoss1')
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('GRAVEYARD_NAME')
    expect(mockFrom).toHaveBeenCalledTimes(2)
    expect(mockFrom).toHaveBeenNthCalledWith(1, 'bosses')
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'graveyard')
  })

  test('Case 11: ไม่ตรง bosses/graveyard แต่ตรง reserved_names (Layer 3) → RESERVED_NAME', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: 'res-1' }, error: null })

    const result = await validateDisplayName('Admin')
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('RESERVED_NAME')
    expect(mockFrom).toHaveBeenCalledTimes(3)
    expect(mockFrom).toHaveBeenNthCalledWith(3, 'reserved_names')
  })

  test('Case 12: ไม่ตรงทุก Layer → allowed true', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })

    // Patch (2026-07-17): "Regular Player" เกิน 9 ตัวอักษร — เปลี่ยนเป็นชื่อสั้นลง
    const result = await validateDisplayName('Player1')
    expect(result).toEqual({ allowed: true })
  })

  test('Case 13: normalize ก่อนเทียบ — เว้นวรรค/ตัวพิมพ์ต่างกันยังต้องจับได้', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'boss-1' }, error: null })

    // Patch (2026-07-17): เดิม '  i   AM   york  ' trim แล้วยาว 13 ตัวอักษร เกิน limit ใหม่ (9) ไปแล้ว
    // ก่อนถึง DB เลย — เปลี่ยนเป็นสตริงสั้นลงที่ยังทดสอบ trim/collapse-space/lowercase เหมือนเดิม
    await validateDisplayName('  Hi  Bob  ')
    expect(mockEq).toHaveBeenCalledWith('normalized_name', 'hi bob')
  })
})

// ────────────────────────────────────────────────────────────
// GROUP 4: Fail-safe เมื่อ DB error (spec §10 Edge Cases)
// ────────────────────────────────────────────────────────────

describe('validateDisplayName — DB fail-safe', () => {
  test('Case 14: bosses query error → reject ทันที (DB_ERROR)', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })

    const result = await validateDisplayName('Some Name')
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('DB_ERROR')
    expect(result.message).toBe('Please try again.')
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  test('Case 15: graveyard query error → reject ทันที (DB_ERROR)', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })

    const result = await validateDisplayName('Some Name')
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('DB_ERROR')
    expect(mockFrom).toHaveBeenCalledTimes(2)
  })

  test('Case 16: reserved_names query error → reject ทันที (DB_ERROR)', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })

    const result = await validateDisplayName('Some Name')
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('DB_ERROR')
    expect(mockFrom).toHaveBeenCalledTimes(3)
  })
})
