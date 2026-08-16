import React, { ComponentProps, forwardRef } from 'react'
import {
  Button as NativeButton,
  Pressable as NativePressable,
  TouchableHighlight as NativeTouchableHighlight,
  TouchableOpacity as NativeTouchableOpacity,
  TouchableWithoutFeedback as NativeTouchableWithoutFeedback,
} from 'react-native'
import { Link as NativeLink } from 'expo-router'
import { audio } from '../../audio'

function withSound<T extends (...args: any[]) => any>(onPress: T | null | undefined): T | undefined {
  if (!onPress) return undefined
  return ((...args: Parameters<T>) => {
    const result = onPress(...args)
    audio.playUiFeedback()
    return result
  }) as T
}

export const TouchableOpacity = forwardRef<any, ComponentProps<typeof NativeTouchableOpacity>>(
  ({ onPress, ...props }, ref) => <NativeTouchableOpacity ref={ref} {...props} onPress={withSound(onPress)} />,
)
export const TouchableHighlight = forwardRef<any, ComponentProps<typeof NativeTouchableHighlight>>(
  ({ onPress, ...props }, ref) => <NativeTouchableHighlight ref={ref} {...props} onPress={withSound(onPress)} />,
)
export const TouchableWithoutFeedback = forwardRef<any, ComponentProps<typeof NativeTouchableWithoutFeedback>>(
  ({ onPress, ...props }, ref) => <NativeTouchableWithoutFeedback ref={ref} {...props} onPress={withSound(onPress)} />,
)
export const Pressable = forwardRef<any, ComponentProps<typeof NativePressable>>(
  ({ onPress, ...props }, ref) => <NativePressable ref={ref} {...props} onPress={withSound(onPress)} />,
)
export const Link = forwardRef<any, ComponentProps<typeof NativeLink>>(
  ({ onPress, ...props }, ref) => <NativeLink ref={ref} {...props} onPress={withSound(onPress)} />,
)
export function Button({ onPress, ...props }: ComponentProps<typeof NativeButton>) {
  return <NativeButton {...props} onPress={withSound(onPress)!} />
}

TouchableOpacity.displayName = 'SoundTouchableOpacity'
TouchableHighlight.displayName = 'SoundTouchableHighlight'
TouchableWithoutFeedback.displayName = 'SoundTouchableWithoutFeedback'
Pressable.displayName = 'SoundPressable'
Link.displayName = 'SoundLink'
