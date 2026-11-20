import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { AccessibilityInfo, Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native'
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import Svg, { Path, Rect } from 'react-native-svg'
import { getReduceMotion } from '../../utils/reduceMotion'
import { RISE_BUTTON_THEME, RiseButtonIdleAnimation, RiseButtonSize, RiseButtonVariant } from './riseButtonTheme'

type Props = { label: string; onPress: () => void; icon?: ReactNode; size?: RiseButtonSize; variant?: RiseButtonVariant; animation?: RiseButtonIdleAnimation; disabled?: boolean; multiline?: boolean; fitContent?: boolean; style?: StyleProp<ViewStyle>; labelStyle?: StyleProp<TextStyle>; accessibilityLabel?: string }
const BUBBLES = [{ left: '13%', size: 4, delay: 40, duration: 1780, drift: 7 }, { left: '31%', size: 6, delay: 730, duration: 2320, drift: -5 }, { left: '57%', size: 3, delay: 380, duration: 1560, drift: 6 }, { left: '78%', size: 5, delay: 1080, duration: 2080, drift: -7 }, { left: '91%', size: 3, delay: 1520, duration: 1860, drift: 4 }] as const
type MainButtonPalette = { fill: string; text: string; border: string }
const MAIN_BUTTON_PALETTES: readonly MainButtonPalette[] = [
  { fill: '#25272D', text: '#F1F0EA', border: '#D5D3CB' },
  { fill: '#111417', text: '#FFF0C7', border: '#E5C778' },
  { fill: '#10243B', text: '#E3F3FF', border: '#9DCAF0' },
  { fill: '#10291C', text: '#F0F5D7', border: '#B8D38B' },
]

function palette(variant: RiseButtonVariant, disabled: boolean, mainPalette: MainButtonPalette) {
  if (disabled || variant === 'disabled') return { border: RISE_BUTTON_THEME.colors.disabled, text: '#9C895C', fill: '#101721' }
  if (variant === 'secondary' || variant === 'back') return { border: RISE_BUTTON_THEME.colors.goldMuted, text: RISE_BUTTON_THEME.colors.gold, fill: '#081522' }
  if (variant === 'danger' || variant === 'dangerMuted') return { border: '#A36B54', text: '#D6A187', fill: '#1D1218' }
  return mainPalette
}

/** Shared native Rise action control. Tier D is its first production adopter. */
export function GameActionButton({ label, onPress, icon, size = 'medium', variant = 'primary', animation, disabled = false, multiline = false, fitContent = true, style, labelStyle, accessibilityLabel }: Props) {
  const [reduceMotion, setReduceMotion] = useState(false)
  const [mainPalette] = useState(() => MAIN_BUTTON_PALETTES[Math.floor(Math.random() * MAIN_BUTTON_PALETTES.length)])
  const [hasBubbles] = useState(() => Math.random() < .35)
  const locked = useRef(false)
  const scale = useSharedValue(1), glow = useSharedValue(0), shimmer = useSharedValue(-1)
  const isDisabled = disabled || variant === 'disabled'
  const tokens = RISE_BUTTON_THEME.sizes[size]
  const colors = useMemo(() => palette(variant, isDisabled, mainPalette), [variant, isDisabled, mainPalette])
  const idle = animation ?? (variant === 'primary' || variant === 'confirm' ? 'shimmer' : 'none')
  const showBubbles = hasBubbles && !isDisabled && !reduceMotion && (variant === 'primary' || variant === 'confirm' || variant === 'prestige')
  const automaticRewardIcon = /\b(?:WATCH|VERIFYING)\s+AD\b/i.test(label) ? <RewardAdIcon /> : /\b(?:CLAIM|COLLECT)/i.test(label) ? <RewardGiftIcon /> : undefined
  const buttonIcon = icon ?? automaticRewardIcon

  useEffect(() => { let active = true; const update = async () => { const [system, saved] = await Promise.all([AccessibilityInfo.isReduceMotionEnabled(), getReduceMotion()]); if (active) setReduceMotion(system || saved) }; void update(); const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', update); return () => { active = false; sub?.remove?.() } }, [])
  useEffect(() => { if (isDisabled || reduceMotion || idle === 'none') { shimmer.value = -1; return }; shimmer.value = withRepeat(withSequence(withDelay(650, withTiming(1, { duration: RISE_BUTTON_THEME.animation.shimmerTravel, easing: Easing.inOut(Easing.quad) })), withDelay(RISE_BUTTON_THEME.animation.shimmerCycle - RISE_BUTTON_THEME.animation.shimmerTravel, withTiming(-1, { duration: 0 }))), -1, false) }, [idle, isDisabled, reduceMotion, shimmer])
  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value, transform: [{ scale: 0.98 + glow.value * .04 }] }))
  const shimmerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shimmer.value * 190 }, { rotate: '18deg' }] }))
  const pressIn = useCallback(() => { if (!isDisabled) { scale.value = withTiming(reduceMotion ? .97 : .96, { duration: RISE_BUTTON_THEME.animation.pressIn }); glow.value = withTiming(1, { duration: RISE_BUTTON_THEME.animation.pressIn }) } }, [glow, isDisabled, reduceMotion, scale])
  const pressOut = useCallback(() => { if (!isDisabled) { scale.value = withTiming(1, { duration: RISE_BUTTON_THEME.animation.pressOut }); glow.value = withSequence(withTiming(.85, { duration: 55 }), withTiming(0, { duration: 160 })) } }, [glow, isDisabled, scale])
  const activate = useCallback(() => { if (isDisabled || locked.current) return; locked.current = true; void Haptics.impactAsync(variant === 'confirm' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => undefined); onPress(); setTimeout(() => { locked.current = false }, 240) }, [isDisabled, onPress, variant])
  return <Animated.View style={[styles.wrap, fitContent && styles.wrapFit, scaleStyle, style]}><Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled: isDisabled }} disabled={isDisabled} onPressIn={pressIn} onPressOut={pressOut} onPress={activate} style={[styles.button, { height: tokens.height, paddingHorizontal: tokens.paddingHorizontal, borderColor: colors.border, backgroundColor: colors.fill }, isDisabled && styles.disabled]}><Animated.View pointerEvents="none" style={[styles.glow, { borderColor: colors.border, shadowColor: colors.border }, glowStyle]} />{!isDisabled && !reduceMotion && idle !== 'none' ? <View pointerEvents="none" style={styles.clip}><Animated.View style={[styles.shimmer, shimmerStyle]}><LinearGradient colors={['transparent', 'rgba(255,233,157,.04)', 'rgba(255,248,211,.28)', 'rgba(255,211,89,.06)', 'transparent']} locations={[0, .25, .5, .72, 1]} start={{ x: 0, y: .5 }} end={{ x: 1, y: .5 }} style={StyleSheet.absoluteFill} /></Animated.View></View> : null}{showBubbles ? <View pointerEvents="none" style={styles.bubbleClip}>{BUBBLES.map((bubble, index) => <ButtonBubble key={index} {...bubble} />)}</View> : null}{buttonIcon ? <><View pointerEvents="none" style={[styles.icon, { width: tokens.iconSize + 7 }]}>{buttonIcon}</View><View pointerEvents="none" style={[styles.divider, { backgroundColor: colors.border }]} /></> : null}<Text numberOfLines={multiline ? 2 : 1} adjustsFontSizeToFit={!multiline} style={[styles.label, multiline && styles.multilineLabel, { color: colors.text, fontSize: tokens.fontSize }, labelStyle]}>{label}</Text></Pressable></Animated.View>
}

function RewardAdIcon() { return <Svg width={19} height={19} viewBox="0 0 24 24" accessibilityLabel="Watch ad"><Rect x="2.5" y="5" width="19" height="14" rx="2.2" fill="none" stroke="#FDE19A" strokeWidth="1.7"/><Path d="m10 9 5 3-5 3V9ZM5.5 5v14M18.5 5v14" fill="none" stroke="#FDE19A" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round"/></Svg> }
function RewardGiftIcon() { return <Svg width={19} height={19} viewBox="0 0 24 24" accessibilityLabel="Collect reward"><Rect x="3" y="9" width="18" height="11" rx="1.5" fill="none" stroke="#FDE19A" strokeWidth="1.7"/><Path d="M12 9v11M3 12.5h18M12 9H7.7C5.3 9 5.1 5.7 7.3 5.7c2.3 0 4.7 3.3 4.7 3.3Zm0 0h4.3c2.4 0 2.6-3.3.4-3.3C14.6 5.7 12 9 12 9Z" fill="none" stroke="#FDE19A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></Svg> }
function ButtonBubble({ left, size, delay, duration, drift }: (typeof BUBBLES)[number]) {
  const progress = useSharedValue(0)
  useEffect(() => { progress.value = withRepeat(withDelay(delay, withTiming(1, { duration, easing: Easing.linear })), -1, false); return () => cancelAnimation(progress) }, [delay, duration, progress])
  const bubbleStyle = useAnimatedStyle(() => ({ opacity: progress.value < .1 ? progress.value * 3.5 : 1 - progress.value, transform: [{ translateX: progress.value * drift }, { translateY: 22 - progress.value * 70 }, { scale: .7 + progress.value * .55 }] }))
  return <Animated.View style={[styles.bubble, { left, width: size, height: size, borderRadius: size / 2 }, bubbleStyle]} />
}

export function RiseGlyph({ children }: { children: string }) { return <Text style={styles.glyph}>{children}</Text> }
const styles = StyleSheet.create({ wrap: { width: '100%' }, wrapFit: { width: undefined, maxWidth: '100%', alignSelf: 'center' }, button: { overflow: 'hidden', borderWidth: RISE_BUTTON_THEME.borderWidth, borderRadius: RISE_BUTTON_THEME.radius, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: .55, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5 }, disabled: { opacity: .72 }, glow: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderWidth: 2, borderRadius: RISE_BUTTON_THEME.radius, shadowOpacity: .85, shadowRadius: 12, elevation: 8 }, clip: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden', borderRadius: RISE_BUTTON_THEME.radius }, shimmer: { position: 'absolute', top: -35, bottom: -35, width: 80 }, bubbleClip: { ...StyleSheet.absoluteFill, overflow: 'hidden', borderRadius: RISE_BUTTON_THEME.radius }, bubble: { position: 'absolute', bottom: -8, borderWidth: 1, borderColor: 'rgba(222,250,255,.82)', backgroundColor: 'rgba(124,218,246,.22)', shadowColor: '#B6F3FF', shadowOpacity: .75, shadowRadius: 4, elevation: 3 }, icon: { alignItems: 'center', justifyContent: 'center' }, divider: { width: 1, alignSelf: 'stretch', marginVertical: 11, marginRight: 12, opacity: .86 }, label: { flexShrink: 1, textAlign: 'center', fontFamily: 'Cinzel_700Bold', fontWeight: '900', letterSpacing: 1.15, textShadowColor: 'rgba(0,0,0,.7)', textShadowRadius: 3 }, multilineLabel: { lineHeight: 17, paddingHorizontal: 2 }, glyph: { color: RISE_BUTTON_THEME.colors.gold, fontSize: 25, fontWeight: '900', lineHeight: 27, textShadowColor: 'rgba(255,210,90,.45)', textShadowRadius: 5 } })
