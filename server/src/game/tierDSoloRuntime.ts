import type { Server } from 'socket.io'
import { createTierDLevel, resolveTierDGame, submitTierDArrangement, swapTierDHandCard, type TierDArrangement, type TierDLevelState } from './tierDSolo'
import { handRankLabel } from './handEvaluator'
import { persistTierDLevelOutcome } from './tierDSoloProgress'
import { supabaseAdmin } from '../config/supabase'
import type { Card } from './deck'
import { consumeTierDRuntimeItem, getTierDItemInventory, grantTierDLevelRandomItem, recordTierDPersonalBest } from './tierDRewardService'
import type { TierDRewardItem } from './tierDRewards'

type CardKeys = { pile1: string[]; pile2: string[]; pile3: string[] }
type RevealHand = { bestFive: string[]; unusedCards: string[]; rank: string }
type RevealPayload = { game: 1|2|3; winnerId: string|null; points: number; bonusPoints?: number; hands: Record<string, RevealHand> }
type Session = { roomId: string; userId: string; state: TierDLevelState; currentGame: 1|2|3; matchNumber: 1|2|3; cumulativeScores: Record<string,number>; arranged: boolean; inventory: Record<TierDRewardItem,number>; isVip: boolean; matchStartedAt: number; frozenMs: number; timerPausedAt?: number; reveal?: RevealPayload }
const sessions = new Map<string, Session>()
const cardKey=(c:Card)=>`${c.rank.toLowerCase()}${({spades:'s',hearts:'h',diamonds:'d',clubs:'c'}[c.suit])}`

function keyArrangement(state: TierDLevelState, userId: string, source: CardKeys): TierDArrangement {
  const cards = new Map(state.dealtHands[userId].map(card => [cardKey(card), card]))
  const resolve = (keys: string[]) => keys.map(key => {
    const card = cards.get(key)
    if (!card) throw new Error('That card is not in this Tier D deal')
    return card
  })
  return { pile1: resolve(source.pile1), pile2: resolve(source.pile2), pile3: resolve(source.pile3) }
}

function emitState(io:Server,s:Session) {
  const scores=Object.fromEntries(s.state.seats.map(seat=>[seat.id,(s.cumulativeScores[seat.id]??0)+(s.state.scores[seat.id]??0)]))
  io.to(s.roomId).emit('tier_d_state',{
    roomId:s.roomId, level:s.state.level, matchNumber:s.matchNumber, totalMatches:3, currentGame:s.currentGame,
    seats:s.state.seats.map(x=>({id:x.id,isBot:x.isBot,name:x.bot?.name??'You',emoji:x.bot?.emoji??'🙂'})),
    cards:s.state.dealtHands[s.userId].map(cardKey),
    piles:s.arranged ? Object.fromEntries(Object.entries(s.state.arrangements[s.userId]!).map(([pile,cards])=>[pile,cards.map(cardKey)])) : undefined,
    community:{ pile1:s.state.communityPiles.pile1.map(cardKey), pile2:s.state.communityPiles.pile2.map(cardKey), pile3:s.state.communityPiles.pile3.map(cardKey) },
    scores, phase:s.arranged ? (s.reveal?'revealed':'ready') : 'arranging',
    completedPiles:s.state.gameResults.map(result=>({game:result.game,winnerId:result.winnerId,points:result.points})), reveal:s.reveal,
    inventory:s.inventory, matchStartedAt:s.matchStartedAt, frozenMs:s.frozenMs, timerPausedAt:s.timerPausedAt,
  })
}

export async function startTierDSolo(io:Server,roomId:string,userId:string) {
  const {data}=await supabaseAdmin.from('users').select('tier_d_solo_level,vip_status').eq('user_id',userId).maybeSingle()
  const level=Math.max(1,data?.tier_d_solo_level??1)
  const state=createTierDLevel(level,userId)
  const inventory=await getTierDItemInventory(userId).catch(()=>({single_card_swap:0,full_redraw:0,bomb_defuser:0}))
  const s:Session={roomId,userId,state,currentGame:1,matchNumber:1,cumulativeScores:Object.fromEntries(state.seats.map(seat=>[seat.id,0])),arranged:false,inventory,isVip:data?.vip_status==='vip'||data?.vip_status==='vip_pro',matchStartedAt:Date.now(),frozenMs:0}
  sessions.set(roomId,s); emitState(io,s)
}
export function resumeTierDSolo(io:Server,roomId:string,userId:string) { const s=sessions.get(roomId); if(!s||s.userId!==userId)return false; emitState(io,s);return true }

function revealCurrentTierDGame(io: Server, s: Session): void {
 const game=s.currentGame; const result=resolveTierDGame(s.state,game)
 s.reveal={game,winnerId:result.winnerId,points:result.points,bonusPoints:result.bonusPoints,hands:Object.fromEntries(Object.entries(result.hands).map(([id,h])=>[id,{bestFive:h.bestFive.map(cardKey),unusedCards:h.unusedCards.map(cardKey),rank:handRankLabel(h)}]))}
 io.to(s.roomId).emit('tier_d_pile_reveal',s.reveal);emitState(io,s)
}

export async function playTierDGame(io:Server,roomId:string,userId:string, arrangement?:CardKeys) {
 const s=sessions.get(roomId); if(!s||s.userId!==userId)return
 if(!s.arranged) {
   if(!arrangement) { io.to(roomId).emit('tier_d_error',{message:'Arrange all 11 cards before revealing G1.'}); return }
   try { submitTierDArrangement(s.state,userId,keyArrangement(s.state,userId,arrangement)); s.arranged=true; revealCurrentTierDGame(io,s) }
   catch (error) { io.to(roomId).emit('tier_d_error',{message:error instanceof Error?error.message:'Invalid Tier D arrangement'}) }
   return
 }
 if(s.reveal){
  if(s.currentGame<3){s.currentGame=(s.currentGame+1) as 1|2|3;s.reveal=undefined;revealCurrentTierDGame(io,s);return}
  for(const seat of s.state.seats) s.cumulativeScores[seat.id]=(s.cumulativeScores[seat.id]??0)+(s.state.scores[seat.id]??0)
  if(s.matchNumber<3){
   const previousBot=s.state.seats.find(seat=>seat.isBot)?.bot
   const nextState=createTierDLevel(s.state.level,userId)
   const nextBot=nextState.seats.find(seat=>seat.isBot)
   if(nextBot&&previousBot) nextBot.bot={...previousBot}
   // One Level is three complete matches. Keep its clock and any accumulated
   // paused time continuous across Match 1 → 2 → 3.
   s.state=nextState;s.currentGame=1;s.matchNumber=(s.matchNumber+1) as 1|2|3;s.arranged=false;s.reveal=undefined;emitState(io,s);return
  }
  const topScore=Math.max(...Object.values(s.cumulativeScores));const playerWon=s.cumulativeScores[userId]===topScore&&Object.values(s.cumulativeScores).filter(score=>score===topScore).length===1
  const progress=await persistTierDLevelOutcome(userId,playerWon)
  const elapsedMs=Math.max(0,Date.now()-s.matchStartedAt-s.frozenMs-(s.timerPausedAt ? Date.now()-s.timerPausedAt : 0))
  const personalBestMs=await recordTierDPersonalBest(userId,elapsedMs).catch(()=>undefined)
  const reward=playerWon ? await grantTierDLevelRandomItem(userId,s.state.level,s.isVip?2:1).catch(()=>undefined) : undefined
  io.to(roomId).emit('tier_d_complete',{level:s.state.level,playerWon,scores:s.cumulativeScores,progress,reward,elapsedMs,personalBestMs});sessions.delete(roomId);return
 }
 revealCurrentTierDGame(io,s)
}

/** Runtime consumables are available only while a human is arranging a live deal. */
export async function useTierDItem(io: Server, roomId: string, userId: string, item: TierDRewardItem, selectedCardKey?: string) {
  const s=sessions.get(roomId); if(!s||s.userId!==userId||s.arranged||s.reveal) return
  if (!['single_card_swap','full_redraw','bomb_defuser'].includes(item)) return
  const selectedCardIndex=item==='single_card_swap' ? s.state.dealtHands[userId].findIndex(card=>cardKey(card)===selectedCardKey) : -1
  if(item==='single_card_swap'&&selectedCardIndex<0){io.to(roomId).emit('tier_d_error',{message:'Select one card in your hand, then tap SWAP.'});return}
  const scope=item==='full_redraw' ? `level:${s.state.level}` : `match:${s.state.level}:${s.matchNumber}`
  let consumed=false
  try { consumed=await consumeTierDRuntimeItem(userId,item,scope) } catch { io.to(roomId).emit('tier_d_error',{message:'Items are unavailable until migration 054 is applied.'}); return }
  if(!consumed){io.to(roomId).emit('tier_d_error',{message:item==='full_redraw'?'Redraw is available once per level and needs an item.':'You do not have this item.'});return}
  s.inventory[item]=Math.max(0,(s.inventory[item]??0)-1)
  if(item==='single_card_swap') swapTierDHandCard(s.state,userId,selectedCardIndex)
  if(item==='full_redraw') {
    const bot=s.state.seats.find(seat=>seat.isBot)?.bot
    const fresh=createTierDLevel(s.state.level,userId)
    const freshBot=fresh.seats.find(seat=>seat.isBot); if(bot&&freshBot) freshBot.bot={...bot}
    // Redraw changes cards, not the elapsed Level time.
    s.state=fresh;s.currentGame=1;s.arranged=false;s.reveal=undefined
  }
  if(item==='bomb_defuser') s.timerPausedAt=Date.now()
  emitState(io,s)
}

/** A Freezed timer resumes only after the player interacts with the live table. */
export function resumeTierDTimer(io: Server, roomId: string, userId: string) {
  const s=sessions.get(roomId); if(!s||s.userId!==userId||!s.timerPausedAt) return
  s.frozenMs+=Date.now()-s.timerPausedAt
  s.timerPausedAt=undefined
  emitState(io,s)
}
