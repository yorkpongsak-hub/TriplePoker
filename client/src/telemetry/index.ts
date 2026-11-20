import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { TelemetryQueue, type QueueConfig } from './queue'
import { ClientTelemetry } from './producers'

const environment = process.env.EXPO_PUBLIC_TELEMETRY_ENV
const config: QueueConfig = {
  enabled: process.env.EXPO_PUBLIC_TELEMETRY_ENABLED === 'true'
    && (environment === 'development' || environment === 'production')
    && (__DEV__ || environment === 'production'),
  environment: environment === 'production' ? 'production' : 'development',
  serverUrl: process.env.EXPO_PUBLIC_SERVER_URL ?? '',
  appVersion: Constants.expoConfig?.version ?? '0.0.0',
  platform: Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web',
}

// ไม่มี auto-start หรือ hook gameplay ใน 2A; ผู้เรียกใช้ enqueue แบบ fire-and-forget
export const telemetry = new TelemetryQueue(config, {
  storage: AsyncStorage, fetch: (url, init) => fetch(url, init),
  // โหลด native module ภายในงานคิวที่จับ exception แล้ว; binary เก่าต้องไม่ crash ที่ import
  uuid: () => (require('expo-crypto') as typeof import('expo-crypto')).randomUUID(),
})
export const launchTelemetry = new ClientTelemetry(telemetry)
export type { TelemetryInput } from './types'
