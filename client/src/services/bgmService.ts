import { useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { audio, AudioCategory, AudioEvent } from '../audio'

/** Compatibility facade. New code should emit semantic events through `audio`. */
export function ensureBgmPlaying(): void { audio.playBGM(AudioEvent.LOBBY_BGM) }
export function fadeOutBgm(): void { audio.stopBGM(500) }
export function setBgmVolume(volume0to1: number): void { audio.setCategoryVolume(AudioCategory.BGM, volume0to1) }
// Expo Router keeps screens mounted in its navigation stack. Restore menu music whenever a screen
// becomes active again after a table faded it out.
export function useBgm(event: AudioEvent = AudioEvent.LOBBY_BGM): void {
  useFocusEffect(useCallback(() => {
    audio.playBGM(event)
    return () => audio.stop(event, audioRegistryFadeOut(event))
  }, [event]))
}

function audioRegistryFadeOut(event: AudioEvent): number {
  return event === AudioEvent.PERFECT_VICTORY_BGM ? 800 : 500
}
export function playApplauseSfx(): void { audio.play(AudioEvent.TIER_UNLOCK) }
export function playCountdownTick(): void { audio.play(AudioEvent.BUTTON_CONFIRM) }
