import { AppState, AppStateStatus } from 'react-native'
import { AudioPlayer, createAudioPlayer, setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio'
import { audioRegistry, PRELOAD_AUDIO_EVENTS } from './audioRegistry'
import { AudioCategory, AudioEvent, AudioPlayContext, AudioPriority } from './audioEvents'
import { AudioSettings, DEFAULT_AUDIO_SETTINGS, clampVolume, loadAudioSettings, saveAudioSettings } from './audioSettings'
import { BossAudioProfile, bossAudioProfiles } from './bossAudioProfiles'

type ActiveAudio = {
  event: AudioEvent
  player: AudioPlayer
  priority: AudioPriority
  baseVolume: number
  startedAt: number
  cleanup?: () => void
  safetyTimer?: ReturnType<typeof setTimeout>
}
type Listener = (settings: AudioSettings) => void
const PRIVATE_EVENTS = new Set([AudioEvent.PLAYER_TURN, AudioEvent.TIMER_WARNING, AudioEvent.TIMER_CRITICAL, AudioEvent.TIMER_PRESSURE, AudioEvent.TIMER_LONG])
const RESULT_EVENTS = new Set([AudioEvent.MATCH_WIN, AudioEvent.TRIPLE_SWEEP_CELEBRATION, AudioEvent.TIER_UNLOCK, AudioEvent.RARE_REACTION])
const CACHED_EVENTS = new Set<AudioEvent>(PRELOAD_AUDIO_EVENTS)

class AudioManager {
  private settings: AudioSettings = DEFAULT_AUDIO_SETTINGS
  private active = new Map<AudioEvent, ActiveAudio>()
  private lastPlayed = new Map<AudioEvent, number>()
  private dedupeKeys = new Map<string, number>()
  private fadeTimers = new Map<AudioEvent | AudioCategory, ReturnType<typeof setInterval>>()
  private listeners = new Set<Listener>()
  private duckFactor = 1
  private initialized = false
  private appStateSubscription: { remove(): void } | null = null
  private resumeBgm: AudioEvent | null = null
  private activationPromise: Promise<void> | null = null
  private cachedPlayers = new Map<AudioEvent, AudioPlayer>()

  async initialize(): Promise<void> {
    if (this.initialized) return
    this.initialized = true
    this.settings = await loadAudioSettings()
    this.emitSettings()
    try {
      await setAudioModeAsync({
        playsInSilentMode: false,
        interruptionMode: 'mixWithOthers',
        allowsRecording: false,
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      })
      await this.ensureAudioSessionActive()
      this.preloadFrequentlyUsedAudio()
    } catch (error) { this.warn('Could not configure audio focus', error) }
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppState)
  }

  dispose(): void {
    this.appStateSubscription?.remove()
    this.appStateSubscription = null
    this.stopAll(true)
    for (const player of this.cachedPlayers.values()) {
      try { player.pause(); player.remove() } catch { /* already released */ }
    }
    this.cachedPlayers.clear()
    this.initialized = false
  }

  play(event: AudioEvent, context: AudioPlayContext = {}): boolean {
    const definition = audioRegistry[event]
    if (!definition || this.settings.muted || this.settings.master <= 0) return false
    if (PRIVATE_EVENTS.has(event) && (context.spectator || context.isLocalPlayer !== true)) return false
    const now = Date.now()
    this.releaseStaleCriticalAudio(now)
    this.pruneDedupe(now)
    if (context.dedupeKey) {
      if (this.dedupeKeys.has(context.dedupeKey)) return false
      this.dedupeKeys.set(context.dedupeKey, now)
    }
    if (definition.cooldownMs && now - (this.lastPlayed.get(event) ?? 0) < definition.cooldownMs) return false
    if (this.hasBlockingPriority(definition.priority)) return false

    if (definition.category === AudioCategory.TIMER) this.stopCategory(AudioCategory.TIMER, 120)
    if (RESULT_EVENTS.has(event)) this.stopCategory(AudioCategory.RESULT, 100)
    if (definition.priority === AudioPriority.CRITICAL) this.suppressLowPriority()
    if (definition.duckBgm !== undefined) this.duck(AudioCategory.BGM, definition.duckBgm, 300)
    if (this.active.has(event)) this.stop(event, 0)

    try {
      // All registry sources are local Metro assets. Keep the shared session active and wait until Android
      // confirms it is ready before calling play(); otherwise the first sound after an interruption is lost.
      const player = this.getOrCreatePlayer(event)
      player.loop = definition.loop === true
      const baseVolume = definition.volume
      player.volume = definition.fadeInMs ? 0 : this.effectiveVolume(definition.category, baseVolume)
      const entry: ActiveAudio = { event, player, priority: definition.priority, baseVolume, startedAt: now }
      this.active.set(event, entry)
      this.lastPlayed.set(event, now)
      if (!player.loop) {
        const subscription = player.addListener('playbackStatusUpdate', status => {
          if (status.didJustFinish) this.release(event, player)
        })
        entry.cleanup = () => subscription.remove()
        // Native completion callbacks can be lost during an Android focus interruption. This prevents a
        // stale CRITICAL entry from suppressing LOW/NORMAL audio for the rest of the app session.
        entry.safetyTimer = setTimeout(
          () => this.release(event, player),
          definition.priority === AudioPriority.CRITICAL ? 20_000 : 10 * 60_000,
        )
      }
      void this.ensureAudioSessionActive()
        .then(async () => {
          if (this.active.get(event) !== entry) return
          if (CACHED_EVENTS.has(event)) await player.seekTo(0)
          if (this.active.get(event) !== entry) return
          player.play()
          if (definition.fadeInMs) this.fadeTo(event, this.effectiveVolume(definition.category, baseVolume), definition.fadeInMs)
        })
        .catch(error => {
          this.warn(`Could not activate audio session for ${event}`, error)
          this.release(event, player)
        })
      return true
    } catch (error) {
      this.warn(`Failed to play ${event}`, error)
      return false
    }
  }

  playTimer(remainingSeconds: number, options: { localPlayer: boolean; spectator?: boolean; pressure?: boolean; longTexture?: boolean } ): void {
    if (!options.localPlayer || options.spectator || remainingSeconds <= 0) { this.stopCategory(AudioCategory.TIMER); return }
    const context = { isLocalPlayer: true, spectator: options.spectator }
    if (remainingSeconds <= 5) this.play(AudioEvent.TIMER_CRITICAL, context)
    else if (remainingSeconds <= 10) this.play(options.pressure ? AudioEvent.TIMER_PRESSURE : AudioEvent.TIMER_WARNING, context)
    else if (options.longTexture) this.play(AudioEvent.TIMER_LONG, context)
    else this.stopCategory(AudioCategory.TIMER)
  }

  stopTimer(): void { this.stopCategory(AudioCategory.TIMER, 180) }

  /** Plays the common tap sound unless the pressed control already emitted a semantic sound. */
  playUiFeedback(): boolean {
    const now = Date.now()
    for (const [event, playedAt] of this.lastPlayed) {
      if (event !== AudioEvent.BUTTON_CONFIRM && now - playedAt < 75) return false
    }
    return this.play(AudioEvent.BUTTON_CONFIRM)
  }

  playBGM(event: AudioEvent = AudioEvent.LOBBY_BGM): boolean {
    if (audioRegistry[event]?.category !== AudioCategory.BGM) return false
    this.stopCategory(AudioCategory.BGM, 300)
    return this.play(event)
  }

  stopBGM(fadeMs = 500): void { this.stopCategory(AudioCategory.BGM, fadeMs) }

  playBoss(profileName: BossAudioProfile, encounterId: string): boolean {
    const profile = bossAudioProfiles[profileName]
    const key = `boss:${profileName}:${encounterId}`
    if (!this.play(profile.impact, { dedupeKey: key })) return false
    if (profile.ambience) setTimeout(() => this.play(profile.ambience!), profileName === 'caelum' ? 700 : 350)
    return true
  }

  stop(event: AudioEvent, fadeMs = audioRegistry[event]?.fadeOutMs ?? 0): void {
    const entry = this.active.get(event)
    if (!entry) return
    if (fadeMs > 0) this.fadeTo(event, 0, fadeMs, () => this.release(event, entry.player))
    else this.release(event, entry.player)
  }

  stopCategory(category: AudioCategory, fadeMs = 0): void {
    for (const [event] of this.active) if (audioRegistry[event].category === category) this.stop(event, fadeMs)
  }

  fadeIn(event: AudioEvent, ms: number): boolean {
    const played = this.play(event)
    if (played) this.fadeTo(event, this.effectiveVolume(audioRegistry[event].category, audioRegistry[event].volume), ms)
    return played
  }

  fadeOut(event: AudioEvent, ms: number): void { this.stop(event, ms) }

  duck(category: AudioCategory, factor: number, ms: number): void {
    if (category !== AudioCategory.BGM) return
    this.duckFactor = clampVolume(factor)
    this.fadeCategory(category, ms)
  }

  restore(category: AudioCategory, ms: number): void {
    if (category !== AudioCategory.BGM) return
    this.duckFactor = 1
    this.fadeCategory(category, ms)
  }

  setMasterVolume(value: number): void { this.updateSettings({ ...this.settings, master: clampVolume(value) }) }
  setCategoryVolume(category: AudioCategory, value: number): void {
    this.updateSettings({ ...this.settings, categories: { ...this.settings.categories, [category]: clampVolume(value) } })
  }
  setSfxVolume(value: number): void {
    const volume = clampVolume(value)
    const categories = { ...this.settings.categories }
    for (const category of Object.values(AudioCategory)) if (category !== AudioCategory.BGM) categories[category] = volume
    this.updateSettings({ ...this.settings, categories })
  }
  mute(): void { this.updateSettings({ ...this.settings, muted: true }); this.stopAll(false) }
  unmute(): void { this.updateSettings({ ...this.settings, muted: false }) }
  setMuted(muted: boolean): void { muted ? this.mute() : this.unmute() }
  getSettings(): AudioSettings { return { ...this.settings, categories: { ...this.settings.categories } } }
  getDebugState() {
    return { currentBGM: [...this.active.keys()].find(e => audioRegistry[e].category === AudioCategory.BGM) ?? null, activeAudio: [...this.active.keys()], settings: this.getSettings() }
  }
  subscribe(listener: Listener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener) }

  private handleAppState = (state: AppStateStatus): void => {
    if (state !== 'active') {
      this.resumeBgm = [...this.active.keys()].find(e => audioRegistry[e].category === AudioCategory.BGM) ?? null
      this.stopCategory(AudioCategory.TIMER)
      this.stopCategory(AudioCategory.BOSS, 150)
      this.stopCategory(AudioCategory.STORY, 150)
      this.stopCategory(AudioCategory.BGM, 150)
    } else if (this.resumeBgm) {
      const bgm = this.resumeBgm
      this.resumeBgm = null
      void this.ensureAudioSessionActive()
        .then(() => this.playBGM(bgm))
        .catch(error => this.warn('Could not resume audio session', error))
    } else {
      void this.ensureAudioSessionActive().catch(error => this.warn('Could not resume audio session', error))
    }
  }

  private ensureAudioSessionActive(): Promise<void> {
    if (this.activationPromise) return this.activationPromise
    const activation = setIsAudioActiveAsync(true)
    this.activationPromise = activation
    void activation.finally(() => {
      if (this.activationPromise === activation) this.activationPromise = null
    }).catch(() => undefined)
    return activation
  }

  private getOrCreatePlayer(event: AudioEvent): AudioPlayer {
    const cached = this.cachedPlayers.get(event)
    if (cached) return cached
    const player = createAudioPlayer(audioRegistry[event].source, {
      downloadFirst: false,
      keepAudioSessionActive: true,
      updateInterval: 250,
    })
    if (CACHED_EVENTS.has(event)) this.cachedPlayers.set(event, player)
    return player
  }

  private preloadFrequentlyUsedAudio(): void {
    for (const event of CACHED_EVENTS) {
      try { this.getOrCreatePlayer(event) }
      catch (error) { this.warn(`Could not preload ${event}`, error) }
    }
  }

  private hasBlockingPriority(priority: AudioPriority): boolean {
    return [...this.active.values()].some(entry => entry.priority === AudioPriority.CRITICAL && priority < AudioPriority.HIGH)
  }
  private suppressLowPriority(): void {
    for (const [event, entry] of this.active) if (entry.priority <= AudioPriority.NORMAL) this.stop(event, 80)
  }
  private stopAll(clearResume: boolean): void {
    for (const [event] of this.active) this.stop(event, 0)
    for (const timer of this.fadeTimers.values()) clearInterval(timer)
    this.fadeTimers.clear()
    if (clearResume) this.resumeBgm = null
  }
  private effectiveVolume(category: AudioCategory, baseVolume: number): number {
    const duck = category === AudioCategory.BGM ? this.duckFactor : 1
    return clampVolume(baseVolume * this.settings.master * this.settings.categories[category] * duck)
  }
  private updateSettings(settings: AudioSettings): void {
    this.settings = settings
    for (const entry of this.active.values()) entry.player.volume = this.effectiveVolume(audioRegistry[entry.event].category, entry.baseVolume)
    this.emitSettings()
    void saveAudioSettings(settings)
  }
  private emitSettings(): void { for (const listener of this.listeners) listener(this.getSettings()) }
  private fadeCategory(category: AudioCategory, ms: number): void {
    for (const [event] of this.active) if (audioRegistry[event].category === category) this.fadeTo(event, this.effectiveVolume(category, audioRegistry[event].volume), ms)
  }
  private fadeTo(event: AudioEvent, target: number, ms: number, done?: () => void): void {
    const entry = this.active.get(event)
    if (!entry) return
    const old = this.fadeTimers.get(event)
    if (old) clearInterval(old)
    const start = entry.player.volume
    const started = Date.now()
    const timer = setInterval(() => {
      const current = this.active.get(event)
      if (!current || current.player !== entry.player) { clearInterval(timer); return }
      const progress = Math.min(1, (Date.now() - started) / Math.max(1, ms))
      try { entry.player.volume = start + (target - start) * progress } catch { clearInterval(timer) }
      if (progress >= 1) { clearInterval(timer); this.fadeTimers.delete(event); done?.() }
    }, 40)
    this.fadeTimers.set(event, timer)
  }
  private release(event: AudioEvent, player: AudioPlayer): void {
    const entry = this.active.get(event)
    if (!entry || entry.player !== player) return
    const timer = this.fadeTimers.get(event)
    if (timer) clearInterval(timer)
    this.fadeTimers.delete(event)
    this.active.delete(event)
    if (entry.safetyTimer) clearTimeout(entry.safetyTimer)
    try {
      entry.cleanup?.()
      player.pause()
      if (this.cachedPlayers.get(event) === player) {
        void player.seekTo(0).catch(error => this.warn(`Could not rewind ${event}`, error))
      } else {
        player.remove()
      }
    } catch { /* already released */ }
    if (audioRegistry[event].duckBgm !== undefined && ![...this.active.keys()].some(activeEvent => audioRegistry[activeEvent].duckBgm !== undefined)) {
      this.restore(AudioCategory.BGM, 600)
    }
  }
  private releaseStaleCriticalAudio(now: number): void {
    for (const [event, entry] of this.active) {
      if (entry.priority === AudioPriority.CRITICAL && now - entry.startedAt > 20_000) this.release(event, entry.player)
    }
  }
  private pruneDedupe(now: number): void {
    const ttl = 30 * 60 * 1000
    for (const [key, timestamp] of this.dedupeKeys) if (now - timestamp > ttl) this.dedupeKeys.delete(key)
  }
  private warn(message: string, error: unknown): void {
    if (__DEV__) console.warn(`[audio] ${message}`, error)
  }
}

export const audio = new AudioManager()
