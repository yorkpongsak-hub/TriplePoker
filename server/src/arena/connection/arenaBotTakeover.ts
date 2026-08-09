import { ArenaArrangement } from '../arrangement/arenaArrangement'
import { ArenaMatchAction, ArenaMatchSnapshot } from '../match/arenaMatchEngine'

export interface ArenaBotMemory {
  arrangement: ArenaArrangement
  discardCardId?: string
}

export interface ArenaBotPolicy {
  bidCrest?: 0 | 3 | 6 | 9 | 12
  blindCardIndex?: 0 | 1
  gfDecision?: 'CALL' | 'FOLD'
  jokerMode?: 'WILD' | 'ANTE_X2'
  jokerTargetPile?: 1 | 2 | 3
  availableCrest?: number
}

// A human-seat takeover is a continuity aid, not another competitive AI.
// Preserve the player's last server-accepted layout and only append newly
// acquired cards to pile 3. If no layout exists, use deal order. In
// particular, never search for a stronger arrangement on the player's behalf.
export function takeoverArrangement(
  heldCardIds: readonly string[],
  previous?: ArenaArrangement,
): ArenaArrangement {
  const held = new Set(heldCardIds)
  const used = new Set<string>()
  const keep = (ids: readonly string[], limit?: number): string[] => {
    const result: string[] = []
    for (const id of ids) {
      if (!held.has(id) || used.has(id) || (limit !== undefined && result.length >= limit)) continue
      used.add(id)
      result.push(id)
    }
    return result
  }

  const pile1 = keep(previous?.pile1 ?? heldCardIds, 3)
  const pile2 = keep(previous?.pile2 ?? heldCardIds, 3)
  const pile3 = keep(previous?.pile3 ?? heldCardIds)
  for (const id of heldCardIds) {
    if (used.has(id)) continue
    if (pile1.length < 3) pile1.push(id)
    else if (pile2.length < 3) pile2.push(id)
    else pile3.push(id)
    used.add(id)
  }
  return { pile1, pile2, pile3 }
}

export function buildArenaBotAction(
  snapshot: ArenaMatchSnapshot,
  actorId: string,
  memory: ArenaBotMemory,
  policy: ArenaBotPolicy = {},
): ArenaMatchAction {
  if (!snapshot.pendingActorIds.includes(actorId)) throw new Error('ARENA_BOT_ACTOR_NOT_PENDING')
  if (!memory.arrangement) throw new Error('ARENA_BOT_REQUIRES_VALID_ARRANGEMENT')
  const actionId = `bot:${snapshot.matchId}:${snapshot.gameNumber}:${snapshot.phase}:${actorId}:v${snapshot.version}`
  switch (snapshot.phase) {
    case 'ARRANGE_1': return { type: 'ARRANGE_1', actionId, actorId, ...memory.arrangement }
    case 'AUCTION_FACE_UP': return { type: 'FACE_UP_BID', actionId, actorId, amountCrest: policy.bidCrest ?? 0 }
    case 'AUCTION_BLIND': return { type: 'BLIND_BID', actionId, actorId, amountCrest: policy.bidCrest ?? 0, cardIndex: policy.blindCardIndex ?? 0 }
    case 'FINAL_ARRANGE': return { type: 'FINAL_ARRANGE', actionId, actorId, ...memory.arrangement }
    case 'JOKER_DECLARE': return {
      type: 'JOKER_DECLARE', actionId, actorId, mode: policy.jokerMode ?? 'WILD',
      targetPile: policy.jokerTargetPile ?? 3, availableCrest: policy.availableCrest ?? 0,
    }
    case 'DISCARD':
      if (!memory.discardCardId) throw new Error('ARENA_BOT_REQUIRES_DISCARD_CARD')
      return { type: 'DISCARD', actionId, actorId, cardId: memory.discardCardId }
    case 'FINAL_LOCK': return { type: 'FINAL_LOCK', actionId, actorId, ...memory.arrangement }
    case 'GF_PILE_2': case 'GF_PILE_3_ROUND_1': case 'GF_PILE_3_ROUND_2':
      return { type: 'GF_ACTION', actionId, actorId, decision: policy.gfDecision ?? 'FOLD' }
    default: throw new Error('ARENA_BOT_PHASE_HAS_NO_ACTION')
  }
}
