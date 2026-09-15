import { tierDMissionAwareness } from './tierDMissionAwareness'
import type { Server } from 'socket.io'
import { wonTierDStreakMatch } from './tierDMatchStreak'
import { commitTierDCombo, createTierDLevel, defaultTierDArrangement, openChallengeMatchPassed, resolveTierDGame, strongestTierDArrangement, submitTierDArrangement, submitTierDUndoArrangement, swapTierDHandCard, type TierDArrangement, type TierDGameNumber, type TierDLevelState } from './tierDSolo'
import { handRankLabel } from './handEvaluator'
import { persistTierDLevelOutcome } from './tierDSoloProgress'
import { supabaseAdmin } from '../config/supabase'
import type { Card } from './deck'
import { consumeTierDRuntimeItem, getTierDItemInventory, getTierDRewardBaseline, grantTierDLevelRandomItem, recordTierDLevelClearPersonalBest } from './tierDRewardService'
import type { TierDRewardItem } from './tierDRewards'
import { getArrangeTimerSeconds } from './tierDLeague'
import { handMultiplier } from './leagueGameplay'
import { recordTierDCompetitionLevelWin } from './tierDLeaderboardService'

type CardKeys = { pile1: string[]; pile2: string[]; pile3: string[] }
type RevealHand = { privateCards: string[]; bestFive: string[]; unusedCards: string[]; rank: string }
type ScoreBreakdown = { pileScore:number; multiplier:number; missionScore:number; penalty:number; doubled:boolean }
type RevealPayload = { missionSuccess?: boolean; game: TierDGameNumber; winnerId: string|null; points: number; bonusPoints?: number; hands: Record<string, RevealHand>; breakdown:Record<string,ScoreBreakdown>; fouled:Record<string,boolean> }
type Session = {
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
}
type SessionSnapshot = {
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
  return {version:1,savedAt:Date.now(),roomId:s.roomId,state:s.state,currentGame:s.currentGame,matchNumber:s.matchNumber,cumulativeScores:s.cumulativeScores,openChallengePassed:s.openChallengePassed,arranged:s.arranged,inventory:s.inventory,matchInventory:s.matchInventory,isVip:s.isVip,levelStartedAt:s.levelStartedAt,matchStartedAt:s.matchStartedAt,adGrantUsed:s.adGrantUsed,reservedAdItem:s.reservedAdItem,committedThrough:s.committedThrough,adPausedAt:s.adPausedAt,dealRevision:s.dealRevision,frozenMs:s.frozenMs,timerRemainingMs:remainingMs(s)??undefined,timerPausedAt:s.timerPausedAt,systemPausedAt:s.systemPausedAt,timerStarted:s.timerStarted,reveal:s.reveal,provisionalScoreSnapshot:s.provisionalScoreSnapshot,stagedArrangement:s.stagedArrangement,tripleSweepPending:s.tripleSweepPending,unlockedFrom:s.unlockedFrom,undoUsed:[...s.undoUsed],doubledPiles:[...s.doubledPiles],autoResolving:s.autoResolving}
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
  if (!sessions.has(s.roomId) || s.timerPausedAt || s.systemPausedAt || s.adPausedAt || s.autoResolving) return
  s.autoResolving=true; s.timerRemainingMs=0; s.timerDeadlineAt=Date.now()
  try {
    if (!s.arranged) {
      const arrangement=s.stagedArrangement ?? (s.unlockedFrom ? s.state.arrangements[s.userId]! : defaultTierDArrangement(s.state.dealtHands[s.userId]))
      if (s.unlockedFrom) submitTierDUndoArrangement(s.state,s.userId,arrangement,s.unlockedFrom)
      else submitTierDArrangement(s.state,s.userId,arrangement)
      s.arranged=true;s.unlockedFrom=undefined
    }
    // Timeout must still show each showdown separately. Emitting all three in
    // one synchronous loop lets the final payload replace G1/G2 on the client.
    if (!s.reveal) { revealCurrentTierDGame(io,s,false);await waitForAutoReveal(2800) }
    while (s.currentGame<3) { commitCurrentPile(io,s);s.reveal=undefined;s.currentGame=(s.currentGame+1) as TierDGameNumber;revealCurrentTierDGame(io,s,false);await waitForAutoReveal(2800) }
    await finishMatch(io,s)
  } catch (error) { io.to(s.roomId).emit('tier_d_error',{message:error instanceof Error?error.message:'Timer auto-resolve failed'});s.autoResolving=false;emitState(io,s) }
}

function waitForAutoReveal(ms:number){return new Promise<void>(resolve=>setTimeout(resolve,ms))}

export async function startTierDSolo(io:Server,roomId:string,userId:string) {
  const existing=sessions.get(roomId);if(existing){clearMatchTimer(existing);clearRevealSafety(existing)}
  const {data}=await supabaseAdmin.from('users').select('tier_d_solo_level,vip_status').eq('user_id',userId).maybeSingle()
  const level=Math.max(1,data?.tier_d_solo_level??1);const state=createTierDLevel(level,userId)
  if (level < 51) matchWinStreaks.set(userId, 0)
  else if (!matchWinStreaks.has(userId)) {
    const {data:streakProfile} = await supabaseAdmin.from('users').select('tier_d_match_win_streak').eq('user_id',userId).maybeSingle()
    matchWinStreaks.set(userId, Math.max(0, streakProfile?.tier_d_match_win_streak??0))
  }
  const inventory=await getTierDItemInventory(userId).catch(()=>({shuffle:0,swap:0,double_pile:0,freeze:0,auto_sort:0,undo:0}))
  const startedAt=Date.now()
  const isVip=data?.vip_status==='vip'||data?.vip_status==='vip_pro'
  const s:Session={roomId,userId,state,currentGame:1,matchNumber:1,cumulativeScores:Object.fromEntries(state.seats.map(seat=>[seat.id,0])),openChallengePassed:true,arranged:false,inventory,matchInventory:rollVipMatchItems(inventory,isVip,level),isVip,adGrantUsed:false,levelStartedAt:startedAt,matchStartedAt:startedAt,frozenMs:0,timerStarted:false,undoUsed:new Set(),doubledPiles:new Set(),autoResolving:false}
  sessions.set(roomId,s);emitState(io,s)
}
export async function resumeTierDSolo(io:Server,roomId:string,userId:string):Promise<'RESUMED'|'NOT_FOUND'|'ERROR'> {
  const live=sessions.get(roomId)
  if(live?.userId===userId){emitState(io,live);return 'RESUMED'}
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
    const remaining=storedRemaining===undefined?undefined:Math.max(0,storedRemaining-(snapshot.timerPausedAt||snapshot.systemPausedAt||snapshot.adPausedAt?0:elapsed))
    const s:Session={roomId,userId,state:snapshot.state as TierDLevelState,currentGame:snapshot.currentGame as TierDGameNumber,matchNumber:snapshot.matchNumber as 1|2|3,cumulativeScores:snapshot.cumulativeScores??{},openChallengePassed:snapshot.openChallengePassed??true,arranged:!!snapshot.arranged,inventory:persistedInventory,matchInventory:snapshot.matchInventory??emptyMatchInventory(),isVip:!!snapshot.isVip,levelStartedAt:snapshot.levelStartedAt??Date.now(),matchStartedAt:snapshot.matchStartedAt??Date.now(),adGrantUsed:!!snapshot.adGrantUsed,reservedAdItem:snapshot.reservedAdItem,committedThrough:snapshot.committedThrough,adPausedAt:snapshot.adPausedAt?Date.now():undefined,dealRevision:snapshot.dealRevision,frozenMs:snapshot.frozenMs??0,timerRemainingMs:remaining,timerPausedAt:snapshot.timerPausedAt?Date.now():undefined,systemPausedAt:snapshot.systemPausedAt?Date.now():undefined,timerStarted:!!snapshot.timerStarted,reveal:snapshot.reveal,provisionalScoreSnapshot:snapshot.provisionalScoreSnapshot,stagedArrangement:snapshot.stagedArrangement,tripleSweepPending:!!snapshot.tripleSweepPending,unlockedFrom:snapshot.unlockedFrom,undoUsed:new Set(snapshot.undoUsed??[]),doubledPiles:new Set(snapshot.doubledPiles??[]),autoResolving:!!snapshot.autoResolving}
    if (s.state.level < 51) matchWinStreaks.set(userId, 0)
    sessions.set(roomId,s)
    if(s.timerStarted&&!s.timerPausedAt&&!s.systemPausedAt&&!s.adPausedAt&&!s.autoResolving)startMatchTimer(io,s,remaining)
    if(s.systemPausedAt)armRevealSafety(io,s,s.tripleSweepPending?9000:5000,!!s.tripleSweepPending)
    emitState(io,s)
    return 'RESUMED'
  } catch(error) { console.error('[TIER_D_SOLO] active-match restore failed',error);return 'ERROR' }
}

/** Atomically reserve this Match's one eligible ad item before provider fulfilment. */
export function reserveTierDSoloItemAd(userId:string,item:TierDRewardItem): boolean {
  const session=[...sessions.values()].find(s=>s.userId===userId&&!s.isVip&&!s.adGrantUsed&&!s.reservedAdItem&&(visibleInventory(s)[item]??0)===0)
  if(!session)return false
  session.reservedAdItem=item
  return true
}

export function restoreTierDSoloItemAd(userId:string,item:TierDRewardItem): void {
  const session=[...sessions.values()].find(s=>s.userId===userId&&s.reservedAdItem===item)
  if(session)session.reservedAdItem=undefined
}

/** An ad grant is Match-only and deliberately never writes into persistent rewards. */
export function grantTierDSoloItemAd(userId:string,item:TierDRewardItem): boolean {
  const session=[...sessions.values()].find(s=>s.userId===userId&&!s.isVip&&s.reservedAdItem===item)
  if(!session)return false
  session.reservedAdItem=undefined;session.adGrantUsed=true
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
  if(pauseForAnimation)armRevealSafety(io,s,5000)
  io.to(s.roomId).emit('tier_d_pile_reveal',s.reveal);emitState(io,s)
}

export async function playTierDGame(io:Server,roomId:string,userId:string,arrangement?:CardKeys):Promise<boolean> {
  const s=sessions.get(roomId);if(!s||s.userId!==userId||!s.timerStarted||s.timerPausedAt||s.systemPausedAt||s.adPausedAt||s.autoResolving)return false
  if(!s.arranged){
    try { const resolved=arrangement?keyArrangement(s.state,userId,arrangement):(s.stagedArrangement??defaultTierDArrangement(s.state.dealtHands[userId]));if(s.unlockedFrom)submitTierDUndoArrangement(s.state,userId,resolved,s.unlockedFrom);else submitTierDArrangement(s.state,userId,resolved);s.stagedArrangement=undefined;s.arranged=true;s.unlockedFrom=undefined;revealCurrentTierDGame(io,s);return true }
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
  clearRevealSafety(s)
  commitCurrentPile(io,s)
  const playerMatchScore=s.state.scores[s.userId]??0
  const bestMatchScoreSave=await supabaseAdmin.rpc('record_tier_d_best_match_score',{p_user_id:s.userId,p_score:playerMatchScore})
  if(bestMatchScoreSave.error)console.warn('[TIER_D_SOLO] Best match score persistence requires migration 066:',bestMatchScoreSave.error.code)
  for(const seat of s.state.seats)s.cumulativeScores[seat.id]=(s.cumulativeScores[seat.id]??0)+(s.state.scores[seat.id]??0)
  const matchWon=wonTierDStreakMatch(s.userId,s.state.seats.filter(seat=>seat.isBot).map(seat=>seat.id),s.state.gameResults)
  const matchStreak=s.state.level>=51&&matchWon?(matchWinStreaks.get(s.userId)??0)+1:0
  matchWinStreaks.set(s.userId,matchStreak)
  const streakSave=await supabaseAdmin.from('users').update({tier_d_match_win_streak:matchStreak}).eq('user_id',s.userId)
  if(streakSave.error)console.warn('[TIER_D_SOLO] Match streak persistence requires migration 060:',streakSave.error.code)
  s.openChallengePassed=s.state.level > 1000 ? s.openChallengePassed&&openChallengeMatchPassed(s.state,s.userId) : true
  if(s.matchNumber<3){
    s.reservedAdItem=undefined
    const identities=s.state.seats.filter(seat=>seat.isBot).map(seat=>seat.bot)
    const nextState=createTierDLevel(s.state.level,s.userId,Math.random,{comboBotId:s.state.comboBotId});nextState.seats.filter(seat=>seat.isBot).forEach((seat,index)=>{if(identities[index])seat.bot={...identities[index]!}})
    s.committedThrough=0;s.state=nextState;s.currentGame=1;s.matchNumber=(s.matchNumber+1) as 1|2|3;s.arranged=false;s.stagedArrangement=undefined;s.reveal=undefined;s.provisionalScoreSnapshot=undefined;s.matchStartedAt=Date.now();s.frozenMs=0;s.timerPausedAt=undefined;s.systemPausedAt=undefined;s.timerStarted=false;s.timerDeadlineAt=undefined;s.timerRemainingMs=undefined;s.unlockedFrom=undefined;s.undoUsed.clear();s.adPausedAt=undefined;s.doubledPiles.clear();s.matchInventory=rollVipMatchItems(s.inventory,s.isVip,s.state.level);s.adGrantUsed=false;s.autoResolving=false;emitState(io,s);return
  }
  const aiScores=s.state.seats.filter(seat=>seat.isBot).map(seat=>s.cumulativeScores[seat.id]??0)
  const highestAiScore=Math.max(...aiScores)
  const playerWon=(s.state.level<=1000||s.openChallengePassed)&&(s.cumulativeScores[s.userId]??0)>=highestAiScore
  const rewardBaseline=playerWon?await getTierDRewardBaseline(s.userId).catch(()=>undefined):undefined
  const competition=playerWon?await recordTierDCompetitionLevelWin({userId:s.userId,level:s.state.level,points:s.cumulativeScores[s.userId]??0,isVip:s.isVip}).catch(()=>undefined):undefined
  const progress=await persistTierDLevelOutcome(s.userId,playerWon);const elapsedMs=Math.max(0,Date.now()-s.levelStartedAt)
  const personalBestMs=playerWon?await recordTierDLevelClearPersonalBest(s.userId,s.state.level,elapsedMs).catch(()=>undefined):undefined
  const rewardReasons=playerWon?[...(progress&&rewardBaseline&&progress.bestWinStreak>rewardBaseline.bestWinStreak?['LONGEST_STREAK']:[]),...(rewardBaseline&&(rewardBaseline.bestLevelClearTimeMs===null||elapsedMs<rewardBaseline.bestLevelClearTimeMs)?['FASTEST_CLEAR']:[]),...(s.state.level%10===0?['LEVEL_MILESTONE']:[])]:[]
  const reward=rewardReasons.length?await grantTierDLevelRandomItem(s.userId,s.state.level,s.isVip).catch(error=>{console.warn('[TIER_D_SOLO] level reward reservation failed',error);return undefined}):undefined
  io.to(s.roomId).emit('tier_d_complete',{matchWinStreak:matchStreak,level:s.state.level,playerWon,scores:s.cumulativeScores,highestAiScore,openChallengePassed:s.openChallengePassed,progress,reward,rewardEligible:rewardReasons.length>0,rewardReasons,competition,elapsedMs,personalBestMs});discardSession(s)
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
    const playerScore=s.state.scores[s.userId]??0
    const highestBotScore=Math.max(...s.state.seats.filter(seat=>seat.isBot).map(seat=>s.state.scores[seat.id]??0))
    const canRedoMatch=s.matchNumber<=2&&s.currentGame===3&&s.reveal?.game===3&&playerScore<highestBotScore
    if(!canRedoMatch){io.to(roomId).emit('tier_d_error',{message:'Undo is available only after losing Match 1 or Match 2 during the final Reveal.'});return}
    if(!await consume(io,s,item))return
    // cumulativeScores is updated only in finishMatch.  Replacing state here therefore
    // restores the score at the start of this Match and leaves earlier Matches intact.
    const missions=s.state.missions,openChallenge=s.state.openChallenge,guided=s.state.guidedRevealPiles
    const identities=s.state.seats.filter(seat=>seat.isBot).map(seat=>seat.bot)
    const fresh=createTierDLevel(s.state.level,userId,Math.random,{missions,openChallenge,guidedRevealPiles:guided,comboBotId:s.state.comboBotId})
    fresh.seats.filter(seat=>seat.isBot).forEach((seat,index)=>{if(identities[index])seat.bot={...identities[index]!}})
    clearRevealSafety(s)
    s.dealRevision=(s.dealRevision??0)+1;s.committedThrough=0;s.state=fresh;s.currentGame=1
    s.arranged=false;s.stagedArrangement=undefined;s.reveal=undefined;s.provisionalScoreSnapshot=undefined
    s.unlockedFrom=undefined;s.undoUsed.clear();s.doubledPiles.clear();s.autoResolving=false;s.frozenMs=0
    // A retry is a fresh deal of the same Match, so the player gets the full Match clock again.
    const fullSeconds=getArrangeTimerSeconds(s.state.level)
    s.timerRemainingMs=fullSeconds===null?undefined:fullSeconds*1000;s.timerDeadlineAt=undefined;s.systemPausedAt=Date.now();clearMatchTimer(s)
    emitState(io,s);return
  }
  if(item==='double_pile'){
    const pile=selectedPile
    if(!pile||![1,2,3].includes(pile)||pile<s.currentGame||(s.reveal&&pile===s.currentGame)||s.doubledPiles.has(pile)){io.to(roomId).emit('tier_d_error',{message:'Select an unrevealed pile for ×2.'});return}
    if(!await consume(io,s,item))return
    s.doubledPiles.add(pile);emitState(io,s);return
  }
  if(item==='auto_sort'){
    if(s.arranged||s.reveal||s.currentGame!==1){io.to(roomId).emit('tier_d_error',{message:'Auto Sort is available before Reveal G1.'});return}
    let arrangement:TierDArrangement|undefined
    try { arrangement=strongestTierDArrangement(s.state.dealtHands[userId],s.state.communityPiles) }
    catch { arrangement=undefined }
    if(!arrangement){io.to(roomId).emit('tier_d_error',{message:'Auto Sort could not find a legal arrangement for this deal.'});return}
    // Consume only after the canonical selector succeeded; this leaves the player
    // in arranging mode so the suggested layout can still be changed manually.
    if(!await consume(io,s,item))return
    s.stagedArrangement=arrangement;emitState(io,s);return
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
    // Shuffle is a fresh deal: restore the full Match clock rather than carrying
    // forward time spent evaluating the discarded hand.
    const fullSeconds=getArrangeTimerSeconds(s.state.level)
    s.timerRemainingMs=fullSeconds===null?undefined:fullSeconds*1000;s.timerDeadlineAt=undefined;s.systemPausedAt=Date.now();clearMatchTimer(s);emitState(io,s)
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
