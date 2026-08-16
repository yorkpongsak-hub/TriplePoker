import { AudioSource } from 'expo-audio'
import { AudioCategory, AudioEvent, AudioPriority } from './audioEvents'

export type AudioDefinition = {
  source: AudioSource
  category: AudioCategory
  priority: AudioPriority
  volume: number
  cooldownMs?: number
  loop?: boolean
  fadeInMs?: number
  fadeOutMs?: number
  duckBgm?: number
}

const uiConfirm = require('../../assets/audio/sfx/ui/button_confirm.mp3')
const cardArrange1 = require('../../assets/audio/commons/sfx_card_arrange1.mp3')
const cardArrange2 = require('../../assets/audio/commons/sfx_card_arrange2.mp3')
const raiseBid = require('../../assets/audio/sfx/gameplay/raise_bid.mp3')
const arrangeComplete = require('../../assets/audio/sfx/gameplay/arrange_complete.mp3')
const arrangeCorrect = require('../../assets/audio/sfx/gameplay/arrange_correct.mp3')
const cardReveal = require('../../assets/audio/commons/sfx_card_reveal.mp3')
const myTurn = require('../../assets/audio/sfx/gameplay/my_turn.mp3')
const timerWarning = require('../../assets/audio/sfx/timer/timer_warning.mp3')
const timerCritical = require('../../assets/audio/sfx/timer/timer_critical.mp3')
const clockTicking = require('../../assets/audio/sfx/timer/clock_ticking.mp3')
const timerLong = require('../../assets/audio/sfx/timer/timer_long.mp3')
const matchWin = require('../../assets/audio/sfx/result/sfx_match_win.mp3')
const tripleSweepCongratulations = require('../../assets/audio/sfx/result/sfx_congratulation.mp3')
const tierUnlock = require('../../assets/audio/sfx/result/tier_unlock.mp3')
const rareReaction = require('../../assets/audio/sfx/result/rare_reaction.mp3')
const bossThunder = require('../../assets/audio/sfx/boss/boss_thunder.mp3')
const bossAmbience = require('../../assets/audio/sfx/boss/boss_ambience.mp3')
const lobbyBgm = require('../../assets/audio/bgm/lobby_bgm.mp3')
const profileBgm = require('../../assets/audio/bgm/bgm_cool_profile.mp3')
const elitesBgm = require('../../assets/audio/bgm/bgm_top_elites.mp3')
const shopBgm = require('../../assets/audio/bgm/bgm_coindrop.mp3')
const perfectVictoryBgm = require('../../assets/audio/bgm/bgm_perfect_victory.mp3')
const storySad = require('../../assets/audio/story/story_sad.mp3')
const storyMemory = require('../../assets/audio/story/story_memory_box.mp3')
const storyVictory = require('../../assets/audio/story/story_victory.mp3')
const ante = require('../../assets/audio/commons/sfx_ante.mp3')
const auctionBidTick = require('../../assets/audio/commons/sfx_auction_bid_tick.wav')
const autoSort = require('../../assets/audio/commons/sfx_autosort_button.mp3')
const cardShuffle = require('../../assets/audio/commons/sfx_card_shuffle.mp3')
const countdownWarningBell = require('../../assets/audio/commons/sfx_countdown_warning_bell.wav')
const pokerChip = require('../../assets/audio/commons/sfx_poker_chip.mp3')
const readyButton = require('../../assets/audio/commons/sfx_ready_button.mp3')

const def = (source: AudioSource, category: AudioCategory, priority: AudioPriority, volume: number, extra: Partial<AudioDefinition> = {}): AudioDefinition =>
  ({ source, category, priority, volume, ...extra })

export const audioRegistry: Record<AudioEvent, AudioDefinition> = {
  [AudioEvent.BUTTON_CONFIRM]: def(uiConfirm, AudioCategory.UI, AudioPriority.LOW, .55, { cooldownMs: 80 }),
  [AudioEvent.CALL]: def(uiConfirm, AudioCategory.UI, AudioPriority.NORMAL, .55, { cooldownMs: 80 }),
  [AudioEvent.ACTION_CONFIRM]: def(uiConfirm, AudioCategory.UI, AudioPriority.LOW, .55, { cooldownMs: 80 }),
  [AudioEvent.CARD_SELECT]: def(cardArrange1, AudioCategory.CARD, AudioPriority.LOW, .45, { cooldownMs: 50 }),
  [AudioEvent.CARD_DESELECT]: def(cardArrange1, AudioCategory.CARD, AudioPriority.LOW, .45, { cooldownMs: 50 }),
  [AudioEvent.CARD_MOVE]: def(cardArrange2, AudioCategory.CARD, AudioPriority.LOW, .48, { cooldownMs: 50 }),
  [AudioEvent.PILE_SELECT]: def(cardArrange1, AudioCategory.CARD, AudioPriority.LOW, .45, { cooldownMs: 50 }),
  [AudioEvent.RAISE]: def(raiseBid, AudioCategory.GAMEPLAY, AudioPriority.NORMAL, .60),
  [AudioEvent.AUCTION_BID]: def(auctionBidTick, AudioCategory.GAMEPLAY, AudioPriority.NORMAL, .55, { cooldownMs: 80 }),
  [AudioEvent.TOKEN_COMMIT]: def(raiseBid, AudioCategory.GAMEPLAY, AudioPriority.NORMAL, .60),
  [AudioEvent.TOKEN_REWARD]: def(pokerChip, AudioCategory.RESULT, AudioPriority.NORMAL, .58, { cooldownMs: 250 }),
  [AudioEvent.ANTE]: def(ante, AudioCategory.GAMEPLAY, AudioPriority.NORMAL, .55, { cooldownMs: 250 }),
  [AudioEvent.AUTO_SORT]: def(autoSort, AudioCategory.UI, AudioPriority.LOW, .50, { cooldownMs: 150 }),
  [AudioEvent.CARD_SHUFFLE]: def(cardShuffle, AudioCategory.CARD, AudioPriority.NORMAL, .50, { cooldownMs: 500 }),
  [AudioEvent.READY_CONFIRM]: def(readyButton, AudioCategory.UI, AudioPriority.NORMAL, .55, { cooldownMs: 150 }),
  [AudioEvent.ARRANGE_COMPLETE]: def(arrangeComplete, AudioCategory.GAMEPLAY, AudioPriority.NORMAL, .60),
  [AudioEvent.AUCTION_ACCEPTED]: def(arrangeComplete, AudioCategory.GAMEPLAY, AudioPriority.NORMAL, .60),
  [AudioEvent.ACTION_COMPLETED]: def(arrangeComplete, AudioCategory.GAMEPLAY, AudioPriority.NORMAL, .60),
  [AudioEvent.ARRANGE_VALID]: def(arrangeCorrect, AudioCategory.GAMEPLAY, AudioPriority.NORMAL, .55, { cooldownMs: 300 }),
  [AudioEvent.VALIDATION_SUCCESS]: def(arrangeCorrect, AudioCategory.GAMEPLAY, AudioPriority.NORMAL, .55, { cooldownMs: 300 }),
  [AudioEvent.CARD_REVEAL]: def(cardReveal, AudioCategory.CARD, AudioPriority.NORMAL, .55, { cooldownMs: 120 }),
  [AudioEvent.MEMORY_PAGE_CHANGE]: def(cardReveal, AudioCategory.CARD, AudioPriority.NORMAL, .55, { cooldownMs: 120 }),
  [AudioEvent.PLAYER_TURN]: def(myTurn, AudioCategory.GAMEPLAY, AudioPriority.NORMAL, .65, { cooldownMs: 1000 }),
  [AudioEvent.TIMER_WARNING]: def(countdownWarningBell, AudioCategory.TIMER, AudioPriority.HIGH, .50, { fadeOutMs: 180 }),
  [AudioEvent.TIMER_CRITICAL]: def(timerCritical, AudioCategory.TIMER, AudioPriority.HIGH, .60, { fadeOutMs: 150 }),
  [AudioEvent.TIMER_PRESSURE]: def(clockTicking, AudioCategory.TIMER, AudioPriority.HIGH, .55, { loop: true, fadeOutMs: 180 }),
  [AudioEvent.TIMER_LONG]: def(timerLong, AudioCategory.TIMER, AudioPriority.HIGH, .45, { loop: true, fadeOutMs: 200 }),
  [AudioEvent.MATCH_WIN]: def(matchWin, AudioCategory.RESULT, AudioPriority.VERY_HIGH, .80, { duckBgm: .35 }),
  [AudioEvent.TRIPLE_SWEEP_CELEBRATION]: def(tripleSweepCongratulations, AudioCategory.RESULT, AudioPriority.VERY_HIGH, .72, { cooldownMs: 2500, duckBgm: .30 }),
  [AudioEvent.TIER_UNLOCK]: def(tierUnlock, AudioCategory.RESULT, AudioPriority.VERY_HIGH, .80, { duckBgm: .25 }),
  [AudioEvent.BOSS_REVEAL]: def(bossThunder, AudioCategory.BOSS, AudioPriority.CRITICAL, .90, { duckBgm: .25 }),
  [AudioEvent.MONARCH_REVEAL]: def(bossThunder, AudioCategory.BOSS, AudioPriority.CRITICAL, .68, { duckBgm: .3 }),
  [AudioEvent.SOREN_REVEAL]: def(bossThunder, AudioCategory.BOSS, AudioPriority.CRITICAL, .77, { duckBgm: .25 }),
  [AudioEvent.CAELUM_REVEAL]: def(bossThunder, AudioCategory.BOSS, AudioPriority.CRITICAL, .90, { duckBgm: 0 }),
  [AudioEvent.BOSS_AMBIENCE]: def(bossAmbience, AudioCategory.BOSS, AudioPriority.HIGH, .40, { loop: true, fadeInMs: 800, fadeOutMs: 1000 }),
  [AudioEvent.MEMORY_FRAGMENT]: def(storyMemory, AudioCategory.STORY, AudioPriority.HIGH, .35, { fadeInMs: 1000, fadeOutMs: 1500 }),
  [AudioEvent.STORY_SAD]: def(storySad, AudioCategory.STORY, AudioPriority.HIGH, .35, { fadeInMs: 1000, fadeOutMs: 1500, duckBgm: .3 }),
  [AudioEvent.STORY_VICTORY]: def(storyVictory, AudioCategory.STORY, AudioPriority.HIGH, .38, { fadeInMs: 1000, fadeOutMs: 1500, duckBgm: .3 }),
  [AudioEvent.PERFECT_VICTORY_BGM]: def(perfectVictoryBgm, AudioCategory.BGM, AudioPriority.LOW, .24, { loop: true, fadeInMs: 1200, fadeOutMs: 800 }),
  [AudioEvent.PLAY_STREAK_BGM]: def(lobbyBgm, AudioCategory.BGM, AudioPriority.LOW, .18, { loop: true, fadeInMs: 1000, fadeOutMs: 600 }),
  [AudioEvent.LOBBY_BGM]: def(lobbyBgm, AudioCategory.BGM, AudioPriority.LOW, .30, { loop: true, fadeInMs: 800, fadeOutMs: 500 }),
  [AudioEvent.PROFILE_BGM]: def(profileBgm, AudioCategory.BGM, AudioPriority.LOW, .25, { loop: true, fadeInMs: 800, fadeOutMs: 500 }),
  [AudioEvent.ELITES_BGM]: def(elitesBgm, AudioCategory.BGM, AudioPriority.LOW, .27, { loop: true, fadeInMs: 800, fadeOutMs: 500 }),
  [AudioEvent.SHOP_BGM]: def(shopBgm, AudioCategory.BGM, AudioPriority.LOW, .24, { loop: true, fadeInMs: 800, fadeOutMs: 500 }),
  [AudioEvent.RARE_REACTION]: def(rareReaction, AudioCategory.RESULT, AudioPriority.VERY_HIGH, .75, { cooldownMs: 5000, duckBgm: .35 }),
}

export const PRELOAD_AUDIO_EVENTS = [
  AudioEvent.CARD_SELECT, AudioEvent.BUTTON_CONFIRM, AudioEvent.CALL,
  AudioEvent.RAISE, AudioEvent.CARD_REVEAL, AudioEvent.PLAYER_TURN,
  AudioEvent.CARD_MOVE, AudioEvent.AUCTION_BID, AudioEvent.AUTO_SORT,
  AudioEvent.CARD_SHUFFLE, AudioEvent.READY_CONFIRM, AudioEvent.ANTE,
] as const
