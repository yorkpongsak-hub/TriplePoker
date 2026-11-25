// Jest ไม่มี native module ของ expo-play-games ให้เรียก (requireNativeModule พังทันทีตอน import
// จริง) — mock นี้ auto-apply กับทุกไฟล์ที่ import 'expo-play-games' ตอนรัน test เท่านั้น
export const PlayGames = {
  signIn: jest.fn(async () => false),
  isSignedIn: jest.fn(async () => false),
  signOut: jest.fn(async () => {}),
  getCurrentPlayer: jest.fn(async () => null),
  submitScore: jest.fn(async () => false),
  showLeaderboard: jest.fn(async () => {}),
  showAllLeaderboards: jest.fn(async () => {}),
  unlockAchievement: jest.fn(async () => false),
  incrementAchievement: jest.fn(async () => false),
  showAchievements: jest.fn(async () => {}),
}
