export const MINI_TOURNAMENT_DURATION_MS=24*60*60*1000
export const MINI_TOURNAMENT_COHORT_SIZE=36
export const MINI_TOURNAMENT_LEVEL_RANGE=30
export const MINI_TOURNAMENT_MIN_LEVEL=100
export const MINI_TOURNAMENT_TRIGGER={numerator:2,denominator:18} as const
export const MINI_TOURNAMENT_TRIGGER_RATE=MINI_TOURNAMENT_TRIGGER.numerator/MINI_TOURNAMENT_TRIGGER.denominator
export const MINI_TOURNAMENT_MOCK_TICK_MS=15*60*1000
export type TournamentRewardBand={rank1:number;rank2:number;rank3:number;rank4To20:number}
export const MINI_TOURNAMENT_REWARD_BANDS=Object.freeze([
 {minLevel:100,maxLevel:199,rewards:{rank1:1000,rank2:500,rank3:200,rank4To20:100}},
 {minLevel:200,maxLevel:299,rewards:{rank1:1200,rank2:700,rank3:350,rank4To20:200}},
 {minLevel:300,maxLevel:399,rewards:{rank1:1500,rank2:900,rank3:500,rank4To20:300}},
 {minLevel:400,maxLevel:499,rewards:{rank1:1900,rank2:1150,rank3:700,rank4To20:400}},
 {minLevel:500,maxLevel:599,rewards:{rank1:2500,rank2:1500,rank3:1000,rank4To20:550}},
 {minLevel:600,maxLevel:699,rewards:{rank1:3200,rank2:1950,rank3:1300,rank4To20:700}},
 {minLevel:700,maxLevel:799,rewards:{rank1:3900,rank2:2350,rank3:1550,rank4To20:800}},
 {minLevel:800,maxLevel:899,rewards:{rank1:4400,rank2:2650,rank3:1750,rank4To20:900}},
 {minLevel:900,maxLevel:999,rewards:{rank1:4750,rank2:2850,rank3:1900,rank4To20:950}},
 {minLevel:1000,maxLevel:Number.MAX_SAFE_INTEGER,rewards:{rank1:5000,rank2:3000,rank3:2000,rank4To20:1000}},
] as const)
export type MiniTournamentStatus='OPEN'|'LOCKED'
export type MiniTournamentEntry={userId:string;level:number;points:number;updatedAt:number;synthetic?:boolean;mockUpdateSlot?:number}

export function miniTournamentStatus(endAt:number,now=Date.now()):MiniTournamentStatus{return now>=endAt?'LOCKED':'OPEN'}
export function createMiniTournamentWindow(now=Date.now()){return{startAt:now,endAt:now+MINI_TOURNAMENT_DURATION_MS}}
export function shouldTriggerPersonalTournament(roll:number){return Number.isFinite(roll)&&roll>=0&&roll<MINI_TOURNAMENT_TRIGGER_RATE}
export function tournamentRewardBand(level:number):TournamentRewardBand|undefined{return MINI_TOURNAMENT_REWARD_BANDS.find(band=>level>=band.minLevel&&level<=band.maxLevel)?.rewards}
export function tournamentTokenReward(rank:number,band:TournamentRewardBand){return rank===1?band.rank1:rank===2?band.rank2:rank===3?band.rank3:rank<=20?band.rank4To20:0}
export function tournamentTrophy(rank:number){return rank===1?'Gold':rank===2?'Silver':rank===3?'Bronze':null}
export function tournamentScore(current:number,baseline:number){return Math.max(0,Math.trunc(current)-Math.trunc(baseline))}
export function mockIncrement(tournamentId:string,userId:string,slot:number){const n=hash(`${tournamentId}:${userId}:${slot}`)%5;return n===0?0:5+(hash(`${userId}:${slot}:gain`)%6)}
/** Persisted slots make mock progress idempotent, slow, irregular and independent of owner score. */
export function advanceSyntheticEntries(entries:readonly MiniTournamentEntry[],startAt:number,now=Date.now(),tournamentId='event'){
 const target=Math.max(0,Math.floor((now-startAt)/MINI_TOURNAMENT_MOCK_TICK_MS))
 return entries.map(entry=>{if(!entry.synthetic)return entry;let points=entry.points;const from=entry.mockUpdateSlot??0;for(let slot=from+1;slot<=target;slot++)points+=mockIncrement(tournamentId,entry.userId,slot);return{...entry,points,mockUpdateSlot:target,updatedAt:startAt+target*MINI_TOURNAMENT_MOCK_TICK_MS}})
}
export function syntheticEntries(tournamentId:string,playerLevel:number,count:number):MiniTournamentEntry[]{return Array.from({length:Math.max(0,count)},(_,index)=>({userId:`synthetic:${tournamentId}:${index+1}`,level:Math.max(1,playerLevel+(hash(`${tournamentId}:${index}:level`)%17)-8),points:0,updatedAt:0,synthetic:true,mockUpdateSlot:0}))}
export function rankMiniTournament(entries:readonly MiniTournamentEntry[]){return[...entries].sort((a,b)=>b.points-a.points||b.level-a.level||a.updatedAt-b.updatedAt||a.userId.localeCompare(b.userId)).map((entry,index)=>({...entry,rank:index+1}))}
function hash(value:string){let h=2166136261;for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619);return h>>>0}
