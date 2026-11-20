import AsyncStorage from '@react-native-async-storage/async-storage'
import { AudioCategory } from './audioEvents'

export const AUDIO_SETTINGS_KEY = 'settings.audio.v1'

export type AudioSettings = {
  muted: boolean
  master: number
  categories: Record<AudioCategory, number>
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  muted: false,
  master: 1,
  categories: {
    [AudioCategory.BGM]: 0.35,
    [AudioCategory.UI]: 0.55,
    [AudioCategory.CARD]: 0.60,
    [AudioCategory.GAMEPLAY]: 0.65,
    [AudioCategory.TIMER]: 0.55,
    [AudioCategory.RESULT]: 0.80,
    [AudioCategory.BOSS]: 0.90,
    [AudioCategory.STORY]: 0.55,
  },
}

export const clampVolume = (value: number): number => Math.max(0, Math.min(1, value))

export async function loadAudioSettings(): Promise<AudioSettings> {
  try {
    const raw = await AsyncStorage.getItem(AUDIO_SETTINGS_KEY)
    if (!raw) return DEFAULT_AUDIO_SETTINGS
    const saved = JSON.parse(raw) as Partial<AudioSettings>
    return {
      muted: saved.muted === true,
      master: clampVolume(saved.master ?? DEFAULT_AUDIO_SETTINGS.master),
      categories: { ...DEFAULT_AUDIO_SETTINGS.categories, ...(saved.categories ?? {}) },
    }
  } catch {
    return DEFAULT_AUDIO_SETTINGS
  }
}

export async function saveAudioSettings(settings: AudioSettings): Promise<void> {
  try { await AsyncStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings)) } catch { /* preferences are non-critical */ }
}
