import { comboKind, missionResult, type Mission, type MissionRank } from './leagueGameplay'

export type TierCPlusTier = 'initiate'|'adept'|'mastermind'|'highNoble'|'lastBoss'
export type CanonicalTier = 'C'|'B'|'A'|'A+'|'S'
export type PileNumber = 1|2|3
export type MissionDifficulty = 1|2|3|4
export type ComboType = 'NONE'|'COMBO'|'SUPER_COMBO'

/** The only economy/scoring constants used by Tier C and above. */
export const TIER_C_PLUS_RULES = Object.freeze({
  matchCount: 3,
  buyIn: Object.freeze({ C:600, B:1_800, A:4_500, 'A+':15_000, S:30_000 }),
  pileRatios: Object.freeze([2,3,5] as const),
  winScore: Object.freeze({ 1:10, 2:15, 3:25 }),
  missionScore: Object.freeze({
    1:Object.freeze({ 1:2, 2:4, 3:6, 4:8 }),
    2:Object.freeze({ 1:3, 2:6, 3:9, 4:12 }),
    3:Object.freeze({ 1:5, 2:10, 3:15, 4:20 }),
  }),
  comboScore: Object.freeze({ NONE:0, COMBO:5, SUPER_COMBO:12 }),
  tripleSweepScore: 12,
  rakeNumerator: 5,
  rakeDenominator: 100,
} as const)

export const LEGACY_TIER_TO_CANONICAL:Readonly<Record<TierCPlusTier,CanonicalTier>>=Object.freeze({
  initiate:'C',adept:'B',mastermind:'A',highNoble:'A+',lastBoss:'S',
})

export type PileScoreInput={pile:PileNumber;won:boolean;missionDifficulty?:MissionDifficulty;missionCompleted?:boolean;comboType?:ComboType;tripleSweep?:boolean;penalties?:number}
export type PileScoreBreakdown={pile:PileNumber;winScore:number;missionScore:number;comboType:ComboType;comboScore:number;tripleSweep:boolean;tripleSweepScore:number;penalties:number;calculatedScore:number;finalPileScore:number}
export type TierCPlusScore={pile:number;mission:number;penalty:number;combo:number;sweep:number;streakBonus:number;total:number;completed:number;comboKind?:'COMBO'|'SUPER_COMBO';piles:[PileScoreBreakdown,PileScoreBreakdown,PileScoreBreakdown]}
export type PotAllocation={rewards:Record<string,number>;totalScore:number;shares:Record<string,number>}
export type GameReturn={grossReturn:number;buyIn:number;profit:number;rake:number;finalReturn:number}
export type TierCPlusPileTelemetry={tier:CanonicalTier;buyIn:number;matchIndex:1|2|3;pile:'G1'|'G2'|'G3';pilePot:number;player:string;winScore:number;missionTier:MissionDifficulty|null;missionType:string|null;missionScore:number;comboType:ComboType;comboScore:number;tripleSweep:boolean;tripleSweepScore:number;penalties:number;finalPileScore:number;totalPileScore:number;sharePercent:number;grossPileReward:number;grossGameReturn:number;profit:number;rake:number;finalReturn:number}

export const TIER_MISSION_DIFFICULTY_WEIGHTS:Readonly<Record<Exclude<TierCPlusTier,'initiate'>,Readonly<Record<MissionDifficulty,number>>>>=Object.freeze({
  adept:Object.freeze({1:30,2:60,3:10,4:0}),
  mastermind:Object.freeze({1:10,2:50,3:40,4:0}),
  highNoble:Object.freeze({1:5,2:35,3:30,4:30}),
  lastBoss:Object.freeze({1:0,2:20,3:40,4:40}),
})
const MISSION_RANKS_BY_DIFFICULTY:Readonly<Record<MissionDifficulty,readonly MissionRank[]>>=Object.freeze({
  1:Object.freeze(['high_card','one_pair'] as MissionRank[]),
  2:Object.freeze(['two_pair','three_of_a_kind'] as MissionRank[]),
  3:Object.freeze(['straight','flush'] as MissionRank[]),
  4:Object.freeze(['full_house','four_of_a_kind','straight_flush','royal_flush'] as MissionRank[]),
})
const INITIATE_EASY_MISSION_SETS:readonly (readonly Mission[])[]=[
  [{pile:1,rank:'high_card'},{pile:2,rank:'one_pair'},{pile:3,rank:'two_pair'}],
  [{pile:1,rank:'high_card'},{pile:2,rank:'one_pair'},{pile:3,rank:'two_pair'}],
  [{pile:1,rank:'high_card'},{pile:2,rank:'one_pair'},{pile:3,rank:'three_of_a_kind'}],
  [{pile:1,rank:'high_card'},{pile:2,rank:'two_pair'},{pile:3,rank:'three_of_a_kind'}],
  [{pile:1,rank:'one_pair'},{pile:2,rank:'two_pair'},{pile:3,rank:'three_of_a_kind'}],
]

export function getTierBuyIn(tier:CanonicalTier|TierCPlusTier):number{return TIER_C_PLUS_RULES.buyIn[tier in LEGACY_TIER_TO_CANONICAL?LEGACY_TIER_TO_CANONICAL[tier as TierCPlusTier]:tier as CanonicalTier]}
export function getGamePilePots(tier:CanonicalTier|TierCPlusTier):readonly [number,number,number]{const matchPot=getTierBuyIn(tier)/TIER_C_PLUS_RULES.matchCount;return [matchPot*2/10,matchPot*3/10,matchPot*5/10]}

export function calculatePileScore(input:PileScoreInput):PileScoreBreakdown{
  const winScore=input.won?TIER_C_PLUS_RULES.winScore[input.pile]:0
  const missionScore=input.missionCompleted&&input.missionDifficulty?TIER_C_PLUS_RULES.missionScore[input.pile][input.missionDifficulty]:0
  const comboType=input.pile===3?(input.comboType??'NONE'):'NONE';const comboScore=TIER_C_PLUS_RULES.comboScore[comboType]
  const tripleSweep=input.pile===3&&input.tripleSweep===true;const tripleSweepScore=tripleSweep?TIER_C_PLUS_RULES.tripleSweepScore:0
  const penalties=input.penalties??0;const calculatedScore=winScore+missionScore+comboScore+tripleSweepScore+penalties
  return{pile:input.pile,winScore,missionScore,comboType,comboScore,tripleSweep,tripleSweepScore,penalties,calculatedScore,finalPileScore:Math.max(0,calculatedScore)}
}

export function detectTripleSweep(winners:readonly [string,string,string]):string|null{return winners[0]&&winners.every(id=>id===winners[0])?winners[0]:null}

/** Hamilton allocation. Equal remainders use playerIds order. Zero-score piles split equally in that same stable order. */
export function distributePilePot(amount:number,scores:Record<string,number>,playerIds:readonly string[]):PotAllocation{
  if(!Number.isSafeInteger(amount)||amount<0)throw new Error('PILE_POT_MUST_BE_NON_NEGATIVE_SAFE_INTEGER')
  if(playerIds.length===0){if(amount!==0)throw new Error('PLAYERS_REQUIRED_FOR_NON_ZERO_POT');return{rewards:{},totalScore:0,shares:{}}}
  const normalized=playerIds.map(id=>Math.max(0,scores[id]??0));const scoreTotal=normalized.reduce((a,b)=>a+b,0)
  const weights=scoreTotal===0?playerIds.map(()=>1):normalized;const denominator=weights.reduce((a,b)=>a+b,0)
  const rewards=Object.fromEntries(playerIds.map(id=>[id,0])) as Record<string,number>
  const rows=playerIds.map((id,index)=>{const numerator=amount*weights[index];const floor=Math.floor(numerator/denominator);rewards[id]=floor;return{id,index,remainder:numerator%denominator}})
  let remaining=amount-Object.values(rewards).reduce((a,b)=>a+b,0);rows.sort((a,b)=>b.remainder-a.remainder||a.index-b.index)
  for(let i=0;i<remaining;i++)rewards[rows[i].id]++
  return{rewards,totalScore:scoreTotal,shares:Object.fromEntries(playerIds.map((id,i)=>[id,scoreTotal===0?1/playerIds.length:normalized[i]/scoreTotal]))}
}
export function allocatePotByScore(amount:number,scores:Record<string,number>,playerIds:readonly string[]):Record<string,number>{return distributePilePot(amount,scores,playerIds).rewards}

/** Fractional rake is floored: a partial Token is never burned. */
export function calculateGameProfitAndRake(grossReturn:number,buyIn:number):GameReturn{
  if(!Number.isSafeInteger(grossReturn)||grossReturn<0||!Number.isSafeInteger(buyIn)||buyIn<0)throw new Error('RETURNS_MUST_BE_NON_NEGATIVE_SAFE_INTEGERS')
  const profit=Math.max(0,grossReturn-buyIn);const rake=Math.floor(profit*TIER_C_PLUS_RULES.rakeNumerator/TIER_C_PLUS_RULES.rakeDenominator)
  return{grossReturn,buyIn,profit,rake,finalReturn:grossReturn-rake}
}

/** Builds the complete, export-ready balance event without reconstructing a Match. */
export function buildTierCPlusPileTelemetry(input:{tier:CanonicalTier;matchIndex:1|2|3;player:string;score:PileScoreBreakdown;pilePot:number;totalPileScore:number;share:number;grossPileReward:number;missionTier?:MissionDifficulty;missionType?:string;gameReturn:GameReturn}):TierCPlusPileTelemetry{
  return{tier:input.tier,buyIn:getTierBuyIn(input.tier),matchIndex:input.matchIndex,pile:`G${input.score.pile}` as 'G1'|'G2'|'G3',pilePot:input.pilePot,player:input.player,winScore:input.score.winScore,missionTier:input.missionTier??null,missionType:input.missionType??null,missionScore:input.score.missionScore,comboType:input.score.comboType,comboScore:input.score.comboScore,tripleSweep:input.score.tripleSweep,tripleSweepScore:input.score.tripleSweepScore,penalties:input.score.penalties,finalPileScore:input.score.finalPileScore,totalPileScore:input.totalPileScore,sharePercent:input.share*100,grossPileReward:input.grossPileReward,grossGameReturn:input.gameReturn.grossReturn,profit:input.gameReturn.profit,rake:input.gameReturn.rake,finalReturn:input.gameReturn.finalReturn}
}

export function getMissionDifficulty(mission:Mission):MissionDifficulty{return mission.superComboChallenge?4:mission.negative?4:mission.rank==='high_card'||mission.rank==='one_pair'?1:mission.rank==='two_pair'||mission.rank==='three_of_a_kind'?2:mission.rank==='straight'||mission.rank==='flush'?3:4}
function pickMissionDifficulty(weights:Readonly<Record<MissionDifficulty,number>>,random:()=>number):MissionDifficulty{const roll=Math.min(99.999999,Math.max(0,random()*100));let cursor=0;for(const difficulty of [1,2,3,4] as const){cursor+=weights[difficulty];if(roll<cursor)return difficulty}return 4}
export function generateTierCPlusMissions(tier:TierCPlusTier,random:()=>number=Math.random):Mission[]{
  if(tier==='initiate'){const index=Math.min(INITIATE_EASY_MISSION_SETS.length-1,Math.floor(random()*INITIATE_EASY_MISSION_SETS.length));return INITIATE_EASY_MISSION_SETS[index].map(m=>({...m}))}
  const weights=TIER_MISSION_DIFFICULTY_WEIGHTS[tier]
  return([1,2,3] as PileNumber[]).map(pile=>{const difficulty=pickMissionDifficulty(weights,random);const ranks=MISSION_RANKS_BY_DIFFICULTY[difficulty];const rank=ranks[Math.min(ranks.length-1,Math.floor(random()*ranks.length))];return{pile,rank}})
}

/** Live-engine adapter. Every awarded number delegates to the canonical per-pile calculator. */
export function scoreTierCPlusRound(input:{playerIds:readonly string[];winners:readonly [string,string,string];hands:Record<string,readonly [string,string,string]>;missions:readonly Mission[];fouled?:Record<string,boolean>;random?:()=>number}):Record<string,TierCPlusScore>{
  const sweepWinner=detectTripleSweep(input.winners);return Object.fromEntries(input.playerIds.map(id=>{
    const outcomes=input.missions.map(m=>missionResult(m,input.hands[id][m.pile-1] as any));const completed=outcomes.filter(x=>x.complete).length
    const kind=comboKind(outcomes.map(x=>x.complete));const comboType:ComboType=kind??'NONE'
    const piles=([1,2,3] as PileNumber[]).map(pile=>{const missionIndex=input.missions.findIndex(m=>m.pile===pile);const outcome=missionIndex>=0?outcomes[missionIndex]:undefined;const mission=missionIndex>=0?input.missions[missionIndex]:undefined;return calculatePileScore({pile,won:input.winners[pile-1]===id,missionCompleted:outcome?.complete,missionDifficulty:mission?getMissionDifficulty(mission):undefined,comboType,tripleSweep:sweepWinner===id,penalties:outcome?.penalty??0})}) as [PileScoreBreakdown,PileScoreBreakdown,PileScoreBreakdown]
    if(input.fouled?.[id])for(const pile of piles){pile.winScore=0;pile.missionScore=0;pile.comboScore=0;pile.tripleSweepScore=0;pile.calculatedScore=0;pile.finalPileScore=0}
    return[id,{pile:piles.reduce((s,p)=>s+p.winScore,0),mission:piles.reduce((s,p)=>s+p.missionScore,0),penalty:piles.reduce((s,p)=>s+p.penalties,0),combo:piles[2].comboScore,sweep:piles[2].tripleSweepScore,streakBonus:0,total:piles.reduce((s,p)=>s+p.finalPileScore,0),completed,comboKind:kind,piles}]
  }))
}
export function missionStreakBonus(completed:readonly boolean[],startingStreak=0):{bonus:number;streak:number}{let streak=Math.max(0,startingStreak),bonus=0;for(const success of completed){if(success){streak++;bonus+=streak*2}else streak=0}return{bonus,streak}}
