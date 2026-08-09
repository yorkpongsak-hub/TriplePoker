import { SpectatorService } from './spectatorService'

let service: SpectatorService | undefined

export function attachSpectatorService(value: SpectatorService): void { service = value }

/** Game engines publish only explicit public DTOs through this bridge; private state never crosses it. */
export function publishSpectatorEvent(tableId: string, event: unknown): void {
  if (!service?.getBroadcastId(tableId)) return
  service.publish(tableId, event)
}

export function finishSpectatorBroadcast(tableId: string): void {
  if (!service?.getBroadcastId(tableId)) return
  service.finish(tableId)
}
