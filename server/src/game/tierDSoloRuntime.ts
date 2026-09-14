import { tierDMissionAwareness } from './tierDMissionAwareness'
import type { Server } from 'socket.io'
import { wonTierDStreakMatch } from './tierDMatchStreak'
import { commitTierDCombo, createTierDLevel, defaultTierDArrangement, openChallengeMatchPassed, resolveTierDGame, rollbackTierDGame, submitTierDArrangement, submitTierDUndoArrangement, swapTierDHandCard, type TierDArrangement, type TierDGameNumber, type TierDLevelState } from './tierDSolo'
import { handRankLabel } from './handEvaluator'
import { persistTierDLevelOutcome } from './tierDSoloProgress'
import { supabaseAdmin } from '../config/supabase'
import type { Card } from './deck'
import { consumeTierDRuntimeItem, getTierDItemInventory, grantTierDLevelRandomItem, recordTierDLevelClearPersonalBest } from './tierDRewardService'
import type { TierDRewardItem } from './tierDRewards'
import { getArrangeTimerSeconds } from './tierDLeague'
import { handMultiplier } from './leagueGameplay'
import { recordTierDCompetitionLevelWin } from './tierDLeaderboardService'

type CardKeys = { pile1: string[]; pile2: string[]; pile3: string[] }
type RevealHand = { privateCards: string[]; bestFive: string[]; unusedCards: string[]; rank: string }
type ScoreBreakdown = { pileScore:number; multiplier:number; missionScore:number; penalty:number; doubled:boolean }
type RevealPayload = { game: TierDGameNumber; winnerId: string|null; points: number; bonusPoints?: number; hands: Record<string, RevealHand>; breakdown:Record<string,ScoreBreakdown>; fouled:Record<string,boolean> }
type Session = {
  roomId: string; userId: string; state: TierDLevelState; currentGame: TierDGameNumber; matchNumber: 1|2|3
  cumulativeScores: Record<string,number>; openChallengePassed: boolean; arranged: boolean
  /** Persistent stock from Level rewards only. */
  inventory: Record<TierDRewardItem,number>
  /** Free/VIP Match grants; always discarded when the next Match starts. */
  matchInventory: Record<TierDRewardItem,number>
  isVip: boolean; levelStartedAt: number; matchStartedAt: number
  /** One Free-only rewarded-ad item, rolled only when this Match begins with no stock. */
  adEligibleItem?: TierDRewardItem
  reservedAdItem?: TierDRewardItem
  committedThrough?: number
  adPausedAt?: number; dealRevision?: number
  frozenMs: number; timerDeadlineAt?: number; timerRemainingMs?: number; timerHandle?: ReturnType<typeof setTimeout>
  timerPausedAt?: number; systemPausedAt?: number; timerStarted: boolean; reveal?: RevealPayload; provisionalScoreSnapshot?: Record<string,number>; stagedArrangement?: TierDArrangement
  /** A local Triple Sweep is celebrated before the already-resolved G3 is revealed. */
  tripleSweepPending?: boolean
  unlockedFrom?: TierDGameNumber; undoUsed: Set<TierDGameNumber>; doubledPiles: Set<TierDGameNumber>; autoResolving: boolean
}
const sessions = new Map<string, Session>()
// Keeps active play working before migration 060; DB persists across server restarts.
const matchWinStreaks = new Map<string, number>()
const cardKey=(c:Card)=>`${c.rank.toLowerCase()}${({spades:'s',hearts:'h',diamonds:'d',clubs:'c'}[c.suit])}`
const TIER_D_ITEMS: TierDRewardItem[]=['shuffle','swap','double_pile','freeze','undo']
const emptyMatchInventory=():Record<TierDRewardItem,number>=>({shuffle:0,swap:0,double_pile:0,freeze:0,undo:0})
const hasPersistentItems=(inventory:Record<TierDRewardItem,number>)=>TIER_D_ITEMS.some(item=>(inventory[item]??0)>0)
const eligibleMatchItems=(level:number)=>TIER_D_ITEMS.filter(item=>level>50||!['freeze','undo'].includes(item))
const rollEmptyInventoryAdItem=(inventory:Record<TierDRewardItem,number>,isVip:boolean,level:number)=>!isVip&&!hasPersistentItems(inventory)?eligibleMatchItems(level)[Math.floor(Math.random()*eligibleMatchItems(level).length)]:undefined
const rollVipMatchItems=(inventory:Record<TierDRewardItem,number>,isVip:boolean,level:number)=>{
  const match=emptyMatchInventory();if(!isVip||hasPersistentItems(inventory))return match
  const pool=eligibleMatchItems(level)
  for(let roll=0;roll<2;roll++)match[pool[Math.floor(Math.random()*pool.length)]]++
  return match
}
const visibleInventory=(s:Session)=>Object.fromEntries(TIER_D_ITEMS.map(item=>[item,(s.inventory[item]??0)+(s.matchInventory[item]??0)])) as Record<TierDRewardItem,number>

function keyArrangement(state: TierDLevelState, userId: string, source: CardKeys): TierDArrangement {
  const cards = new Map(state.dealtHands[userId].map(card => [cardKey(card), card]))
  const used = new Set<string>()
  const resolve = (keys: string[]) => keys.map(key => {
    const card = cards.get(key)
    if (!card || used.has(key)) throw new Error('That card is not available in this deal')
    used.add(key); return card
  })
  return { pile1: resolve(source.pile1), pile2: resolve(source.pile2), pile3: resolve(source.pile3) }
}

function remainingMs(s: Session): number | null {
  if (getArrangeTimerSeconds(s.state.level) === null) return null
  if (s.timerPausedAt || s.systemPausedAt || s.adPausedAt) return Math.max(0, s.timerRemainingMs ?? 0)
  if (!s.timerStarted) return getArrangeTimerSeconds(s.state.level)!*1000
  return Math.max(0, (s.timerDeadlineAt ?? Date.now()) - Date.now())
}

function emitState(io:Server,s:Session) {
  const playerPiles=s.stagedArrangement??s.state.arrangements[s.userId]
  const scores=Object.fromEntries(s.state.seats.map(seat=>[seat.id,(s.cumulativeScores[seat.id]??0)+(s.state.scores[seat.id]??0)]))
  const visibleBotPiles=new Set<TierDGameNumber>([...s.state.guidedRevealPiles,...(s.state.openChallenge?.revealedPiles??[])])
  const botPreviewPiles=Object.fromEntries(s.state.seats.filter(seat=>seat.isBot).map(seat=>{
    const arrangement=s.state.arrangements[seat.id]!
    return [seat.id,Object.fromEntries(([1,2,3] as TierDGameNumber[]).map(game=>{
      const cards=arrangement[`pile${game}` as keyof TierDArrangement]
      return [`pile${game}`,visibleBotPiles.has(game)?cards.map(cardKey):cards.map(()=>'')]
    }))]
  }))
  io.to(s.roomId).emit('tier_d_state',{
    roomId:s.roomId, level:s.state.level, matchNumber:s.matchNumber, totalMatches:3, currentGame:s.currentGame,
    matchWinStreak:matchWinStreaks.get(s.userId)??0,
    seats:s.state.seats.map(x=>({id:x.id,isBot:x.isBot,name:x.bot?.name??'You',emoji:x.bot?.emoji??'🙂'})),
    cards:s.state.dealtHands[s.userId].map(cardKey),
    piles:playerPiles ? Object.fromEntries(Object.entries(playerPiles).map(([pile,cards])=>[pile,cards.map(cardKey)])) : undefined,
    community:{ pile1:s.state.communityPiles.pile1.map(cardKey), pile2:s.state.communityPiles.pile2.map(cardKey), pile3:s.state.communityPiles.pile3.map(cardKey) },
    missionRail:tierDMissionAwareness(s.state,s.userId,s.committedThrough??0,!!s.tripleSweepPending), missions:s.state.missions, openChallenge:s.state.openChallenge, guidedRevealPiles:s.state.guidedRevealPiles, botPreviewPiles, fouled:s.state.fouled,
    scores, phase:s.timerPausedAt?'frozen':s.systemPausedAt?'revealing':s.arranged?(s.reveal?'revealed':'ready'):'arranging',
    completedPiles:s.state.gameResults.filter(result=>!s.reveal||result.game<s.currentGame).map(result=>({game:result.game,winnerId:result.winnerId,points:result.points})), reveal:s.tripleSweepPending?undefined:s.reveal, tripleSweepPending:!!s.tripleSweepPending,
    adPausedAt:s.adPausedAt, dealRevision:s.dealRevision??0, inventory:visibleInventory(s), adEligibleItem:s.adEligibleItem, matchStartedAt:s.matchStartedAt, timerRemainingMs:remainingMs(s), timerDeadlineAt:s.timerDeadlineAt,
    timerPausedAt:s.timerPausedAt, systemPausedAt:s.systemPausedAt, timerStarted:s.timerStarted, unlockedFrom:s.unlockedFrom, undoUsed:[...s.undoUsed], doubledPiles:[...s.doubledPiles], autoResolving:s.autoResolving,
  })
}

function clearMatchTimer(s: Session) { if (s.timerHandle) clearTimeout(s.timerHandle); s.timerHandle=undefined }
function startMatchTimer(io: Server, s: Session, durationMs?: number) {
  clearMatchTimer(s)
  const seconds=getArrangeTimerSeconds(s.state.level)
  s.timerStarted=true
  if (seconds===null) { s.timerDeadlineAt=undefined;s.timerRemainingMs=undefined;return }
  const ms=durationMs??seconds*1000
  s.timerRemainingMs=ms;s.timerDeadlineAt=Date.now()+ms
  s.timerHandle=setTimeout(()=>void expireMatchTimer(io,s),ms)
}

async function expireMatchTimer(io: Server, s: Session) {
  if (!sessions.has(s.roomId) || s.timerPausedAt || s.autoResolving) return
  s.autoResolving=true; s.timerRemainingMs=0; s.timerDeadlineAt=Date.now()
  try {
    if (!s.arranged) {
      const arrangement=s.stagedArrangement ?? (s.unlockedFrom ? s.state.arrangements[s.userId]! : defaultTierDArrangement(s.state.dealtHands[s.userId]))
      if (s.unlockedFrom) submitTierDUndoArrangement(s.state,s.userId,arrangement,s.unlockedFrom)
      else submitTierDArrangement(s.state,s.userId,arrangement)
      s.arranged=true;s.unlockedFrom=undefined
    }
    if (!s.reveal) revealCurrentTierDGame(io,s,false)
    while (s.currentGame<3) { commitCurrentPile(io,s);s.reveal=undefined;s.currentGame=(s.currentGame+1) as TierDGameNumber;revealCurrentTierDGame(io,s,false) }
    await finishMatch(io,s)
  } catch (error) { io.to(s.roomId).emit('tier_d_error',{message:error instanceof Error?error.message:'Timer auto-resolve failed'});s.autoResolving=false;emitState(io,s) }
}

export async function startTierDSolo(io:Server,roomId:string,userId:string) {
  if (!matchWinStreaks.has(userId)) {
    const {data} = await supabaseAdmin.from('users').select('tier_d_match_win_streak').eq('user_id',userId).maybeSingle()
    matchWinStreaks.set(userId, Math.max(0, data?.tier_d_match_win_streak??0))
  }
  const existing=sessions.get(roomId);if(existing)clearMatchTimer(existing)
  const {data}=await supabaseAdmin.from('users').select('tier_d_solo_level,vip_status').eq('user_id',userId).maybeSingle()
  const level=Math.max(1,data?.tier_d_solo_level??1);const state=createTierDLevel(level,userId)
  const inventory=await getTierDItemInventory(userId).catch(()=>({shuffle:0,swap:0,double_pile:0,freeze:0,undo:0}))
  const startedAt=Date.now()
  const isVip=data?.vip_status==='vip'||data?.vip_status==='vip_pro'
  const s:Session={roomId,userId,state,currentGame:1,matchNumber:1,cumulativeScores:Object.fromEntries(state.seats.map(seat=>[seat.id,0])),openChallengePassed:true,arranged:false,inventory,matchInventory:rollVipMatchItems(inventory,isVip,level),isVip,adEligibleItem:rollEmptyInventoryAdItem(inventory,isVip,level),levelStartedAt:startedAt,matchStartedAt:startedAt,frozenMs:0,timerStarted:false,undoUsed:new Set(),doubledPiles:new Set(),autoResolving:false}
  sessions.set(roomId,s);emitState(io,s)
}
export function resumeTierDSolo(io:Server,roomId:string,userId:string) { const s=sessions.get(roomId);if(!s||s.userId!==userId)return false;emitState(io,s);return true }

/** Atomically reserve this Match's one eligible ad item before provider fulfilment. */
export function reserveTierDSoloItemAd(userId:string,item:TierDRewardItem): boolean {
  const session=[...sessions.values()].find(s=>s.userId===userId&&s.adEligibleItem===item)
  if(!session)return false
  session.adEligibleItem=undefined;session.reservedAdItem=item
  return true
}

export function restoreTierDSoloItemAd(userId:string,item:TierDRewardItem): void {
  const session=[...sessions.values()].find(s=>s.userId===userId&&s.reservedAdItem===item)
  if(session){session.adEligibleItem=item;session.reservedAdItem=undefined}
}

/** An ad grant is Match-only and deliberately never writes into persistent rewards. */
export function grantTierDSoloItemAd(userId:string,item:TierDRewardItem): boolean {
  const session=[...sessions.values()].find(s=>s.userId===userId&&!s.isVip&&s.reservedAdItem===item)
  if(!session)return false
  session.reservedAdItem=undefined
  session.matchInventory[item]=(session.matchInventory[item]??0)+1
  return true
}

/** Reload inventory after a rewarded-ad screen returns to this still-live Match. */
export async function refreshTierDSoloInventory(io:Server,roomId:string,userId:string) {
  const s=sessions.get(roomId);if(!s||s.userId!==userId)return
  try { s.inventory=await getTierDItemInventory(userId);emitState(io,s) }
  catch { io.to(roomId).emit('tier_d_error',{message:'Could not refresh item inventory.'}) }
}

function revealCurrentTierDGame(io: Server, s: Session, pauseForAnimation = true): void {
  s.provisionalScoreSnapshot={...s.state.scores}
  const game=s.currentGame;const result=resolveTierDGame(s.state,game,{doubledSeatId:s.userId,doubledPile:s.doubledPiles.has(game)?game:undefined})
  const breakdown=Object.fromEntries(s.state.seats.map(seat=>[seat.id,{pileScore:result.winnerId===seat.id?result.points:0,multiplier:handMultiplier(s.state.level,result.hands[seat.id].rank),missionScore:result.missionScores[seat.id]??0,penalty:result.missionPenalties[seat.id]??0,doubled:seat.id===s.userId&&s.doubledPiles.has(game)}]))
  s.reveal={game,winnerId:result.winnerId,points:result.points,bonusPoints:result.bonusPoints,hands:Object.fromEntries(Object.entries(result.hands).map(([id,h])=>[id,{
    // These are the seat's physical cards. Community cards are moved into the
    // winner row by the client instead of being duplicated in every comparison.
    privateCards:s.state.arrangements[id]![`pile${game}`].map(cardKey),
    bestFive:h.bestFive.map(cardKey),unusedCards:h.unusedCards.map(cardKey),rank:handRankLabel(h),
  }])),breakdown,fouled:{...result.fouled}}
  if (pauseForAnimation) {
    s.timerRemainingMs=remainingMs(s)??undefined
    s.systemPausedAt=Date.now()
    clearMatchTimer(s)
  }
  // G3 has already been evaluated at this point, so a local sweep is known
  // without exposing the cards. Pause here, celebrate, then reveal G3 only
  // after the client acknowledges the existing Triple Sweep VFX.
  if (pauseForAnimation && game===3 && result.winnerId===s.userId && result.bonusPoints) {
    s.timerRemainingMs=remainingMs(s)??undefined
    s.systemPausedAt=Date.now()
    s.tripleSweepPending=true
    clearMatchTimer(s)
    io.to(s.roomId).emit('tier_d_triple_sweep',{level:s.state.level,matchNumber:s.matchNumber})
    emitState(io,s)
    return
  }
  io.to(s.roomId).emit('tier_d_pile_reveal',s.reveal);emitState(io,s)
}

export async function playTierDGame(io:Server,roomId:string,userId:string,arrangement?:CardKeys) {
  const s=sessions.get(roomId);if(!s||s.userId!==userId||!s.timerStarted||s.timerPausedAt||s.systemPausedAt||s.adPausedAt||s.autoResolving)return
  if(!s.arranged){
    try { const resolved=arrangement?keyArrangement(s.state,userId,arrangement):(s.stagedArrangement??defaultTierDArrangement(s.state.dealtHands[userId]));if(s.unlockedFrom)submitTierDUndoArrangement(s.state,userId,resolved,s.unlockedFrom);else submitTierDArrangement(s.state,userId,resolved);s.stagedArrangement=undefined;s.arranged=true;s.unlockedFrom=undefined;revealCurrentTierDGame(io,s) }
    catch(error){io.to(roomId).emit('tier_d_error',{message:error instanceof Error?error.message:'Invalid arrangement'})}
    return
  }
  if(!s.reveal){revealCurrentTierDGame(io,s);return}
  if(s.currentGame<3){commitCurrentPile(io,s);s.reveal=undefined;s.provisionalScoreSnapshot=undefined;s.currentGame=(s.currentGame+1) as TierDGameNumber;revealCurrentTierDGame(io,s);return}
  await finishMatch(io,s)
}

/** Keep the server's timeout snapshot in sync with the cards currently shown to the player. */
export function stageTierDArrangement(io:Server,roomId:string,userId:string,arrangement:CardKeys) {
  const s=sessions.get(roomId);if(!s||s.userId!==userId||s.arranged||s.systemPausedAt||s.adPausedAt||s.autoResolving)return
  try { s.stagedArrangement=keyArrangement(s.state,userId,arrangement) }
  catch(error) { io.to(roomId).emit('tier_d_error',{message:error instanceof Error?error.message:'Invalid arrangement'}) }
}

function commitCurrentPile(io:Server,s:Session){
  if((s.committedThrough??0)>=s.currentGame)return
  s.committedThrough=s.currentGame
  const result=s.state.gameResults.find(result=>result.game===s.currentGame)!
  const alreadyAwarded=!!s.state.comboBonuses
  const bonuses=commitTierDCombo(s.state,Math.random,s.currentGame)
  io.to(s.roomId).emit('tier_d_pile_commit',{
    key:`${s.matchStartedAt}:${s.currentGame}`,game:s.currentGame,
    missionRail:tierDMissionAwareness(s.state,s.userId,s.currentGame),
    values:Object.fromEntries(s.state.seats.map(seat=>[seat.id,[
      result.winnerId===seat.id?result.points:0,result.missionScores[seat.id]??0,
      result.missionPenalties[seat.id]??0,result.winnerId===seat.id?(result.bonusPoints??0):0,
    ].filter(Boolean)])),
  })
  if(!alreadyAwarded&&Object.values(bonuses).some(Boolean))io.to(s.roomId).emit('tier_d_combo',{
    bonuses,kind:s.state.missions.length===3?'SUPER_COMBO':'COMBO',piles:s.state.missions.map(mission=>mission.pile),
  })
}

async function finishMatch(io:Server,s:Session){
  if(s.autoResolving===false)s.autoResolving=true
  clearMatchTimer(s)
  commitCurrentPile(io,s)
  for(const seat of s.state.seats)s.cumulativeScores[seat.id]=(s.cumulativeScores[seat.id]??0)+(s.state.scores[seat.id]??0)
  const matchWon=wonTierDStreakMatch(s.userId,s.state.seats.filter(seat=>seat.isBot).map(seat=>seat.id),s.state.gameResults)
  const matchStreak=matchWon?(matchWinStreaks.get(s.userId)??0)+1:0
  matchWinStreaks.set(s.userId,matchStreak)
  const streakSave=await supabaseAdmin.from('users').update({tier_d_match_win_streak:matchStreak}).eq('user_id',s.userId)
  if(streakSave.error)console.warn('[TIER_D_SOLO] Match streak persistence requires migration 060:',streakSave.error.code)
  s.openChallengePassed=s.state.level > 1000 ? s.openChallengePassed&&openChallengeMatchPassed(s.state,s.userId) : true
  if(s.matchNumber<3){
    s.reservedAdItem=undefined
    const identities=s.state.seats.filter(seat=>seat.isBot).map(seat=>seat.bot)
    const nextState=createTierDLevel(s.state.level,s.userId,Math.random,{comboBotId:s.state.comboBotId});nextState.seats.filter(seat=>seat.isBot).forEach((seat,index)=>{if(identities[index])seat.bot={...identities[index]!}})
    s.committedThrough=0;s.state=nextState;s.currentGame=1;s.matchNumber=(s.matchNumber+1) as 1|2|3;s.arranged=false;s.stagedArrangement=undefined;s.reveal=undefined;s.provisionalScoreSnapshot=undefined;s.matchStartedAt=Date.now();s.frozenMs=0;s.timerPausedAt=undefined;s.systemPausedAt=undefined;s.timerStarted=false;s.timerDeadlineAt=undefined;s.timerRemainingMs=undefined;s.unlockedFrom=undefined;s.undoUsed.clear();s.adPausedAt=undefined;s.doubledPiles.clear();s.matchInventory=rollVipMatchItems(s.inventory,s.isVip,s.state.level);s.adEligibleItem=rollEmptyInventoryAdItem(s.inventory,s.isVip,s.state.level);s.autoResolving=false;emitState(io,s);return
  }
  const aiScores=s.state.seats.filter(seat=>seat.isBot).map(seat=>s.cumulativeScores[seat.id]??0)
  const highestAiScore=Math.max(...aiScores)
  const playerWon=(s.state.level<=1000||s.openChallengePassed)&&(s.cumulativeScores[s.userId]??0)>=highestAiScore
  const competition=playerWon?await recordTierDCompetitionLevelWin({userId:s.userId,level:s.state.level,points:s.cumulativeScores[s.userId]??0,isVip:s.isVip}).catch(()=>undefined):undefined
  const progress=await persistTierDLevelOutcome(s.userId,playerWon);const elapsedMs=Math.max(0,Date.now()-s.levelStartedAt)
  const personalBestMs=playerWon?await recordTierDLevelClearPersonalBest(s.userId,elapsedMs).catch(()=>undefined):undefined
  const reward=playerWon?await grantTierDLevelRandomItem(s.userId,s.state.level,s.isVip?2:1).catch(()=>undefined):undefined
  io.to(s.roomId).emit('tier_d_complete',{matchWinStreak:matchStreak,level:s.state.level,playerWon,scores:s.cumulativeScores,highestAiScore,openChallengePassed:s.openChallengePassed,progress,reward,competition,elapsedMs,personalBestMs});sessions.delete(s.roomId)
}

export async function useTierDItem(io:Server,roomId:string,userId:string,item:TierDRewardItem,selectedCardKey?:string,selectedPile?:TierDGameNumber){
  const s=sessions.get(roomId);if(!s||s.userId!==userId||!s.timerStarted||s.systemPausedAt||s.adPausedAt||s.autoResolving)return
  if(item==='freeze'){
    if(getArrangeTimerSeconds(s.state.level)===null){io.to(roomId).emit('tier_d_error',{message:'Freeze is unavailable while the Timer is unlimited.'});return}
    if(s.timerPausedAt)return
    if(!await consume(io,s,item))return
    s.timerRemainingMs=remainingMs(s)??undefined;s.timerPausedAt=Date.now();clearMatchTimer(s);emitState(io,s);return
  }
  if(s.timerPausedAt)return
  if(item==='undo'){
    if(s.state.level<=50){io.to(roomId).emit('tier_d_error',{message:'Undo unlocks after Bronze Guided Reveal.'});return}
    if(!s.reveal||s.undoUsed.has(s.currentGame)||!s.provisionalScoreSnapshot){io.to(roomId).emit('tier_d_error',{message:'Undo is available once after the current pile reveal.'});return}
    if(!await consume(io,s,item))return
    rollbackTierDGame(s.state,s.currentGame,s.provisionalScoreSnapshot);s.undoUsed.add(s.currentGame);s.unlockedFrom=s.currentGame;s.stagedArrangement=undefined;s.arranged=false;s.reveal=undefined;s.provisionalScoreSnapshot=undefined;emitState(io,s);return
  }
  if(item==='double_pile'){
    const pile=selectedPile
    if(!pile||![1,2,3].includes(pile)||pile<s.currentGame||(s.reveal&&pile===s.currentGame)||s.doubledPiles.has(pile)){io.to(roomId).emit('tier_d_error',{message:'Select an unrevealed pile for ×2.'});return}
    if(!await consume(io,s,item))return
    s.doubledPiles.add(pile);emitState(io,s);return
  }
  if(s.arranged||s.reveal){io.to(roomId).emit('tier_d_error',{message:'Shuffle and Swap are available only before Reveal G1.'});return}
  if(item==='swap'){
    const index=s.state.dealtHands[userId].findIndex(card=>cardKey(card)===selectedCardKey)
    if(index<0){io.to(roomId).emit('tier_d_error',{message:'Select one card, then tap SWAP.'});return}
    if(!await consume(io,s,item))return
    const layout=s.stagedArrangement??defaultTierDArrangement(s.state.dealtHands[userId])
    swapTierDHandCard(s.state,userId,index)
    const replacement=s.state.dealtHands[userId][index]
    s.stagedArrangement=Object.fromEntries(Object.entries(layout).map(([pile,cards])=>[pile,cards.map(card=>cardKey(card)===selectedCardKey?replacement:card)])) as TierDArrangement
    emitState(io,s);return
  }
  if(item==='shuffle'){
    if(!await consume(io,s,item))return
    const missions=s.state.missions,openChallenge=s.state.openChallenge,guided=s.state.guidedRevealPiles,identities=s.state.seats.filter(seat=>seat.isBot).map(seat=>seat.bot)
    const fresh=createTierDLevel(s.state.level,userId,Math.random,{missions,openChallenge,guidedRevealPiles:guided,comboBotId:s.state.comboBotId});fresh.seats.filter(seat=>seat.isBot).forEach((seat,index)=>{if(identities[index])seat.bot={...identities[index]!}})
    s.dealRevision=(s.dealRevision??0)+1;s.committedThrough=0;s.state=fresh;s.currentGame=1;s.arranged=false;s.stagedArrangement=undefined;s.reveal=undefined;s.provisionalScoreSnapshot=undefined
    s.timerRemainingMs=remainingMs(s)??undefined;s.systemPausedAt=Date.now();clearMatchTimer(s);emitState(io,s)
  }
}

async function consume(io:Server,s:Session,item:TierDRewardItem){
  if((s.matchInventory[item]??0)>0){s.matchInventory[item]--;return true}
  const scope=`level:${s.state.level}:match:${s.matchNumber}:${item}:${Date.now()}:${s.inventory[item]}`
  let consumed=false;try{consumed=await consumeTierDRuntimeItem(s.userId,item,scope)}catch{io.to(s.roomId).emit('tier_d_error',{message:'Items are unavailable until migration 057 is applied.'});return false}
  if(!consumed){io.to(s.roomId).emit('tier_d_error',{message:'You do not have this item.'});return false}
  s.inventory[item]=Math.max(0,(s.inventory[item]??0)-1);return true
}

export function pauseTierDItemAd(io:Server,roomId:string,userId:string,item:TierDRewardItem){
  const s=sessions.get(roomId)
  if(!s||s.userId!==userId||s.isVip||s.adEligibleItem!==item||!s.timerStarted||s.timerPausedAt||s.systemPausedAt||s.autoResolving)return false
  if(!s.adPausedAt){s.timerRemainingMs=remainingMs(s)??undefined;s.adPausedAt=Date.now();clearMatchTimer(s)}
  emitState(io,s);return true
}
export function resumeTierDItemAd(io:Server,roomId:string,userId:string){
  const s=sessions.get(roomId);if(!s||s.userId!==userId||!s.adPausedAt)return
  s.adPausedAt=undefined;startMatchTimer(io,s,s.timerRemainingMs);emitState(io,s)
}

export function resumeTierDTimer(io:Server,roomId:string,userId:string){
  const s=sessions.get(roomId);if(!s||s.userId!==userId||!s.timerPausedAt)return
  s.frozenMs+=Date.now()-s.timerPausedAt;s.timerPausedAt=undefined;startMatchTimer(io,s,s.timerRemainingMs);emitState(io,s)
}

/** Starts the Match clock only when the blocking deal animation returns control. */
export function startTierDTimerAfterDeal(io:Server,roomId:string,userId:string){
  const s=sessions.get(roomId);if(!s||s.userId!==userId||s.timerPausedAt||s.adPausedAt||s.autoResolving)return
  if(s.systemPausedAt){s.systemPausedAt=undefined;startMatchTimer(io,s,s.timerRemainingMs);emitState(io,s);return}
  if(s.timerStarted)return
  startMatchTimer(io,s);emitState(io,s)
}

/** Resume only after the client confirms that the blocking AI reveal animation ended. */
export function finishTierDRevealAnimation(io:Server,roomId:string,userId:string){
  const s=sessions.get(roomId);if(!s||s.userId!==userId||!s.systemPausedAt||s.autoResolving)return
  s.systemPausedAt=undefined
  startMatchTimer(io,s,s.timerRemainingMs)
  emitState(io,s)
}

/** The VFX deliberately precedes G3, then the standard reveal timing resumes. */
export function finishTierDTripleSweepVfx(io:Server,roomId:string,userId:string){
  const s=sessions.get(roomId);if(!s||s.userId!==userId||!s.tripleSweepPending||!s.reveal)return
  s.tripleSweepPending=false
  io.to(s.roomId).emit('tier_d_pile_reveal',s.reveal)
  emitState(io,s)
}
