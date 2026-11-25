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
  const settled=missions.every(m=>m.status!=='pending'&&!m.provisional)
  const failed=settled&&missions.filter(m=>m.status==='success').length<2
  const completed=missions.filter(m=>m.status==='success'&&!m.provisional).length
  const kind=completed===3?'SUPER COMBO':'COMBO'
  const title=count===1?'MISSION':completed>0||failed?kind:`${count} MISSIONS`
  const baseDetail=failed?(count===1?'MISSION MISSED':'COMBO MISSED')
    :settled&&completed===3?'SUPER COMBO!'
    :settled&&completed===2?'COMBO!'
    :count===1?'COMPLETE FOR BONUS'
    :completed>0?`${count-completed} TO GO`
    :count===2?'COMBO +5–7'
    :'2 COMPLETE → COMBO · ALL 3 → SUPER COMBO'
  const detail=settled&&state.missionStreak!==undefined&&state.seats.some(seat=>seat.id===seatId&&!seat.isBot)?`${baseDetail} · STREAK ${state.missionStreak}${state.missionStreakBonusAward?` (+${state.missionStreakBonusAward})`:''}`:baseDetail
  return {missions,title,detail,failed,risk:missions.some(m=>m.negative),intro:count===1?'Complete the objective for bonus points':count===2?'Complete both → COMBO +5–7':'Complete 2 → COMBO +5–7 · all 3 → SUPER COMBO +10–15'}
}
