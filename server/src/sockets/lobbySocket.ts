/**
 * lobbySocket.ts
 * Socket.IO handler สำหรับ Lobby realtime — broadcast สถานะโต๊ะทุก Tier
 * The Sage Unicorn Studio Co., Ltd.
 *
 * Events:
 *   client -> server: "lobby:subscribe"   { tier: Tier }
 *   client -> server: "lobby:unsubscribe" { tier: Tier }
 *   server -> client: "lobby:tables"      { tier: Tier, tables: GameTable[] }   (snapshot ตอน subscribe)
 *   server -> client: "lobby:tableUpdate" { tier: Tier, table: GameTable }      (ทุกครั้งที่มีการเปลี่ยนแปลง)
 */
import { Server, Socket } from 'socket.io';
import { getOpenTablesByTier, GameTable, Tier } from '../game/tableRegistry';

const TIER_ROOM = (tier: Tier) => `lobby:${tier}`;

export function registerLobbySocket(io: Server, socket: Socket) {
  socket.on('lobby:subscribe', ({ tier }: { tier: Tier }) => {
    socket.join(TIER_ROOM(tier));
    socket.emit('lobby:tables', { tier, tables: getOpenTablesByTier(tier) });
  });

  socket.on('lobby:unsubscribe', ({ tier }: { tier: Tier }) => {
    socket.leave(TIER_ROOM(tier));
  });
}

// เรียกฟังก์ชันนี้จากทุกจุดที่ joinNextEmptySeat / setSeat / createTable ถูกเรียก
// เพื่อ broadcast สถานะใหม่ให้ทุกคนที่อยู่ใน lobby room ของ Tier นั้น
export function broadcastTableUpdate(io: Server, table: GameTable) {
  io.to(TIER_ROOM(table.tier)).emit('lobby:tableUpdate', { tier: table.tier, table });
}
