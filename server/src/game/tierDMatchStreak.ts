import { TIER_D_PILE_BASE_SCORES as STREAK_PILE_POINTS } from './tierDLeague'

/** นับเฉพาะแต้มพื้นฐานกองที่ชนะ ไม่อ่านคะแนนรวมที่มีตัวคูณหรือโบนัส */
export function wonTierDStreakMatch(playerId:string, aiIds:readonly string[], results:readonly {game:1|2|3;winnerId:string|null}[]):boolean {
  if(results.length!==3||new Set(results.map(result=>result.game)).size!==3)return false
  const score=(id:string)=>results.reduce((total,result)=>total+(result.winnerId===id?STREAK_PILE_POINTS[result.game]:0),0)
  return score(playerId)>=Math.max(0,...aiIds.map(score))
}
