export const MINI_TOURNAMENT_DURATION_MS = 24 * 60 * 60 * 1000
export const MINI_TOURNAMENT_COHORT_MIN = 40
export const MINI_TOURNAMENT_COHORT_MAX = 50
export const MINI_TOURNAMENT_REAL_MIN = 20
export const MINI_TOURNAMENT_REAL_MAX = 40
export const MINI_TOURNAMENT_SYNTHETIC_MAX = 20
export const MINI_TOURNAMENT_TRIGGER_MIN = 5
export const MINI_TOURNAMENT_TRIGGER_MAX = 6
export type MiniTournamentStatus = 'OPEN' | 'LOCKED'
export type MiniTournamentEntry = { userId:string; level:number; points:number; updatedAt:number; synthetic?:boolean }

/** Server-only timing boundary. Level count never ends an event. */
export function miniTournamentStatus(endAt:number, now=Date.now()):MiniTournamentStatus { return now >= endAt ? 'LOCKED' : 'OPEN' }
export function createMiniTournamentWindow(now=Date.now()) { return { startAt:now, endAt:now+MINI_TOURNAMENT_DURATION_MS } }
export function personalTournamentTrigger(userId:string,cycle:number){return MINI_TOURNAMENT_TRIGGER_MIN+(hash(`${userId}:trigger:${cycle}`)%(MINI_TOURNAMENT_TRIGGER_MAX-MINI_TOURNAMENT_TRIGGER_MIN+1))}
export function personalRealRivalCount(userId:string,cycle:number){return MINI_TOURNAMENT_REAL_MIN+(hash(`${userId}:rivals:${cycle}`)%(MINI_TOURNAMENT_REAL_MAX-MINI_TOURNAMENT_REAL_MIN+1))}
export function canJoinMiniTournament(entries:readonly MiniTournamentEntry[], playerLevel:number) {
  const real=entries.filter(entry=>!entry.synthetic)
  return real.length < MINI_TOURNAMENT_COHORT_MAX && real.every(entry=>Math.abs(entry.level-playerLevel)<=30)
}
/** Stable seeded rivals fill only unoccupied capacity; their points never react to player results. */
export function syntheticEntries(tournamentId:string, playerLevel:number, count:number):MiniTournamentEntry[] {
  return Array.from({length:Math.max(0,count)},(_,index)=>{const seed=hash(`${tournamentId}:${index}`);return {userId:`synthetic:${tournamentId}:${index+1}`,level:Math.max(1,playerLevel+(seed%17)-8),points:Math.floor(seed%180),updatedAt:0,synthetic:true}})
}
/** Deterministic 15-minute score ticks keep mock rivals moving slowly. */
export function advanceSyntheticEntries(entries:readonly MiniTournamentEntry[],startAt:number,now=Date.now()):MiniTournamentEntry[]{const ticks=Math.max(0,Math.floor((now-startAt)/(15*60*1000)));return entries.map(entry=>entry.synthetic?{...entry,points:entry.points+ticks*(1+(hash(`${entry.userId}:pace`)%3)),updatedAt:startAt+ticks*15*60*1000}:entry)}
export function rankMiniTournament(entries:readonly MiniTournamentEntry[]) { return [...entries].sort((a,b)=>b.points-a.points||b.level-a.level||a.updatedAt-b.updatedAt||a.userId.localeCompare(b.userId)).map((entry,index)=>({...entry,rank:index+1})) }
function hash(value:string){let h=2166136261;for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619);return h>>>0}
