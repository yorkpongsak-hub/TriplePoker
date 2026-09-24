import { missionResult } from './leagueGameplay'
import type { TierDLevelState } from './tierDSolo'

/** สถานะภารกิจจากผลจริง แยกผลชั่วคราวออกจากผลที่ Commit แล้ว */
export function tierDMissionAwareness(state: TierDLevelState, seatId: string, committedThrough: number, hideProvisional = false) {
  const names = { high_card: 'HIGH CARD', one_pair: 'PAIR', two_pair: 'TWO PAIR', three_of_a_kind: 'TRIPS', straight: 'STRAIGHT', flush: 'FLUSH', full_house: 'FULL HOUSE', four_of_a_kind: 'FOUR OF A KIND', straight_flush: 'STRAIGHT FLUSH', royal_flush: 'ROYAL FLUSH' }
  const missions = [...state.missions].sort((a,b)=>a.pile-b.pile).map(mission => {
    const result = state.gameResults.find(result=>result.game===mission.pile)
    const evaluated = result && (!hideProvisional || mission.pile<=committedThrough)
    const success = evaluated && !result.fouled?.[seatId] && missionResult(mission,result.hands[seatId].rank).complete
    const status = !evaluated ? 'pending' : success ? 'success' : 'failed'
    const provisional = !!evaluated && mission.pile>committedThrough
    const reward = missionResult({...mission,negative:false},mission.rank).score
    const forcedLabel = mission.rank === 'high_card' ? `${names[mission.rank]} ONLY` : `${names[mission.rank]}+`
    return {pile:mission.pile,status,provisional,negative:!!mission.negative,
      label:mission.negative?`⚠ ${forcedLabel} · FAIL ${mission.penalty}`:`${names[mission.rank]} +${reward}`}
  })
  const count=missions.length
  const failed=missions.some(m=>m.status==='failed'&&!m.provisional)
  const completed=missions.filter(m=>m.status==='success'&&!m.provisional).length
  const kind=count===3?'SUPER COMBO':'COMBO'
  const title=count===1?'MISSION':completed>0||failed?kind:`${count} MISSIONS`
  const detail=failed?(count===1?'MISSION MISSED':`${kind} MISSED`):completed===count&&count>0?(count===1?'MISSION COMPLETE':`${kind}!`):count===1?'COMPLETE FOR BONUS':completed>0?`${count-completed} TO GO`:count===3?'SUPER COMBO +10–15':'COMBO +5–7'
  return {missions,title,detail,failed,risk:missions.some(m=>m.negative),intro:count===1?'Complete the objective for bonus points':count===2?'Complete both → COMBO +5–7':'Complete all 3 → SUPER COMBO +10–15'}
}
