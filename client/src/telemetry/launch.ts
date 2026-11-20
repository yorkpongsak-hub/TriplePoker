import type { ClientTelemetry, TrainingTrace } from './producers'
import type { TelemetryContext, Tutorial } from './types'

// bridge โหลดเฉพาะเมื่อเปิด flag; การขาด native module ต้องไม่รบกวนหน้าจอ/เกม
function call<T>(work: (producer: ClientTelemetry) => T): T | undefined {
  if (process.env.EXPO_PUBLIC_TELEMETRY_ENABLED !== 'true') return undefined
  // cast เป็น shape ตรงๆ แทน typeof import('./index') — กัน type ของ react-native หลุดเข้า server tsc (server tests import store.ts)
  try { return work((require('./index') as { launchTelemetry: ClientTelemetry }).launchTelemetry) } catch { return undefined }
}
export const launchTelemetry = {
  membershipStatus: (status: unknown) => call(p => p.membershipStatus(status)),
  active: () => call(p => p.active()), background: () => call(p => p.background()),
  route: (path: string) => call(p => p.route(path)),
  subscribeContext: (listener: (context: TelemetryContext) => void) => call(p => p.subscribeContext(listener)) ?? (() => {}),
  tutorialStart: (tutorial: Tutorial) => call(p => p.tutorialStart(tutorial)),
  tutorialStep: (tutorial: Tutorial, step: number) => call(p => p.tutorialStep(tutorial, step)),
  tutorialComplete: (tutorial: Tutorial) => call(p => p.tutorialComplete(tutorial)),
  trainingStart: (completed: number) => call(p => p.trainingStart(completed)),
  trainingEnd: (trace: TrainingTrace | undefined, score: number, opponentScore: number, sealWins: number) => call(p => p.trainingEnd(trace, score, opponentScore, sealWins)),
}
