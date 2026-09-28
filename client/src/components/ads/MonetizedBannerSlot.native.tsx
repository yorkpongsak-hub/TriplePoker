import React, { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Image } from 'expo-image'
import { adProvider } from '../../ads/adProvider'
import { adMode, GOOGLE_ANDROID_TEST_AD_UNIT_IDS, productionBannerUnitId } from '../../ads/adConfig'
import { useAuthStore } from '../../store/authStore'

export type MonetizedBannerPlacement = 'lobby' | 'profile' | 'top10' | 'rank' | 'tier_d_top20'
const FALLBACK = require('../../../assets/fx/vfx_flower_and_bee.webp')
const LOAD_TIMEOUT_MS = 8_000
let googleAds: any
try { googleAds = require('react-native-google-mobile-ads') } catch { googleAds = undefined }

function telemetry(placement: MonetizedBannerPlacement, stage: 'request'|'load'|'impression'|'failure'|'fallback', detail?: string) {
  console.info(JSON.stringify({ event: 'monetized_banner', placement, stage, detail, at: new Date().toISOString() }))
}

export function MonetizedBannerSlot({ placement }: { placement: MonetizedBannerPlacement }) {
  const vipStatus = useAuthStore(s => s.profile?.vip_status)
  const isFree = vipStatus === 'none'
  const canRequest = isFree && !!googleAds && (adMode === 'google_test' || (adMode === 'production' && !!productionBannerUnitId))
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(!canRequest)
  const [initialized, setInitialized] = useState(false)
  const finished = useRef(false)

  useEffect(() => {
    finished.current = false
    setLoaded(false)
    setFailed(!canRequest)
    setInitialized(false)

    if (!canRequest) {
      const detail = isFree ? 'provider_or_unit_unavailable' : vipStatus ? 'vip_local_artwork' : 'membership_pending'
      telemetry(placement, 'fallback', detail)
      return
    }

    let timeout: ReturnType<typeof setTimeout> | undefined
    void adProvider.initialize().then(() => {
      if (finished.current) return
      setInitialized(true)
      telemetry(placement, 'request')
      timeout = setTimeout(() => {
        if (finished.current) return
        finished.current = true
        setFailed(true)
        telemetry(placement, 'failure', 'timeout')
        telemetry(placement, 'fallback', 'timeout')
      }, LOAD_TIMEOUT_MS)
    }).catch(error => {
      if (finished.current) return
      finished.current = true
      setFailed(true)
      telemetry(placement, 'failure', error instanceof Error ? error.message : 'initialize_failed')
      telemetry(placement, 'fallback', 'initialize_failed')
    })

    return () => {
      finished.current = true
      if (timeout) clearTimeout(timeout)
    }
  }, [canRequest, isFree, placement, vipStatus])

  const unitId = adMode === 'google_test' ? GOOGLE_ANDROID_TEST_AD_UNIT_IDS.banner : productionBannerUnitId
  const BannerAd = googleAds?.BannerAd

  return (
    <View style={s.slot} accessibilityLabel="Sponsored banner">
      {(!loaded || failed) && <Image pointerEvents="none" source={FALLBACK} style={s.artwork} contentFit="cover" autoplay />}
      {initialized && !failed && BannerAd && unitId ? (
        <View style={[s.ad, !loaded && s.hidden]}>
          <BannerAd
            unitId={unitId}
            size={googleAds.BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
            requestOptions={{ requestNonPersonalizedAdsOnly: true }}
            onAdLoaded={() => {
              if (finished.current) return
              finished.current = true
              setLoaded(true)
              telemetry(placement, 'load')
            }}
            onAdImpression={() => telemetry(placement, 'impression')}
            onAdFailedToLoad={(error: unknown) => {
              if (finished.current) return
              finished.current = true
              setFailed(true)
              telemetry(placement, 'failure', String(error))
              telemetry(placement, 'fallback', 'load_error')
            }}
          />
        </View>
      ) : null}
    </View>
  )
}

const s = StyleSheet.create({
  slot: { height: 72, width: '100%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginVertical: 8 },
  artwork: { position: 'absolute', inset: 0, width: '100%', height: '100%' },
  ad: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  hidden: { opacity: 0 },
})
