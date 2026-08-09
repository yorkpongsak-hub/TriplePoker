import { ArenaCard } from '../cards/arenaDeck'
import { JokerDeclaration } from '../contracts/arenaContracts'

export interface PrivateArenaPlayerState {
  playerId: string
  hand: ArenaCard[]
  jokerDeclaration?: JokerDeclaration
}

export interface PublicArenaPlayerState {
  playerId: string
  hand: Array<ArenaCard | { kind: 'HIDDEN' }>
  jokerDeclaration?: Omit<JokerDeclaration, 'targetPile'> | JokerDeclaration
}

export function projectArenaPlayers(
  players: readonly PrivateArenaPlayerState[],
  viewerId: string,
  revealedCardIds: ReadonlySet<string> = new Set(),
  revealedPiles: ReadonlySet<number> = new Set(),
): PublicArenaPlayerState[] {
  return players.map(player => {
    const ownsHand = player.playerId === viewerId
    const hand = player.hand.map(card => ownsHand || revealedCardIds.has(card.id) ? card : { kind: 'HIDDEN' as const })
    const declaration = player.jokerDeclaration
    if (!declaration || ownsHand || declaration.mode === 'ANTE_X2' || revealedPiles.has(declaration.targetPile)) {
      return { playerId: player.playerId, hand, jokerDeclaration: declaration }
    }
    const { targetPile: _hidden, ...publicDeclaration } = declaration
    return { playerId: player.playerId, hand, jokerDeclaration: publicDeclaration }
  })
}
