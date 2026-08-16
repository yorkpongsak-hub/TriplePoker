import { AudioEvent } from './audioEvents'

export const bossAudioProfiles = {
  monarch: { impact: AudioEvent.MONARCH_REVEAL, ambience: null, intensity: .75 },
  soren: { impact: AudioEvent.SOREN_REVEAL, ambience: AudioEvent.BOSS_AMBIENCE, intensity: .85 },
  caelum: { impact: AudioEvent.CAELUM_REVEAL, ambience: AudioEvent.BOSS_AMBIENCE, intensity: 1 },
} as const

export type BossAudioProfile = keyof typeof bossAudioProfiles
