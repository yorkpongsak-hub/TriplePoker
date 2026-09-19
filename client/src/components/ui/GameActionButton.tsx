import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { AccessibilityInfo, Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native'
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import { getReduceMotion } from '../../utils/reduceMotion'
import { RISE_BUTTON_THEME, RiseButtonIdleAnimation, RiseButtonSize, RiseButtonVariant } from './riseButtonTheme'

type Props = { label: string; onPress: () => void; icon?: ReactNode; size?: RiseButtonSize; variant?: RiseButtonVariant; animation?: RiseButtonIdleAnimation; disabled?: boolean; multiline?: boolean; fitContent?: boolean; style?: StyleProp<ViewStyle>; labelStyle?: StyleProp<TextStyle>; accessibilityLabel?: string }

function palette(variant: RiseButtonVariant, disabled: boolean) {
  if (disabled || variant === 'disabled') return { border: RISE_BUTTON_THEME.colors.disabled, text: '#9C895C', fill: '#101721' }
  if (variant === 'secondary' || variant === 'back') return { border: RISE_BUTTON_THEME.colors.goldMuted, text: RISE_BUTTON_THEME.colors.gold, fill: '#081522' }
  if (variant === 'dangerMuted') return { border: '#A36B54', text: '#D6A187', fill: '#1D1218' }
  if (variant === 'prestige') return { border: RISE_BUTTON_THEME.colors.goldBright, text: RISE_BUTTON_THEME.colors.goldBright, fill: '#102033' }
  return { border: RISE_BUTTON_THEME.colors.gold, text: RISE_BUTTON_THEME.colors.gold, fill: RISE_BUTTON_THEME.colors.backgroundRaised }
}

/** Shared native Rise action control. Tier D is its first production adopter. */
export function GameActionButton({ label, onPress, icon, size = 'medium', variant = 'primary', animation, disabled = false, multiline = false, fitContent = true, style, labelStyle, accessibilityLabel }: Props) {
  const [reduceMotion, setReduceMotion] = useState(false)
  const locked = useRef(false)
  const scale = useSharedValue(1), glow = useSharedValue(0), shimmer = useSharedValue(-1)
  const isDisabled = disabled || variant === 'disabled'
  const tokens = RISE_BUTTON_THEME.sizes[size]
  const colors = useMemo(() => palette(variant, isDisabled), [variant, isDisabled])
  const idle = animation ?? (variant === 'primary' || variant === 'confirm' ? 'shimmer' : 'none')

  useEffect(() => { let active = true; const update = async () => { const [system, saved] = await Promise.all([AccessibilityInfo.isReduceMotionEnabled(), getReduceMotion()]); if (active) setReduceMotion(system || saved) }; void update(); const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', update); return () => { active = false; sub?.remove?.() } }, [])
  useEffect(() => { if (isDisabled || reduceMotion || idle === 'none') { shimmer.value = -1; return }; shimmer.value = withRepeat(withSequence(withDelay(650, withTiming(1, { duration: RISE_BUTTON_THEME.animation.shimmerTravel, easing: Easing.inOut(Easing.quad) })), withDelay(RISE_BUTTON_THEME.animation.shimmerCycle - RISE_BUTTON_THEME.animation.shimmerTravel, withTiming(-1, { duration: 0 }))), -1, false) }, [idle, isDisabled, reduceMotion, shimmer])
  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value, transform: [{ scale: 0.98 + glow.value * .04 }] }))
  const shimmerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shimmer.value * 190 }, { rotate: '18deg' }] }))
  const pressIn = useCallback(() => { if (!isDisabled) { scale.value = withTiming(reduceMotion ? .97 : .96, { duration: RISE_BUTTON_THEME.animation.pressIn }); glow.value = withTiming(1, { duration: RISE_BUTTON_THEME.animation.pressIn }) } }, [glow, isDisabled, reduceMotion, scale])
  const pressOut = useCallback(() => { if (!isDisabled) { scale.value = withTiming(1, { duration: RISE_BUTTON_THEME.animation.pressOut }); glow.value = withSequence(withTiming(.85, { duration: 55 }), withTiming(0, { duration: 160 })) } }, [glow, isDisabled, scale])
  const activate = useCallback(() => { if (isDisabled || locked.current) return; locked.current = true; void Haptics.impactAsync(variant === 'confirm' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => undefined); onPress(); setTimeout(() => { locked.current = false }, 240) }, [isDisabled, onPress, variant])
  return <Animated.View style={[styles.wrap, fitContent && styles.wrapFit, scaleStyle, style]}><Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled: isDisabled }} disabled={isDisabled} onPressIn={pressIn} onPressOut={pressOut} onPress={activate} style={[styles.button, { height: tokens.height, paddingHorizontal: tokens.paddingHorizontal, borderColor: colors.border, backgroundColor: colors.fill }, isDisabled && styles.disabled]}><Animated.View pointerEvents="none" style={[styles.glow, { borderColor: colors.border, shadowColor: colors.border }, glowStyle]} />{!isDisabled && !reduceMotion && idle !== 'none' ? <View pointerEvents="none" style={styles.clip}><Animated.View style={[styles.shimmer, shimmerStyle]}><LinearGradient colors={['transparent', 'rgba(255,233,157,.04)', 'rgba(255,248,211,.28)', 'rgba(255,211,89,.06)', 'transparent']} locations={[0, .25, .5, .72, 1]} start={{ x: 0, y: .5 }} end={{ x: 1, y: .5 }} style={StyleSheet.absoluteFill} /></Animated.View></View> : null}{icon ? <><View pointerEvents="none" style={[styles.icon, { width: tokens.iconSize + 7 }]}>{icon}</View><View pointerEvents="none" style={[styles.divider, { backgroundColor: colors.border }]} /></> : null}<Text numberOfLines={multiline ? 2 : 1} adjustsFontSizeToFit={!multiline} style={[styles.label, multiline && styles.multilineLabel, { color: colors.text, fontSize: tokens.fontSize }, labelStyle]}>{label}</Text></Pressable></Animated.View>
}

export function RiseGlyph({ children }: { children: string }) { return <Text style={styles.glyph}>{children}</Text> }
const styles = StyleSheet.create({ wrap: { width: '100%' }, wrapFit: { width: undefined, maxWidth: '100%', alignSelf: 'center' }, button: { overflow: 'hidden', borderWidth: RISE_BUTTON_THEME.borderWidth, borderRadius: RISE_BUTTON_THEME.radius, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: .55, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5 }, disabled: { opacity: .72 }, glow: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderWidth: 2, borderRadius: RISE_BUTTON_THEME.radius, shadowOpacity: .85, shadowRadius: 12, elevation: 8 }, clip: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden', borderRadius: RISE_BUTTON_THEME.radius }, shimmer: { position: 'absolute', top: -35, bottom: -35, width: 80 }, icon: { alignItems: 'center', justifyContent: 'center' }, divider: { width: 1, alignSelf: 'stretch', marginVertical: 11, marginRight: 12, opacity: .86 }, label: { flexShrink: 1, textAlign: 'center', fontFamily: 'Cinzel_700Bold', fontWeight: '900', letterSpacing: 1.15, textShadowColor: 'rgba(0,0,0,.7)', textShadowRadius: 3 }, multilineLabel: { lineHeight: 17, paddingHorizontal: 2 }, glyph: { color: RISE_BUTTON_THEME.colors.gold, fontSize: 25, fontWeight: '900', lineHeight: 27, textShadowColor: 'rgba(255,210,90,.45)', textShadowRadius: 5 } })
