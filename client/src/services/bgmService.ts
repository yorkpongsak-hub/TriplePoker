import { useEffect } from 'react'
import { audio, AudioCategory, AudioEvent } from '../audio'

/** Compatibility facade. New code should emit semantic events through `audio`. */
export function ensureBgmPlaying(): void { audio.playBGM(AudioEvent.LOBBY_BGM) }
export function fadeOutBgm(): void { audio.stopBGM(500) }
export function setBgmVolume(volume0to1: number): void { audio.setCategoryVolume(AudioCategory.BGM, volume0to1) }
export function useBgm(): void { useEffect(() => { ensureBgmPlaying() }, []) }
export function playApplauseSfx(): void { audio.play(AudioEvent.TIER_UNLOCK) }
export function playCountdownTick(): void { audio.play(AudioEvent.BUTTON_CONFIRM) }
