export const CREST_PER_CROWN = 12

export interface CrownCrestAmount {
  crown: number
  crestRemainder: number
  totalCrest: number
}

export function assertCrest(value: number, field = 'crest'): void {
  if (!Number.isSafeInteger(value)) throw new Error(`${field.toUpperCase()}_MUST_BE_SAFE_INTEGER`)
}

export function toTotalCrest(crown: number, crestRemainder = 0): number {
  assertCrest(crown, 'crown')
  assertCrest(crestRemainder, 'crest_remainder')
  if (crown < 0) throw new Error('CROWN_MUST_NOT_BE_NEGATIVE')
  if (crestRemainder < 0 || crestRemainder >= CREST_PER_CROWN) {
    throw new Error('CREST_REMAINDER_OUT_OF_RANGE')
  }
  const total = crown * CREST_PER_CROWN + crestRemainder
  assertCrest(total, 'total_crest')
  return total
}

export function splitTotalCrest(totalCrest: number): CrownCrestAmount {
  assertCrest(totalCrest, 'total_crest')
  if (totalCrest < 0) throw new Error('TOTAL_CREST_MUST_NOT_BE_NEGATIVE')
  const crown = Math.floor(totalCrest / CREST_PER_CROWN)
  const crestRemainder = totalCrest % CREST_PER_CROWN
  return { crown, crestRemainder, totalCrest }
}
