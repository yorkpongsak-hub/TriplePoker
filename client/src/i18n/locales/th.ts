import type { TranslationShape } from '../types'
const th: TranslationShape = {
  common: { continue: 'ดำเนินการต่อ', back: 'กลับ', close: 'ปิด', cancel: 'ยกเลิก', confirm: 'ยืนยัน', done: 'เสร็จสิ้น', loading: 'กำลังโหลด…', error: 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง', language: 'ภาษา', settings: 'ตั้งค่า', play: 'เล่น', enter: 'เข้า', exit: 'ออก', retry: 'ลองอีกครั้ง', comingSoon: 'เร็ว ๆ นี้' },
  entry: { enter: 'เข้า', howToPlay: 'วิธีเล่น', openDoor: 'เปิดประตู', level: 'เลเวล {level}' },
  lobby: { title: 'ล็อบบี้ TriplePoker: Rise', tierDSolo: 'Tier D โซโล', continueSolo: 'เล่นเลเวลโซโลต่อ', buyIn: 'ค่าเข้า: {amount}', notEnoughTokens: 'Token ไม่พอ', backToLobby: 'กลับล็อบบี้', liveTables: 'โต๊ะที่กำลังเล่นอยู่', noLiveTables: 'ไม่มีโต๊ะที่กำลังเล่นใน Tier นี้' },
  game: { arrange: 'จัดไพ่', reveal: 'เปิดไพ่', autoReveal: 'เปิดไพ่อัตโนมัติ', pile: 'กอง {pile}', foul: 'ฟาวล์', winner: 'ผู้ชนะ', youWin: 'คุณชนะ!', youLose: 'คุณแพ้', greatJob: 'เยี่ยมมาก!', combo: 'คอมโบ!', superCombo: 'ซูเปอร์คอมโบ!', matchComplete: 'จบแมตช์', matchEnd: 'สิ้นสุดแมตช์', finalTokenBalance: 'ยอด Token สุดท้าย', level: 'เลเวล {level}', league: 'ลีก', countdown: '{seconds} วินาที', hand: 'มือ {current} / {total}' },
  poker: { handRank: { royal_flush: 'รอยัลฟลัช', straight_flush: 'สเตรทฟลัช', four_of_a_kind: 'โฟร์การ์ด', full_house: 'ฟูลเฮาส์', flush: 'ฟลัช', straight: 'สเตรท', three_of_a_kind: 'ตอง', two_pair: 'สองคู่', one_pair: 'หนึ่งคู่', high_card: 'ไพ่สูง' }, bestFive: 'ไพ่ดีสุด 5 ใบ' },
  ranking: { top20: 'ท็อป 20', rank: 'อันดับ #{rank}', player: 'ผู้เล่น', points: 'คะแนน', streak: 'ชนะต่อเนื่อง', tournamentStarted: 'การแข่งขันท็อป 20 เริ่มแล้ว', timeRemaining: 'เวลาที่เหลือ', tournamentEnded: 'การแข่งขันสิ้นสุดแล้ว', finalRank: 'อันดับสุดท้าย', reward: 'รางวัล', champion: 'แชมป์' },
  actions: { auction: 'ประมูล', call: 'ตาม', fold: 'หมอบ', reveal: 'เปิดไพ่', autoReveal: 'เปิดไพ่อัตโนมัติ', matchmaking: 'กำลังจับคู่' },
  economy: { token: 'Token', tokens: 'Token', crown: 'Crown', insufficientTokens: 'Token ไม่พอ', tokensReturned: 'คืน {amount} Token เข้ากระเป๋าแล้ว' },
  errors: { unauthorized: 'ยืนยันเซสชันไม่ได้ กรุณาเข้าสู่ระบบอีกครั้ง', invalidPin: 'PIN ต้องมีตัวเลข 4 หลัก', tierLocked: 'Tier นี้ยังล็อกอยู่ เล่นต่อเพื่อปลดล็อก', adUnavailable: 'ระบบโฆษณาใช้งานไม่ได้ คุณยังเล่นต่อได้', matchNotFound: 'ไม่พบแมตช์ กรุณาลองอีกครั้ง' },
  tutorial: { title: 'วิธีเล่น', close: 'ปิดคู่มือ', pileOrder: 'จัดกอง 1 ≤ กอง 2 ≤ กอง 3' },
  vip: { vip: 'VIP', pro: 'VIP Pro', proPlus: 'VIP Pro Plus' },
}
export default th
