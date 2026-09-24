import { tierDMissionAwareness } from './tierDMissionAwareness'
import { randomUUID } from 'crypto'
import { automaticTierDArrangement, assertTierDCardConservation } from './tierDSolo'
import { domainItem, itemPolicyError, newMatchItemState, resolveGameRules, type ItemRequestScope, type MatchItemState } from './unifiedTierRules'
import { commitTierDItem, getTierDFreezeDurations } from './tierDItemPersistence'
import type { Server } from 'socket.io'
import { wonTierDStreakMatch } from './tierDMatchStreak'
import { commitTierDCombo, createTierDLevel, defaultTierDArrangement, openChallengeMatchPassed, resetTierDForNextDuel, resolveTierDGame, submitTierDArrangement, submitTierDUndoArrangement, swapTierDHandCard, type TierDArrangement, type TierDGameNumber, type TierDLevelState } from './tierDSolo'
import { exchangeTierDDuelCard, tierDMatchesPerLevel, tierDNextDuelG1Stake } from './tierDRiseDuel'
import { handRankLabel } from './handEvaluator'
import { persistTierDLevelOutcome } from './tierDSoloProgress'
import { supabaseAdmin } from '../config/supabase'
import type { Card } from './deck'
import { getTierDItemInventory, getTierDRewardBaseline, grantTierDLevelRandomItem, recordTierDLevelClearPersonalBest } from './tierDRewardService'
import type { TierDRewardItem } from './tierDRewards'
import { getArrangeTimerSeconds } from './tierDLeague'
import { handMultiplier } from './leagueGameplay'
import { recordTierDCompetitionLevelWin } from './tierDLeaderboardService'
import { addMiniTournamentPoints } from './tierDMiniTournamentService'
import { grantTierCGraduationReward } from './tierDLevel250'
import { analyzeTierDCompletedMatch } from './tierDAnalysis'
import { escrowBuyIn, settleEscrow } from './gameLoop'
import { calculateTierDDuelPayout, tierDDuelWon } from './tierDRiseDuel'

type CardKeys = { pile1: string[]; pile2: string[]; pile3: string[] }
type RevealHand = { privateCards: string[]; bestFive: string[]; unusedCards: string[]; rank: string }
type ScoreBreakdown = { pileScore:number; multiplier:number; missionScore:number; penalty:number; doubled:boolean }
type RevealPayload = { missionSuccess?: boolean; game: TierDGameNumber; winnerId: string|null; points: number; bonusPoints?: number; hands: Record<string, RevealHand>; breakdown:Record<string,ScoreBreakdown>; fouled:Record<string,boolean> }
type Session = {
  gameId: string; items: MatchItemState; itemRevision: number
  freezeDurations: number[]; matchFreezeDurations: number[]; lastFreezeDuration?: number
  itemBusy?: boolean; recoveryRequired?: boolean; freezeHandle?: ReturnType<typeof setTimeout>
  roomId: string; userId: string; state: TierDLevelState; currentGame: TierDGameNumber; matchNumber: 1|2|3
  cumulativeScores: Record<string,number>; openChallengePassed: boolean; arranged: boolean
  /** Persistent stock from Level rewards only. */
  inventory: Record<TierDRewardItem,number>
  /** Free/VIP Match grants; always discarded when the next Match starts. */
  matchInventory: Record<TierDRewardItem,number>
  isVip: boolean; levelStartedAt: number; matchStartedAt: number
  /** A Free player may add one zero-stock item by rewarded ad in each Match. */
  adGrantUsed: boolean
  reservedAdItem?: TierDRewardItem
  committedThrough?: number
  adPausedAt?: number; dealRevision?: number
  frozenMs: number; timerDeadlineAt?: number; timerRemainingMs?: number; timerHandle?: ReturnType<typeof setTimeout>; revealSafetyHandle?: ReturnType<typeof setTimeout>
  timerPausedAt?: number; systemPausedAt?: number; timerStarted: boolean; reveal?: RevealPayload; provisionalScoreSnapshot?: Record<string,number>; stagedArrangement?: TierDArrangement
  /** A local Triple Sweep is celebrated after the already-resolved G3 win voice. */
  tripleSweepPending?: boolean
  unlockedFrom?: TierDGameNumber; undoUsed: Set<TierDGameNumber>; doubledPiles: Set<TierDGameNumber>; autoResolving: boolean
  snapshotWrite?: Promise<void>
  escrowId?: string
}
type SessionSnapshot = {
  gameId?: string; escrowId?: string; items?: MatchItemState; itemRevision?: number
  freezeDurations?: number[]; matchFreezeDurations?: number[]; lastFreezeDuration?: number
  version: 1; savedAt: number; roomId: string; state: TierDLevelState; currentGame: TierDGameNumber; matchNumber: 1|2|3
  cumulativeScores: Record<string,number>; openChallengePassed: boolean; arranged: boolean; inventory: Record<TierDRewardItem,number>; matchInventory: Record<TierDRewardItem,number>
  isVip: boolean; levelStartedAt: number; matchStartedAt: number; adGrantUsed: boolean; reservedAdItem?: TierDRewardItem; committedThrough?: number
  adPausedAt?: number; dealRevision?: number; frozenMs: number; timerRemainingMs?: number; timerPausedAt?: number; systemPausedAt?: number; timerStarted: boolean
  reveal?: RevealPayload; provisionalScoreSnapshot?: Record<string,number>; stagedArrangement?: TierDArrangement; tripleSweepPending?: boolean; unlockedFrom?: TierDGameNumber
  undoUsed: TierDGameNumber[]; doubledPiles: TierDGameNumber[]; autoResolving: boolean
}
const sessions = new Map<string, Session>()
// Keeps active play working before migration 060; DB persists across server restarts.
const matchWinStreaks = new Map<string, number>()
const cardKey=(c:Card)=>`${c.rank.toLowerCase()}${({spades:'s',hearts:'h',diamonds:'d',clubs:'c'}[c.suit])}`
const TIER_D_ITEMS: TierDRewardItem[]=['shuffle','swap','double_pile','freeze','auto_sort','undo']
const emptyMatchInventory=():Record<TierDRewardItem,number>=>({shuffle:0,swap:0,double_pile:0,freeze:0,auto_sort:0,undo:0})
const hasPersistentItems=(inventory:Record<TierDRewardItem,number>)=>TIER_D_ITEMS.some(item=>(inventory[item]??0)>0)
const eligibleMatchItems=(level:number)=>TIER_D_ITEMS.filter(item=>level>50||!['freeze','undo'].includes(item))
const rollVipMatchItems=(inventory:Record<TierDRewardItem,number>,isVip:boolean,level:number)=>{
  const match=emptyMatchInventory();if(!isVip||hasPersistentItems(inventory))return match
  const pool=eligibleMatchItems(level)
  for(let roll=0;roll<2;roll++)match[pool[Math.floor(Math.random()*pool.length)]]++
  return match
}
const visibleInventory=(s:Session)=>Object.fromEntries(TIER_D_ITEMS.map(item=>[item,(s.inventory[item]??0)+(s.matchInventory[item]??0)])) as Record<TierDRewardItem,number>

function snapshotOf(s:Session):SessionSnapshot {
  return JSON.parse(JSON.stringify({version:1,savedAt:Date.now(),gameId:s.gameId,escrowId:s.escrowId,items:s.items,itemRevision:s.itemRevision,freezeDurations:s.freezeDurations,matchFreezeDurations:s.matchFreezeDurations,lastFreezeDuration:s.lastFreezeDuration,roomId:s.roomId,state:s.state,currentGame:s.currentGame,matchNumber:s.matchNumber,cumulativeScores:s.cumulativeScores,openChallengePassed:s.openChallengePassed,arranged:s.arranged,inventory:s.inventory,matchInventory:s.matchInventory,isVip:s.isVip,levelStartedAt:s.levelStartedAt,matchStartedAt:s.matchStartedAt,adGrantUsed:s.adGrantUsed,reservedAdItem:s.reservedAdItem,committedThrough:s.committedThrough,adPausedAt:s.adPausedAt,dealRevision:s.dealRevision,frozenMs:s.frozenMs,timerRemainingMs:remainingMs(s)??undefined,timerPausedAt:s.timerPausedAt,systemPausedAt:s.systemPausedAt,timerStarted:s.timerStarted,reveal:s.reveal,provisionalScoreSnapshot:s.provisionalScoreSnapshot,stagedArrangement:s.stagedArrangement,tripleSweepPending:s.tripleSweepPending,unlockedFrom:s.unlockedFrom,undoUsed:[...s.undoUsed],doubledPiles:[...s.doubledPiles],autoResolving:s.autoResolving}))
}
function persistSession(s:Session) {
  const snapshot=snapshotOf(s)
  s.snapshotWrite=(s.snapshotWrite??Promise.resolve()).then(async()=>{
    const {error}=await supabaseAdmin.from('tier_d_active_match_snapshots').upsert({user_id:s.userId,room_id:s.roomId,snapshot},{onConflict:'user_id'})
    if(error)console.warn('[TIER_D_SOLO] active-match snapshot save failed',error.code)
  }).catch(error=>console.warn('[TIER_D_SOLO] active-match snapshot save failed',error))
}
function discardSession(s:Session) {
  sessions.delete(s.roomId)
  void (s.snapshotWrite??Promise.resolve()).then(async()=>{
    const {error}=await supabaseAdmin.from('tier_d_active_match_snapshots').delete().eq('user_id',s.userId)
    if(error)console.warn('[TIER_D_SOLO] active-match snapshot removal failed',error.code)
  })
}

function keyArrangement(state: TierDLevelState, userId: string, source: CardKeys): TierDArrangement {
  if (!source || !Array.isArray(source.pile1) || !Array.isArray(source.pile2) || !Array.isArray(source.pile3) ||
      source.pile1.length !== 3 || source.pile2.length !== 3 || source.pile3.length !== 5) throw new Error('Piles must contain 3, 3 and 5 cards')
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
  if (s.itemBusy || s.recoveryRequired) return
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
  const duel=s.state.duel
  const currentDuelOpponent=duel?.order[duel.current]
  io.to(s.roomId).emit('tier_d_state',{
    roomId:s.roomId, gameId:s.gameId, itemUsageByMatch:s.items.usage, preG1LockedAt:s.items.preG1LockedAt, xX:s.items.xX,
    freezeExpiresAt:s.items.freezeExpiresAt, freezeDuration:s.matchFreezeDurations[0]??s.freezeDurations[0], foulPendingRecovery:!!s.items.foulPendingRecovery,
    itemEligibility:Object.fromEntries(TIER_D_ITEMS.map(item=>[item,itemEligibility(s,item)])),
    level:s.state.level, matchNumber:s.state.duel?1:s.matchNumber, totalMatches:tierDMatchesPerLevel(s.state.level), currentGame:s.currentGame,
    matchWinStreak:matchWinStreaks.get(s.userId)??0,
    seats:s.state.seats.filter(x=>!duel||!x.isBot||x.id===currentDuelOpponent?.id).map(x=>({id:x.id,isBot:x.isBot,name:x.bot?.name??'You',emoji:x.bot?.emoji??'🙂'})),
    duel:duel?{...duel,queue:duel.order.slice(duel.current+1),currentOpponent:currentDuelOpponent,revealedOpponentCards:duel.phase==='SWAP'?s.state.dealtHands[currentDuelOpponent!.id].map(cardKey):undefined}:undefined,
    cards:s.state.dealtHands[s.userId].map(cardKey),
    piles:playerPiles ? Object.fromEntries(Object.entries(playerPiles).map(([pile,cards])=>[pile,cards.map(cardKey)])) : undefined,
    community:{ pile1:s.state.communityPiles.pile1.map(cardKey), pile2:s.state.communityPiles.pile2.map(cardKey), pile3:s.state.communityPiles.pile3.map(cardKey) },
    missionRail:tierDMissionAwareness(s.state,s.userId,s.committedThrough??0,!!s.tripleSweepPending), missions:s.state.missions, riseSuperCombo:s.state.riseSuperCombo, openChallenge:s.state.openChallenge, guidedRevealPiles:s.state.guidedRevealPiles, botPreviewPiles, fouled:s.state.fouled,
    scores, phase:s.timerPausedAt?'frozen':s.systemPausedAt?'revealing':s.items.foulPendingRecovery?'foul_pending_recovery':s.arranged?(s.reveal?'revealed':'ready'):'arranging',
    completedPiles:s.state.gameResults.filter(result=>!s.reveal||result.game<s.currentGame).map(result=>({game:result.game,winnerId:result.winnerId,points:result.points})), reveal:s.reveal, tripleSweepPending:!!s.tripleSweepPending,
    adPausedAt:s.adPausedAt, dealRevision:s.dealRevision??0, inventory:visibleInventory(s), adGrantAvailable:!s.isVip&&!s.adGrantUsed&&!s.reservedAdItem, matchStartedAt:s.matchStartedAt, timerRemainingMs:remainingMs(s), timerDeadlineAt:s.timerDeadlineAt,
    timerPausedAt:s.timerPausedAt, systemPausedAt:s.systemPausedAt, timerStarted:s.timerStarted, unlockedFrom:s.unlockedFrom, undoUsed:[...s.undoUsed], doubledPiles:[...s.doubledPiles], autoResolving:s.autoResolving,
  })
  persistSession(s)
}

function clearMatchTimer(s: Session) { if (s.timerHandle) clearTimeout(s.timerHandle); s.timerHandle=undefined }
function clearRevealSafety(s: Session) { if (s.revealSafetyHandle) clearTimeout(s.revealSafetyHandle);s.revealSafetyHandle=undefined }
function armRevealSafety(io:Server,s:Session,durationMs:number,tripleSweep=false) {
  clearRevealSafety(s)
  s.revealSafetyHandle=setTimeout(()=>{
    if(tripleSweep)finishTierDTripleSweepVfx(io,s.roomId,s.userId)
    else finishTierDRevealAnimation(io,s.roomId,s.userId)
  },durationMs)
}
function startMatchTimer(io: Server, s: Session, durationMs?: number) {
  clearMatchTimer(s)
  const seconds=getArrangeTimerSeconds(s.state.level)
  s.timerStarted=true
  if (seconds===null) { s.timerDeadlineAt=undefined;s.timerRemainingMs=undefined;return }
  const ms=durationMs??seconds*1000
  s.timerRemainingMs=ms;s.timerDeadlineAt=Date.now()+ms
  // A cleared timer may already be queued by the event loop. Only the currently
  // registered handle may expire this Match; an old deadline cannot auto-reveal
  // after the player has pressed Reveal or used an item that pauses the clock.
  let handle: ReturnType<typeof setTimeout>
  handle=setTimeout(()=>{if(s.timerHandle===handle)void expireMatchTimer(io,s)},ms)
  s.timerHandle=handle
}

async function expireMatchTimer(io: Server, s: Session) {
  if (s.itemBusy || s.recoveryRequired) return
  if (!sessions.has(s.roomId) || s.timerPausedAt || s.systemPausedAt || s.adPausedAt || s.autoResolving) return
  s.autoResolving=true; s.timerRemainingMs=0; s.timerDeadlineAt=Date.now()
  try {
    if (!s.arranged) {
      const arrangement=s.stagedArrangement ?? (s.unlockedFrom ? s.state.arrangements[s.userId]! : defaultTierDArrangement(s.state.dealtHands[s.userId]))
      if (s.unlockedFrom) submitTierDUndoArrangement(s.state,s.userId,arrangement,s.unlockedFrom)
      else submitTierDArrangement(s.state,s.userId,arrangement)
      s.arranged=true;s.unlockedFrom=undefined
    }
    // One timer owns one pile only.  The normal reveal acknowledgement commits
    // this pile and starts a fresh timer for the next one; it must never cascade
    // through G2/G3 merely because G1 timed out.
    // `revealCurrentTierDGame` synchronously clears the timer and establishes
    // the animation pause, so releasing this transient lock before emitting is
    // safe and lets the normal reveal-complete acknowledgement resume G2/G3.
    s.autoResolving=false
    if (!s.reveal) { s.items.foulPendingRecovery=false;revealCurrentTierDGame(io,s,true) }
  } catch (error) { io.to(s.roomId).emit('tier_d_error',{message:error instanceof Error?error.message:'Timer auto-resolve failed'});s.autoResolving=false;emitState(io,s) }
}

export async function startTierDSolo(io:Server,roomId:string,userId:string) {
  const existing=sessions.get(roomId);if(existing?.itemBusy||existing?.recoveryRequired)return
  if(existing){clearMatchTimer(existing);clearRevealSafety(existing);clearTimeout(existing.freezeHandle);await existing.snapshotWrite}
  const {data}=await supabaseAdmin.from('users').select('tier_d_solo_level,vip_status').eq('user_id',userId).maybeSingle()
  const level=Math.max(1,data?.tier_d_solo_level??1);const state=createTierDLevel(level,userId)
  const escrow=state.duel?await escrowBuyIn(userId,roomId,'initiate',state.duel.buyIn):undefined
  if(escrow&&!escrow.ok){io.to(roomId).emit('tier_d_error',{message:escrow.reason==='INSUFFICIENT_TOKENS'?'Insufficient Token for Rise Duel Buy-in.':'Unable to lock Rise Duel Buy-in.'});return}
  if (level < 51) matchWinStreaks.set(userId, 0)
  else if (!matchWinStreaks.has(userId)) {
    const {data:streakProfile} = await supabaseAdmin.from('users').select('tier_d_match_win_streak').eq('user_id',userId).maybeSingle()
    matchWinStreaks.set(userId, Math.max(0, streakProfile?.tier_d_match_win_streak??0))
  }
  const inventory=await getTierDItemInventory(userId).catch(()=>({shuffle:0,swap:0,double_pile:0,freeze:0,auto_sort:0,undo:0}))
  const startedAt=Date.now()
  const isVip=data?.vip_status==='vip'||data?.vip_status==='vip_pro'
  const s:Session={gameId:randomUUID(),escrowId:escrow&&escrow.ok?escrow.escrowId:undefined,items:newMatchItemState(),itemRevision:0,freezeDurations:await getTierDFreezeDurations(userId).catch(()=>[]),matchFreezeDurations:[],roomId,userId,state,currentGame:1,matchNumber:1,cumulativeScores:Object.fromEntries(state.seats.map(seat=>[seat.id,0])),openChallengePassed:true,arranged:false,inventory,matchInventory:rollVipMatchItems(inventory,isVip,level),isVip,adGrantUsed:false,levelStartedAt:startedAt,matchStartedAt:startedAt,frozenMs:0,timerStarted:false,undoUsed:new Set(),doubledPiles:new Set(),autoResolving:false}
  s.matchFreezeDurations=Array.from({length:s.matchInventory.freeze},rollFreezeDuration)
    if(s.state.duel)s.matchNumber=1
    sessions.set(roomId,s);emitState(io,s)
}
export async function resumeTierDSolo(io:Server,roomId:string,userId:string):Promise<'RESUMED'|'NOT_FOUND'|'ERROR'> {
  const live=sessions.get(roomId)
  if(live?.itemBusy)return 'ERROR'
  if(live?.userId===userId&&!live.recoveryRequired){emitState(io,live);return 'RESUMED'}
  try {
    const {data,error}=await supabaseAdmin.from('tier_d_active_match_snapshots').select('snapshot').eq('user_id',userId).maybeSingle()
    if(error)throw error
    const snapshot=data?.snapshot as Partial<SessionSnapshot>|undefined
    if(!snapshot||snapshot.version!==1||!snapshot.state||snapshot.roomId!==roomId||!snapshot.currentGame||!snapshot.matchNumber)return 'NOT_FOUND'
    if(!matchWinStreaks.has(userId)){
      const {data:profile}=await supabaseAdmin.from('users').select('tier_d_match_win_streak').eq('user_id',userId).maybeSingle()
      matchWinStreaks.set(userId,Math.max(0,profile?.tier_d_match_win_streak??0))
    }
    const persistedInventory=await getTierDItemInventory(userId).catch(()=>snapshot.inventory??emptyMatchInventory())
    const elapsed=Math.max(0,Date.now()-(snapshot.savedAt??Date.now()))
    const storedRemaining=snapshot.timerRemainingMs
    // Freeze pauses the Match clock; armFreeze applies only wall-clock time
    // after the persisted item expiration on reconnect.
    const freezeActive = snapshot.items?.freezeExpiresAt !== undefined || snapshot.timerPausedAt !== undefined
    const remaining=storedRemaining===undefined?undefined:Math.max(0,storedRemaining-(freezeActive||snapshot.systemPausedAt||snapshot.adPausedAt?0:elapsed))
    const s:Session={gameId:snapshot.gameId??randomUUID(),escrowId:snapshot.escrowId,items:snapshot.items??legacyItemState(snapshot),itemRevision:snapshot.itemRevision??0,freezeDurations:await getTierDFreezeDurations(userId).catch(()=>[]),matchFreezeDurations:snapshot.matchFreezeDurations??Array.from({length:snapshot.matchInventory?.freeze??0},rollFreezeDuration),lastFreezeDuration:snapshot.lastFreezeDuration,roomId,userId,state:snapshot.state as TierDLevelState,currentGame:snapshot.currentGame as TierDGameNumber,matchNumber:snapshot.matchNumber as 1|2|3,cumulativeScores:snapshot.cumulativeScores??{},openChallengePassed:snapshot.openChallengePassed??true,arranged:!!snapshot.arranged,inventory:persistedInventory,matchInventory:snapshot.matchInventory??emptyMatchInventory(),isVip:!!snapshot.isVip,levelStartedAt:snapshot.levelStartedAt??Date.now(),matchStartedAt:snapshot.matchStartedAt??Date.now(),adGrantUsed:!!snapshot.adGrantUsed,reservedAdItem:snapshot.reservedAdItem,committedThrough:snapshot.committedThrough,adPausedAt:snapshot.adPausedAt?Date.now():undefined,dealRevision:snapshot.dealRevision,frozenMs:snapshot.frozenMs??0,timerRemainingMs:remaining,timerPausedAt:snapshot.timerPausedAt,systemPausedAt:snapshot.systemPausedAt?Date.now():undefined,timerStarted:!!snapshot.timerStarted,reveal:snapshot.reveal,provisionalScoreSnapshot:snapshot.provisionalScoreSnapshot,stagedArrangement:snapshot.stagedArrangement,tripleSweepPending:!!snapshot.tripleSweepPending,unlockedFrom:snapshot.unlockedFrom,undoUsed:new Set(snapshot.undoUsed??[]),doubledPiles:new Set(snapshot.doubledPiles??[]),autoResolving:false}
    assertTierDCardConservation(s.state)
    if(s.state.duel)s.matchNumber=1
    if(live){clearMatchTimer(live);clearRevealSafety(live);clearTimeout(live.freezeHandle)}
    if (s.state.level < 51) matchWinStreaks.set(userId, 0)
    sessions.set(roomId,s)
    if(s.timerPausedAt){if(!s.items.freezeExpiresAt)s.items.freezeExpiresAt=Date.now();armFreeze(io,s)}
    if(s.timerStarted&&!s.timerPausedAt&&!s.systemPausedAt&&!s.adPausedAt&&!s.autoResolving)startMatchTimer(io,s,s.timerRemainingMs)
    if(s.systemPausedAt)armRevealSafety(io,s,s.tripleSweepPending?9000:9000,!!s.tripleSweepPending)
    emitState(io,s)
    return 'RESUMED'
  } catch(error) { console.error('[TIER_D_SOLO] active-match restore failed',error);return 'ERROR' }
}

/** Atomically reserve this Match's one eligible ad item before provider fulfilment. */
export function reserveTierDSoloItemAd(userId:string,item:TierDRewardItem): boolean {
  const session=[...sessions.values()].find(s=>s.userId===userId&&!s.isVip&&!s.adGrantUsed&&!s.reservedAdItem&&(visibleInventory(s)[item]??0)===0)
  if(!session||session.itemBusy||session.recoveryRequired||!TIER_D_ITEMS.includes(item))return false
  session.reservedAdItem=item
  return true
}

export function restoreTierDSoloItemAd(userId:string,item:TierDRewardItem): void {
  const session=[...sessions.values()].find(s=>s.userId===userId&&s.reservedAdItem===item)
  if(session)session.reservedAdItem=undefined
}

/** A rewarded-item ad is one claim per Match; the persistent inventory write is
 * performed by the reward route after provider verification. */
export function grantTierDSoloItemAd(userId:string,item:TierDRewardItem): boolean {
  const session=[...sessions.values()].find(s=>s.userId===userId&&!s.isVip&&s.reservedAdItem===item)
  if(!session||session.itemBusy||session.recoveryRequired)return false
  session.reservedAdItem=undefined;session.adGrantUsed=true
  persistSession(session)
  return true
}

/** Reload inventory after a rewarded-ad screen returns to this still-live Match. */
export async function refreshTierDSoloInventory(io:Server,roomId:string,userId:string) {
  const s=sessions.get(roomId);if(!s||s.userId!==userId)return
  if(s.itemBusy||s.recoveryRequired)return
  const revision=s.itemRevision
  try { const inventory=await getTierDItemInventory(userId);const durations=await getTierDFreezeDurations(userId);if(s.itemBusy||s.itemRevision!==revision)return;s.inventory=inventory;s.freezeDurations=durations;emitState(io,s) }
  catch { io.to(roomId).emit('tier_d_error',{message:'Could not refresh item inventory.'}) }
}

function revealCurrentTierDGame(io: Server, s: Session, pauseForAnimation = true): void {
  s.items.preG1LockedAt ??= Date.now()
  s.items.foulPendingRecovery=false
  // Freeze the authoritative Match clock before resolving cards.  This keeps the
  // deadline from advancing during any server work or socket delivery after Reveal.
  if (pauseForAnimation) {
    s.timerRemainingMs=remainingMs(s)??undefined
    s.systemPausedAt=Date.now()
    s.timerDeadlineAt=undefined
    clearMatchTimer(s)
  }
  s.provisionalScoreSnapshot={...s.state.scores}
  const game=s.currentGame;const result=resolveTierDGame(s.state,game,{doubledSeatId:s.userId,doubledPile:s.doubledPiles.has(game)?game:undefined})
  const breakdown=Object.fromEntries(s.state.seats.map(seat=>[seat.id,{pileScore:result.winnerId===seat.id?result.points:0,multiplier:handMultiplier(s.state.level,result.hands[seat.id].rank),missionScore:result.missionScores[seat.id]??0,penalty:result.missionPenalties[seat.id]??0,doubled:seat.id===s.userId&&s.doubledPiles.has(game)}]))
  s.reveal={missionSuccess:tierDMissionAwareness(s.state,s.userId,s.committedThrough??0).missions.some(m=>m.pile===game&&m.status==='success'),game,winnerId:result.winnerId,points:result.points,bonusPoints:result.bonusPoints,hands:Object.fromEntries(Object.entries(result.hands).map(([id,h])=>[id,{
    // These are the seat's physical cards. Community cards are moved into the
    // winner row by the client instead of being duplicated in every comparison.
    privateCards:s.state.arrangements[id]![`pile${game}`].map(cardKey),
    bestFive:h.bestFive.map(cardKey),unusedCards:h.unusedCards.map(cardKey),rank:handRankLabel(h),
  }])),breakdown,fouled:{...result.fouled}}
  // Reveal G3 first so its Player-win voice can finish before the table-local
  // Triple Sweep arc. Keep the system pause until that two-second arc completes.
  if (pauseForAnimation && game===3 && result.winnerId===s.userId && result.bonusPoints) {
    s.tripleSweepPending=true
    armRevealSafety(io,s,9000,true)
    io.to(s.roomId).emit('tier_d_pile_reveal',s.reveal)
    emitState(io,s)
    return
  }
  // The Winner Hand Showcase holds the resolved hand before the existing
  // all-player reveal, so the safety fallback must not cut it short.
  if(pauseForAnimation)armRevealSafety(io,s,9000)
  io.to(s.roomId).emit('tier_d_pile_reveal',s.reveal);emitState(io,s)
}

export async function playTierDGame(io:Server,roomId:string,userId:string,arrangement?:CardKeys):Promise<boolean> {
  const s=sessions.get(roomId);if(!s||s.userId!==userId||!s.timerStarted||s.timerPausedAt||s.systemPausedAt||s.adPausedAt||s.autoResolving)return false
  if(s.itemBusy||s.recoveryRequired)return false
  if(!s.arranged){
    try { const resolved=arrangement?keyArrangement(s.state,userId,arrangement):(s.stagedArrangement??defaultTierDArrangement(s.state.dealtHands[userId]));if(s.unlockedFrom)submitTierDUndoArrangement(s.state,userId,resolved,s.unlockedFrom);else submitTierDArrangement(s.state,userId,resolved);s.stagedArrangement=undefined;s.arranged=true;s.unlockedFrom=undefined;
      // Reveal is the player's final confirmation.  A foul is a canonical game
      // result, not a correction gate: resolve and show it immediately.
      revealCurrentTierDGame(io,s);return true }
    catch(error){io.to(roomId).emit('tier_d_error',{message:error instanceof Error?error.message:'Invalid arrangement'});return false}
  }
  if(!s.reveal){revealCurrentTierDGame(io,s);return true}
  if(s.currentGame<3){commitCurrentPile(io,s);s.reveal=undefined;s.provisionalScoreSnapshot=undefined;s.currentGame=(s.currentGame+1) as TierDGameNumber;revealCurrentTierDGame(io,s);return true}
  await finishMatch(io,s)
  return true
}

/** Keep the server's timeout snapshot in sync with the cards currently shown to the player. */
export function stageTierDArrangement(io:Server,roomId:string,userId:string,arrangement:CardKeys) {
  const s=sessions.get(roomId);if(!s||s.userId!==userId||s.arranged||s.systemPausedAt||s.adPausedAt||s.autoResolving)return
  if(s.itemBusy||s.recoveryRequired)return
  try { s.stagedArrangement=keyArrangement(s.state,userId,arrangement);persistSession(s) }
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
  clearRevealSafety(s)
  commitCurrentPile(io,s)
  // This is emitted once, after G3 is committed, and is never persisted with
  // the resumable match snapshot.  Free members receive score-only data.
  const visibleBeforeReveal=new Set<TierDGameNumber>([...s.state.guidedRevealPiles,...(s.state.openChallenge?.revealedPiles??[])])
  const knownOpponents=Object.fromEntries(s.state.seats.filter(seat=>seat.isBot).flatMap(seat=>{
    const layout=s.state.arrangements[seat.id]
    if(!layout||![1,2,3].every(game=>visibleBeforeReveal.has(game as TierDGameNumber)))return []
    return [[seat.id,layout]]
  }))
  const analysis=analyzeTierDCompletedMatch(s.state,s.userId,s.state.duel?(s.state.duel.current+1) as 1|2|3:s.matchNumber,knownOpponents)
  const analysisPayload={matchNumber:analysis.matchNumber,actualScore:analysis.actualScore,bestScore:analysis.bestScore,actualWins:analysis.actualWins,bestWins:analysis.bestWins,actualMissionCount:analysis.actualMissionCount,bestMissionCount:analysis.bestMissionCount,actualCombo:analysis.actualCombo,bestCombo:analysis.bestCombo,pile:analysis.pile,...(s.isVip?{community:Object.fromEntries(Object.entries(analysis.community).map(([key,cards])=>[key,cards.map(cardKey)])),actual:Object.fromEntries(Object.entries(analysis.actual).map(([key,cards])=>[key,cards.map(cardKey)])),best:Object.fromEntries(Object.entries(analysis.best).map(([key,cards])=>[key,cards.map(cardKey)]))}: {})}
  io.to(s.roomId).emit('tier_d_analysis_snapshot',analysisPayload)
  if(!s.state.duel){
    const bestMatchScoreSave=await supabaseAdmin.rpc('record_tier_d_best_match_score',{p_user_id:s.userId,p_score:s.state.scores[s.userId]??0})
    if(bestMatchScoreSave.error)console.warn('[TIER_D_SOLO] Best match score persistence requires migration 066:',bestMatchScoreSave.error.code)
  }
  for(const seat of s.state.seats)s.cumulativeScores[seat.id]=(s.cumulativeScores[seat.id]??0)+(s.state.scores[seat.id]??0)
  if(s.state.duel){
    const duel=s.state.duel;const opponent=duel.order[duel.current]
    const playerScore=s.state.scores[s.userId]??0;const opponentScore=s.state.scores[opponent.id]??0
    const won=tierDDuelWon(playerScore,opponentScore)
    duel.results.push({opponentId:opponent.id,playerScore,opponentScore,won})
    if(!won)duel.phase='FAILED'
    else if(duel.current<2){duel.phase='SWAP';duel.swapScoreCost=tierDNextDuelG1Stake(s.state.level);s.autoResolving=false;s.reveal=undefined;emitState(io,s);return}
    else duel.phase='COMPLETE'
  }
  const matchWon=wonTierDStreakMatch(s.userId,s.state.seats.filter(seat=>seat.isBot).map(seat=>seat.id),s.state.gameResults)
  const matchStreak=s.state.level>=51&&matchWon?(matchWinStreaks.get(s.userId)??0)+1:0
  matchWinStreaks.set(s.userId,matchStreak)
  const streakSave=await supabaseAdmin.from('users').update({tier_d_match_win_streak:matchStreak}).eq('user_id',s.userId)
  if(streakSave.error)console.warn('[TIER_D_SOLO] Match streak persistence requires migration 060:',streakSave.error.code)
  s.openChallengePassed=s.state.level > 1000 ? s.openChallengePassed&&openChallengeMatchPassed(s.state,s.userId) : true
  if(!s.state.duel&&s.matchNumber<3){
    s.items=newMatchItemState();s.matchFreezeDurations=[];clearTimeout(s.freezeHandle)
    s.reservedAdItem=undefined
    const identities=s.state.seats.filter(seat=>seat.isBot).map(seat=>seat.bot)
    const nextState=createTierDLevel(s.state.level,s.userId,Math.random,{comboBotId:s.state.comboBotId});nextState.seats.filter(seat=>seat.isBot).forEach((seat,index)=>{if(identities[index])seat.bot={...identities[index]!}})
    s.committedThrough=0;s.state=nextState;s.currentGame=1;s.matchNumber=(s.matchNumber+1) as 1|2|3;s.arranged=false;s.stagedArrangement=undefined;s.reveal=undefined;s.provisionalScoreSnapshot=undefined;s.matchStartedAt=Date.now();s.frozenMs=0;s.timerPausedAt=undefined;s.systemPausedAt=undefined;s.timerStarted=false;s.timerDeadlineAt=undefined;s.timerRemainingMs=undefined;s.unlockedFrom=undefined;s.undoUsed.clear();s.adPausedAt=undefined;s.doubledPiles.clear();s.matchInventory=rollVipMatchItems(s.inventory,s.isVip,s.state.level);s.matchFreezeDurations=Array.from({length:s.matchInventory.freeze},rollFreezeDuration);s.adGrantUsed=false;s.autoResolving=false;emitState(io,s);return
  }
  const aiScores=s.state.seats.filter(seat=>seat.isBot).map(seat=>s.cumulativeScores[seat.id]??0)
  const highestAiScore=Math.max(...aiScores)
  const playerWon=s.state.duel?s.state.duel.phase==='COMPLETE':(s.state.level<=1000||s.openChallengePassed)&&(s.cumulativeScores[s.userId]??0)>=highestAiScore
  if(s.state.duel){
    const bestMatchScoreSave=await supabaseAdmin.rpc('record_tier_d_best_match_score',{p_user_id:s.userId,p_score:s.cumulativeScores[s.userId]??0})
    if(bestMatchScoreSave.error)console.warn('[TIER_D_SOLO] Best match score persistence requires migration 066:',bestMatchScoreSave.error.code)
  }
  let duelPayout
  if(s.state.duel&&s.escrowId){
    duelPayout=playerWon?calculateTierDDuelPayout(s.cumulativeScores,s.state.duel.totalPot):{payouts:Object.fromEntries(s.state.seats.map(seat=>[seat.id,0])),burned:s.state.duel.buyIn,pot:s.state.duel.totalPot}
    const finalStack=duelPayout.payouts[s.userId]??0
    await settleEscrow(s.userId,s.escrowId,finalStack,{tier:'tier_d_duel',burnAmount:duelPayout.burned,npcNets:s.state.duel.order.map(opponent=>({npcId:opponent.aiConfigId,amount:(duelPayout!.payouts[opponent.id]??0)-s.state.duel!.buyIn}))})
  }
  const rewardBaseline=playerWon?await getTierDRewardBaseline(s.userId).catch(()=>undefined):undefined
  const competition=playerWon?await recordTierDCompetitionLevelWin({userId:s.userId,level:s.state.level,points:s.cumulativeScores[s.userId]??0,isVip:s.isVip}).catch(()=>undefined):undefined
  if(playerWon)await addMiniTournamentPoints(s.userId,s.cumulativeScores[s.userId]??0).catch(error=>console.warn('[TIER_D_SOLO] mini tournament score update failed',error))
  const progress=await persistTierDLevelOutcome(s.userId,playerWon);const elapsedMs=Math.max(0,Date.now()-s.levelStartedAt)
  // The progress RPC advances a cleared Lv.250 to Lv.251.  Grant the Tier C
  // graduation package only after that durable progression write succeeds.
  const tierCGraduation=playerWon&&s.state.level===250&&progress?.level===251
    ? await grantTierCGraduationReward(s.userId).catch(error=>{console.warn('[TIER_D_SOLO] Tier C graduation reward failed',error);return undefined})
    : undefined
  const personalBestMs=playerWon?await recordTierDLevelClearPersonalBest(s.userId,s.state.level,elapsedMs).catch(()=>undefined):undefined
  const reward=playerWon?await grantTierDLevelRandomItem(s.userId,s.state.level,s.isVip).catch(error=>{console.warn('[TIER_D_SOLO] level reward reservation failed',error);return undefined}):undefined
  io.to(s.roomId).emit('tier_d_complete',{matchWinStreak:matchStreak,level:s.state.level,playerWon,scores:s.cumulativeScores,highestAiScore,openChallengePassed:s.openChallengePassed,duel:s.state.duel,duelPayout,progress,reward,rewardEligible:!!reward,rewardReasons:reward?[s.state.level%10===0?'LEVEL_MILESTONE':'RANDOM_LEVEL_REWARD']:[],competition,elapsedMs,personalBestMs,tierCGraduation});discardSession(s)
}

/** Accepts either Skip or one ownership-changing 1-for-1 purchase after a won Duel. */
export function continueTierDDuel(io:Server,roomId:string,userId:string,swap?:{playerCard:string;opponentCard:string}):boolean{
  const s=sessions.get(roomId);const duel=s?.state.duel
  if(!s||s.userId!==userId||!duel||duel.phase!=='SWAP'||duel.current>=2)return false
  try{
    if(swap){
      const opponentId=duel.order[duel.current].id
      const playerIndex=s.state.dealtHands[userId].findIndex(card=>cardKey(card)===swap.playerCard)
      const opponentIndex=s.state.dealtHands[opponentId].findIndex(card=>cardKey(card)===swap.opponentCard)
      exchangeTierDDuelCard(s.state,userId,opponentId,playerIndex,opponentIndex)
      duel.scoreSpent+=duel.swapScoreCost;s.cumulativeScores[userId]=(s.cumulativeScores[userId]??0)-duel.swapScoreCost
    }
    resetTierDForNextDuel(s.state)
    s.items=newMatchItemState();s.matchNumber=1;s.currentGame=1;s.arranged=false;s.stagedArrangement=s.state.arrangements[userId];s.reveal=undefined;s.provisionalScoreSnapshot=undefined;s.committedThrough=0;s.timerStarted=false;s.timerDeadlineAt=undefined;s.timerRemainingMs=undefined;s.systemPausedAt=undefined;s.autoResolving=false;s.undoUsed.clear();s.doubledPiles.clear()
    startMatchTimer(io,s)
    emitState(io,s);return true
  }catch(error){io.to(roomId).emit('tier_d_error',{message:error instanceof Error?error.message:'Duel transition failed'});return false}
}

const rulesFor=(s:Session)=>resolveGameRules({tier:'D',gameMode:'SOLO',playerCount:s.state.seats.length})
const rollFreezeDuration=()=>15+Math.floor(Math.random()*31)
function legacyItemState(snapshot:Partial<SessionSnapshot>):MatchItemState {
  // Old snapshots did not record usage. Fail closed for limited items until the next Match.
  return {usage:{swap:1,shuffle:1,freeze:1,undo:1,xX:1},receipts:{},
    preG1LockedAt:snapshot.reveal||snapshot.state?.gameResults.length ? snapshot.savedAt??Date.now() : undefined,
    xX:snapshot.doubledPiles?.length ? {effect:'SCORE_MULTIPLIER',pile:snapshot.doubledPiles[0],multiplier:2}:undefined}
}
function itemEligibility(s:Session,item:TierDRewardItem):{allowed:boolean;reason?:string} {
  const domain=domainItem(item)
  const reason=!domain?'Unknown item.':itemPolicyError(rulesFor(s),s.items,domain)
    ?? (!s.timerStarted||s.timerPausedAt||s.systemPausedAt||s.adPausedAt||s.autoResolving||s.itemBusy||s.recoveryRequired?'Item is unavailable during this phase.':undefined)
    ?? (remainingMs(s)===0?'Match timer expired.':undefined)
    ?? (item==='freeze'&&getArrangeTimerSeconds(s.state.level)===null?'Freeze requires a running timer.':undefined)
    ?? (item==='swap'&&!s.state.drawPile.length?'No cards remain in the deck.':undefined)
  return {allowed:!reason,reason}
}

export async function useTierDItem(io:Server,roomId:string,userId:string,item:TierDRewardItem,selectedCardKey?:string,selectedPile?:TierDGameNumber,request?:ItemRequestScope):Promise<boolean>{
  const s=sessions.get(roomId)
  const fail=(message:string)=>{io.to(roomId).emit('tier_d_error',{message});return false}
  if(!s||s.userId!==userId)return false
  if(!request||request.gameId!==s.gameId||request.matchNumber!==s.matchNumber||typeof request.requestId!=='string'||!request.requestId.length||request.requestId.length>128)return fail('Stale or unscoped item request. Please reconnect.')
  if(!TIER_D_ITEMS.includes(item))return fail('Unknown item.')
  const fingerprint=JSON.stringify([item,selectedCardKey,selectedPile,request.dealRevision])
  if(Object.prototype.hasOwnProperty.call(s.items.receipts,request.requestId))return s.items.receipts[request.requestId]===fingerprint
  if(request.dealRevision!==(s.dealRevision??0))return fail('This request belongs to an earlier deal.')
  const eligibility=itemEligibility(s,item)
  if(!eligibility.allowed)return fail(eligibility.reason!)
  if((visibleInventory(s)[item]??0)<1)return fail('You do not have this item.')
  if(item==='swap'&&!s.state.dealtHands[userId].some(card=>cardKey(card)===selectedCardKey))return fail('Select one card, then tap SWAP.')
  if(item==='double_pile'&&![1,2,3].includes(selectedPile!))return fail('Select a pile for ×2.')
  // Build/validate the entire effect off the live state before touching inventory.
  const candidate:Session={...s,state:structuredClone(s.state),items:structuredClone(s.items),inventory:{...s.inventory},matchInventory:{...s.matchInventory},freezeDurations:[...s.freezeDurations],matchFreezeDurations:[...s.matchFreezeDurations],stagedArrangement:s.stagedArrangement?structuredClone(s.stagedArrangement):undefined,doubledPiles:new Set(s.doubledPiles),undoUsed:new Set(s.undoUsed)}
  const persistent=(s.matchInventory[item]??0)===0
  try {
    if(item==='auto_sort')candidate.stagedArrangement=automaticTierDArrangement(candidate.state.dealtHands[userId],candidate.state.communityPiles)
    if(item==='swap'){
      const index=candidate.state.dealtHands[userId].findIndex(card=>cardKey(card)===selectedCardKey)
      const layout=candidate.stagedArrangement??defaultTierDArrangement(candidate.state.dealtHands[userId])
      swapTierDHandCard(candidate.state,userId,index)
      const replacement=candidate.state.dealtHands[userId][index]
      candidate.stagedArrangement=Object.fromEntries(Object.entries(layout).map(([pile,cards])=>[pile,cards.map(card=>cardKey(card)===selectedCardKey?replacement:card)])) as TierDArrangement
    }
    if(item==='shuffle'){
      const old=candidate.state
      candidate.state=createTierDLevel(old.level,userId,Math.random,{missions:old.missions,riseSuperCombo:old.riseSuperCombo,openChallenge:old.openChallenge,guidedRevealPiles:old.guidedRevealPiles,comboBotId:old.comboBotId})
      candidate.state.seats.forEach((seat,index)=>{seat.bot=old.seats[index].bot})
      candidate.dealRevision=(s.dealRevision??0)+1;candidate.stagedArrangement=undefined
      candidate.timerRemainingMs=(getArrangeTimerSeconds(old.level)??0)*1000;candidate.systemPausedAt=Date.now();candidate.timerDeadlineAt=undefined
    }
    if(item==='undo'){
      candidate.stagedArrangement=candidate.state.arrangements[userId]
      candidate.state.arrangements[userId]=undefined;candidate.state.fouled[userId]=false
      candidate.arranged=false;candidate.items.foulPendingRecovery=false;candidate.undoUsed.add(1)
    }
    if(item==='double_pile'){
      candidate.items.xX={effect:'SCORE_MULTIPLIER',pile:selectedPile!,multiplier:2}
      candidate.doubledPiles=new Set([selectedPile!])
    }
    if(item==='freeze'){
      const duration=(persistent?candidate.freezeDurations:candidate.matchFreezeDurations).shift()
      if(!Number.isInteger(duration)||duration!<15||duration!>45)throw new Error('Freeze duration is unavailable. Apply migration 071 and refresh inventory.')
      candidate.lastFreezeDuration=duration;candidate.items.freezeExpiresAt=Date.now()+duration!*1000
      candidate.timerRemainingMs=remainingMs(s)??undefined;candidate.timerPausedAt=Date.now();candidate.timerDeadlineAt=undefined
    }
    assertTierDCardConservation(candidate.state)
  }catch(error){return fail(error instanceof Error?error.message:'Invalid item action.')}
  const domain=domainItem(item)!
  candidate.items.usage[domain]=(candidate.items.usage[domain]??0)+1
  // Object keys supplied by a client (including __proto__) must remain plain receipts.
  Object.defineProperty(candidate.items.receipts,request.requestId,{value:fingerprint,enumerable:true,configurable:true,writable:true});candidate.itemRevision++
  if(persistent)candidate.inventory[item]--;else candidate.matchInventory[item]--
  s.itemBusy=true
  try {
    await s.snapshotWrite
    await commitTierDItem({userId,roomId,item,requestId:request.requestId,persistent,expectedRevision:s.itemRevision,snapshot:snapshotOf(candidate)})
    clearMatchTimer(s);clearTimeout(s.freezeHandle)
    Object.assign(s,candidate,{itemBusy:false})
    if(s.timerPausedAt)armFreeze(io,s)
    else if(!s.systemPausedAt)startMatchTimer(io,s,item==='shuffle'?s.timerRemainingMs:remainingMs(s)??undefined)
    emitState(io,s);return true
  }catch{
    // Unknown transaction outcome: never overwrite its durable snapshot with stale memory.
    s.itemBusy=false;s.recoveryRequired=true;clearMatchTimer(s);clearTimeout(s.freezeHandle)
    return fail('Item save could not be confirmed. Reconnect to restore the saved Match (migration 071 is required).')
  }
}

function armFreeze(io:Server,s:Session){
  clearTimeout(s.freezeHandle)
  const expires=s.items.freezeExpiresAt??Date.now()
  if(expires<=Date.now()){
    s.timerRemainingMs=Math.max(0,(s.timerRemainingMs??0)-(Date.now()-expires))
    s.timerPausedAt=undefined;s.items.freezeExpiresAt=undefined
    startMatchTimer(io,s,s.timerRemainingMs);return
  }
  s.freezeHandle=setTimeout(()=>resumeTierDTimer(io,s.roomId,s.userId),expires-Date.now())
}

export function pauseTierDItemAd(io:Server,roomId:string,userId:string,item:TierDRewardItem){
  const s=sessions.get(roomId)
  if(s?.itemBusy||s?.recoveryRequired)return false
  if(!s||s.userId!==userId||s.isVip||s.adGrantUsed||s.reservedAdItem||!s.timerStarted||s.timerPausedAt||s.systemPausedAt||s.autoResolving||(visibleInventory(s)[item]??0)!==0)return false
  if(!s.adPausedAt){s.timerRemainingMs=remainingMs(s)??undefined;s.adPausedAt=Date.now();clearMatchTimer(s)}
  emitState(io,s);return true
}
export function resumeTierDItemAd(io:Server,roomId:string,userId:string){
  const s=sessions.get(roomId);if(!s||s.userId!==userId||!s.adPausedAt)return
  s.adPausedAt=undefined;startMatchTimer(io,s,s.timerRemainingMs);emitState(io,s)
}

export function resumeTierDTimer(io:Server,roomId:string,userId:string){
  const s=sessions.get(roomId);if(!s||s.userId!==userId||!s.timerPausedAt)return
  if(s.itemBusy||s.recoveryRequired||Date.now()<(s.items.freezeExpiresAt??0))return
  clearTimeout(s.freezeHandle);s.items.freezeExpiresAt=undefined
  s.frozenMs+=Date.now()-s.timerPausedAt;s.timerPausedAt=undefined;startMatchTimer(io,s,s.timerRemainingMs);emitState(io,s)
}

/** Starts the Match clock only when the blocking deal animation returns control. */
export function startTierDTimerAfterDeal(io:Server,roomId:string,userId:string){
  const s=sessions.get(roomId);if(!s||s.userId!==userId||s.timerPausedAt||s.adPausedAt||s.autoResolving)return
  if(s.itemBusy||s.recoveryRequired)return
  if(s.systemPausedAt){s.systemPausedAt=undefined;startMatchTimer(io,s,s.timerRemainingMs);emitState(io,s);return}
  if(s.timerStarted)return
  startMatchTimer(io,s);emitState(io,s)
}

/** Resume only after the client confirms that the blocking AI reveal animation ended. */
export function finishTierDRevealAnimation(io:Server,roomId:string,userId:string){
  const s=sessions.get(roomId);if(!s||s.userId!==userId||!s.systemPausedAt||s.autoResolving)return
  if(s.tripleSweepPending)return
  clearRevealSafety(s)
  s.systemPausedAt=undefined
  startMatchTimer(io,s,s.timerRemainingMs)
  emitState(io,s)
}

/** Resume only after the post-G3, table-local Triple Sweep arc has faded out. */
export function finishTierDTripleSweepVfx(io:Server,roomId:string,userId:string){
  const s=sessions.get(roomId);if(!s||s.userId!==userId||!s.tripleSweepPending||!s.reveal)return
  clearRevealSafety(s)
  s.tripleSweepPending=false
  s.systemPausedAt=undefined
  startMatchTimer(io,s,s.timerRemainingMs)
  emitState(io,s)
}
