import React, { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import { Image } from 'expo-image'
import type { MonetizedBannerPlacement } from './MonetizedBannerSlot.native'
const FALLBACK=require('../../../assets/fx/vfx_flower_and_bee.webp')
export function MonetizedBannerSlot({placement}:{placement:MonetizedBannerPlacement}){useEffect(()=>{console.info(JSON.stringify({event:'monetized_banner',placement,stage:'fallback',detail:'native_ads_unsupported',at:new Date().toISOString()}))},[placement]);return <View pointerEvents="none" style={s.slot}><Image source={FALLBACK} style={s.artwork} contentFit="cover" autoplay/></View>}
const s=StyleSheet.create({slot:{height:72,width:'100%',overflow:'hidden',marginVertical:8},artwork:{width:'100%',height:'100%'}})
