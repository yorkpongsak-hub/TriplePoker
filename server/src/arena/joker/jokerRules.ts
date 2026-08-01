import { ArenaPile, JokerDeclaration, JokerMode } from '../contracts/arenaContracts'

export interface DeclareJokerInput {
  mode: JokerMode
  targetPile: ArenaPile
  declaredAt: string
  availableCrest: number
  requiredMatchedAnteCrest: number
  communityPile3Joker?: boolean
}

export function declareJoker(input: DeclareJokerInput): JokerDeclaration {
  if (input.communityPile3Joker) {
    return { mode: 'WILD', targetPile: 3, forcedWild: true, declaredAt: input.declaredAt }
  }
  if (input.mode === 'ANTE_X2' && input.availableCrest < input.requiredMatchedAnteCrest) {
    throw new Error('INSUFFICIENT_CREST_FOR_ANTE_X2')
  }
  return { mode: input.mode, targetPile: input.targetPile, forcedWild: false, declaredAt: input.declaredAt }
}

export function autoLockJoker(declaredAt: string): JokerDeclaration {
  return { mode: 'WILD', targetPile: 3, forcedWild: false, declaredAt }
}

export function extraAnteForJoker(
  declaration: JokerDeclaration,
  baseAnteCrest: Readonly<Record<ArenaPile, number>>,
): number {
  return declaration.mode === 'ANTE_X2' ? baseAnteCrest[declaration.targetPile] : 0
}
