// ผูก Tier D Solo กับ Google Play Games Services v2 (เฉพาะ Android) แทน leaderboard
// ของเราเองที่ต้องพึ่ง server — ไม่มี tournament/reward ใดๆ แค่ submit score + เปิด
// native leaderboard UI ให้ผู้เล่นเทียบกับคนอื่นจริง เหมือนที่เกม mobile แนวเดียวกันใช้
import { Platform } from 'react-native'
import { PlayGames } from 'expo-play-games'

const FASTEST_TIME_LEADERBOARD_ID = process.env.EXPO_PUBLIC_PLAY_GAMES_FASTEST_TIME_LEADERBOARD_ID ?? ''
const LONGEST_STREAK_LEADERBOARD_ID = process.env.EXPO_PUBLIC_PLAY_GAMES_LONGEST_STREAK_LEADERBOARD_ID ?? ''

const isSupported = Platform.OS === 'android'

let signInAttempted = false

// เรียกครั้งเดียวตอนแอปเปิด (เงียบๆ) — ถ้าผู้เล่นไม่เคยผูก Play Games หรือออฟไลน์อยู่
// ก็แค่ fail เฉยๆ ไม่กระทบการเล่น
export async function initPlayGamesSession(): Promise<void> {
  if (!isSupported || signInAttempted) return
  signInAttempted = true
  try {
    await PlayGames.signIn()
  } catch {
    // ไม่ได้ sign in ก็เล่นต่อแบบออฟไลน์ล้วนตามปกติ
  }
}

function submitScore(leaderboardId: string, score: number): void {
  if (!isSupported || !leaderboardId) return
  void PlayGames.submitScore(leaderboardId, Math.max(0, Math.round(score))).catch(() => {})
}

// เวลาเคลียร์เลเวลเร็วที่สุด (ms) — ตั้งค่า sort order "Smaller is Better" ใน Play Console
export function submitFastestTime(elapsedMs: number): void {
  submitScore(FASTEST_TIME_LEADERBOARD_ID, elapsedMs)
}

// win streak ยาวที่สุด — ตั้งค่า sort order "Larger is Better" ใน Play Console
export function submitLongestStreak(streak: number): void {
  submitScore(LONGEST_STREAK_LEADERBOARD_ID, streak)
}

async function showLeaderboard(leaderboardId: string): Promise<void> {
  if (!isSupported || !leaderboardId) return
  try {
    await PlayGames.showLeaderboard(leaderboardId)
  } catch {
    // ผู้เล่นปิด Play Games UI เองหรือไม่ได้ sign in — เงียบไว้ ไม่ต้องแจ้ง error
  }
}

export function showFastestTimeLeaderboard(): Promise<void> {
  return showLeaderboard(FASTEST_TIME_LEADERBOARD_ID)
}

export function showLongestStreakLeaderboard(): Promise<void> {
  return showLeaderboard(LONGEST_STREAK_LEADERBOARD_ID)
}
