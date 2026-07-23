// reduceMotion.ts
// Reduce Motion preference — per-player local เท่านั้น (AsyncStorage, ไม่ sync Supabase รอบแรก)
// pattern เดียวกับ buyInConfirmed_${tier} ใน lobby.tsx — ใช้ร่วมกันทั้ง Settings modal (เขียนค่า)
// และ 4 Tier's index.tsx (อ่านค่าตอน mount เพื่อย่น deal animation)
// The Sage Unicorn Studio Co., Ltd.

import AsyncStorage from '@react-native-async-storage/async-storage'

export const REDUCE_MOTION_KEY = 'reduceMotion'

// คืนค่า boolean เสมอ (default false ถ้ายังไม่เคยตั้งค่า หรืออ่านไม่ได้)
export async function getReduceMotion(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(REDUCE_MOTION_KEY)
    return raw === 'true'
  } catch {
    return false
  }
}

export async function setReduceMotion(value: boolean): Promise<void> {
  await AsyncStorage.setItem(REDUCE_MOTION_KEY, value ? 'true' : 'false')
}
