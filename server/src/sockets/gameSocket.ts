// ============================================================
// TriplePoker — gameSocket.ts
// Socket.IO event registry — ทุก real-time event ผ่านไฟล์นี้
// พาธ: triplepoker-backend/src/sockets/gameSocket.ts
// The Sage Unicorn Studio Co., Ltd.
// Founder & Chief Architect: Assistant Professor Pongnathee Maneekul
// Updated: May 2026 — v1.1 เพิ่ม Progressive Mechanics tier gate
// ============================================================

import { Server, Socket } from "socket.io";
import { dealCards, validateDeal } from "../game/cardEngine";
import { startMatch, submitArrangement, submitArrangementRound2, resolveContinue, submitAuctionBid, submitDiscard, submitGrandFinaleAction, settleAndEndSoloMatch } from "../game/gameLoop";
import { startMultiplayerMatch, submitMultiArrangement, markPlayerAFK, resendRoundStartToPlayer, settleAndEndMultiMatch } from "../game/gameLoop";
import { getMatchState, getMultiMatchState, settleEscrow } from "../game/gameLoop";
import {
  startHighNobleMultiMatch, submitHNArrangement, submitHNAuctionBid, submitHNArrangementRound2,
  submitHNDiscard, submitHNGrandFinaleAction, replaceHNPlayerWithAI, resendHNRoundStartToPlayer,
  getHNMatchState,
} from "../game/highNobleMultiEngine";
import { getTierFromToken } from "../config/gameConfig";
import { registerLobbySocket } from "./lobbySocket";
import { createTableWithId, setSeat, deleteTable } from "../game/tableRegistry";
import { createAdeptTable, joinAdeptTable, getTimedOutAdeptTables } from "../game/tableRegistry";
import {
  findOrCreateRoomAndJoin, createPrivateRoom, joinRoomLocked, getRoom as getRoomFromRegistry,
  fillRemainingWithAI, getTimedOutRooms, markInProgress, finalizeBossSeat,
  getRoomsNeedingTimeoutChoice, markAwaitingTimeoutChoice, extendRoomWait,
  getExpiredExtendedRooms, deleteRoomCompletely, fillWithMinion, humanCount,
  markAwaitingDeadlockChoice, getAdeptWaitExpiredRoomIds, resolveAdeptWaitExpiry,
  getHighNobleWaitExpiredRoomIds, resolveHighNobleWaitExpiry,
  type Tier as RoomTier, type GameRoom,
} from "../game/roomRegistry";
import { broadcastTableUpdate } from "./lobbySocket";

// แปลง card key string (เช่น "10s", "jh") → Card object — ใช้ร่วมกันทุก handler ที่รับไพ่จาก client
function toCards(keys: string[]) {
  return keys.map(k => {
    const suitMap: Record<string, string> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
    const rankMap: Record<string, number> = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'j':11,'q':12,'k':13,'a':14 };
    const suit = suitMap[k[k.length - 1]] ?? 'spades';
    const rank = k.slice(0, -1).toUpperCase();
    const value = rankMap[k.slice(0, -1).toLowerCase()] ?? 0;
    return { suit, rank, value } as any;
  });
}

// ─── Multiplayer: track socket -> {userId, roomId} สำหรับ disconnect handling ───
const socketUserMap = new Map<string, { userId: string; roomId: string; tier: string }>();

// TEMP DEBUG (2026-07-24, Symptom A investigation — ลบออกทีหลังหาสาเหตุ race เจอแล้ว): log ทุกจุดที่
// socketUserMap ถูก set/clear พร้อม Date.now() ให้ correlate กับ [DISCONNECT]/[ESCROW] logs ได้ว่า
// socketUserMap.set() ของ human แต่ละคน "เสร็จก่อนหรือหลัง" clearMatchmakingSocketTracking ที่ trigger
// จาก human อีกคน (ทฤษฎี race ที่สงสัยหลัง Step 2 ตัด 15s buffer ออก)
function trackMatchmakingSocket(socketId: string, info: { userId: string; roomId: string; tier: string }): void {
  console.log('[DEBUG_SOCKETMAP] SET', Date.now(), 'socket=', socketId, 'userId=', info.userId, 'roomId=', info.roomId, 'tier=', info.tier);
  socketUserMap.set(socketId, info);
}

// Bug (2026-07-23): room_auto_match/room_join_private ผูก socketUserMap ให้ "matchmaking socket" ตั้งแต่
// ตอน join ห้อง (ยังไม่ใช่ socket ของ game screen จริง) — พอ finalizeAndStartRoom เริ่มแมตช์แล้ว emit
// room_ready, client (lobby.tsx) จะ disconnect socket ตัวนี้ทันทีก่อน navigate ไปหน้าเกม ทำให้ disconnect
// handler ด้านล่างเข้าใจผิดว่า human หลุดกลางเกม → markPlayerAFK ทันที (ไม่รอ 60s) → auto-submit ทั้ง 2
// คนพร้อมกันพอดี → resolveMultiShowdown ยิงก่อน game screen (socket ใหม่ที่ยิง game_join) ทันได้เชื่อมด้วย
// ซ้ำ — ต้องล้าง entry ของ matchmaking socket ทิ้งก่อน emit room_ready เสมอ ปล่อยให้ game_join (จาก socket
// ใหม่จริง) เป็นคนผูก socketUserMap ใหม่แทนตอนต่อเข้าห้องเกมจริง
function clearMatchmakingSocketTracking(roomId: string): void {
  console.log('[DEBUG_SOCKETMAP] CLEAR start', Date.now(), 'roomId=', roomId);
  for (const [socketId, info] of socketUserMap) {
    if (info.roomId === roomId) {
      console.log('[DEBUG_SOCKETMAP] CLEAR delete', Date.now(), 'socket=', socketId, 'userId=', info.userId, 'roomId=', roomId);
      socketUserMap.delete(socketId);
    }
  }
}

// ห้องเต็มแล้ว → finalize (สุ่ม Boss จริงถ้า High Noble private) + emit room_ready + เริ่มเกม
// ใช้ร่วมกัน 3 จุด: room_auto_match, room_join_private, Adept/HighNoble wait-expiry AI-fill
//
// A2 (Bug A fix, 2026-07-17): Adept ต้องหัก escrow ให้ครบทุกคน "ก่อน" broadcast room_ready เสมอ —
// เดิม room_ready ยิงก่อน escrow loop ใน startMultiplayerMatch ทำให้ทุกคน navigate เข้าเกมไปแล้ว
// ก่อนรู้ว่า escrow ใครคนหนึ่งล้มเหลว (เช่น ACTIVE_MATCH_EXISTS จากห้องก่อนหน้าที่ยังไม่ settle) — พอ
// ล้มเหลวจริงจะไม่มีใครเห็น error เลยเพราะ socket lobby เดิมถูก disconnect ไปแล้วตอน navigate
//
// LobbyMatchmaking_Spec_v1_1: HighNoble public room ล็อค Boss/Monarch ไปแล้วตอน Human คนแรก join (ดู
// roomRegistry.joinRoom()) — ห้าม finalizeBossSeat() ซ้ำตรงนี้ เพราะจะ re-roll ทับผลที่ล็อกไว้แล้ว
// (pity ก็จะผูกกับคนละคนด้วย เพราะ finalizeBossSeat ใช้ human ทั้ง 3 คน ไม่ใช่แค่คนแรก) — เรียกเฉพาะ
// private room เท่านั้น (ยังใช้ placeholder ตอนสร้างห้อง แล้วมา roll จริงตรงนี้เหมือนเดิมทุกอย่าง)
async function finalizeAndStartRoom(io: Server, room: GameRoom): Promise<void> {
  const finalRoom = (room.tier === 'highNoble' && room.isPrivate) ? await finalizeBossSeat(room) : room;
  await markInProgress(finalRoom.roomId);

  if (finalRoom.tier === 'adept') {
    const result = await startMultiplayerMatch(io, finalRoom.roomId, finalRoom.seats, 'adept');
    if (!result.ok) {
      // room_ready ไม่เคยถูก broadcast เลย — client ทุกคนยังอยู่ที่ lobby socket เดิม ได้ยิน room_error
      // แน่นอน (handler เดิมของ lobby.tsx อยู่แล้ว ไม่ต้องเพิ่ม client listener ใหม่)
      io.to(finalRoom.roomId).emit("room_error", { message: result.reason ?? "Could not start the match. Please try again." });
      await deleteRoomCompletely(finalRoom.roomId); // กันห้องค้างสถานะ in_progress ทั้งที่ไม่มี match จริง
      return;
    }
    clearMatchmakingSocketTracking(finalRoom.roomId);
    io.to(finalRoom.roomId).emit("room_ready", { roomId: finalRoom.roomId, seats: finalRoom.seats });
  } else if (finalRoom.tier === 'highNoble') {
    clearMatchmakingSocketTracking(finalRoom.roomId);
    io.to(finalRoom.roomId).emit("room_ready", { roomId: finalRoom.roomId, seats: finalRoom.seats });
    await startHighNobleMultiMatch(io, finalRoom.roomId, finalRoom.seats);
  }
}

// ============================================================
// Main Socket Handler — register ที่ server/index.ts
// ============================================================

export function registerGameSocket(io: Server): void {

  // Patch 11: เช็คโต๊ะ Adept ที่หมดเวลา 3 นาทียังไม่ครบ Human ทุก 10 วิ
  setInterval(() => {
    const timedOut = getTimedOutAdeptTables();
    timedOut.forEach((t) => {
      io.to(t.tableId).emit("adept_table_timeout", {
        tableId: t.tableId,
        message: "หาผู้เล่นไม่ครบภายในเวลา กรุณาออกจากโต๊ะเพื่อรอคิวใหม่ หรือเล่น Tier ที่ต่ำกว่า",
      });
      deleteTable(t.tableId);
    });
  }, 10_000);

  // Room Registry (ใหม่): เช็คห้องที่หมดเวลา → AI-fill ที่นั่งที่เหลือ ทุก 10 วิ
  // หมายเหตุ: Adept และ High Noble ไม่อยู่ในลูปนี้แล้ว — ใช้ waiting timeout dialog flow แยกด้านล่างแทน (§4.4/§6.1)
  setInterval(async () => {
    const tiers: RoomTier[] = ['mastermind'];
    for (const tier of tiers) {
      const timedOut = await getTimedOutRooms(tier);
      for (const room of timedOut) {
        const filled = await fillRemainingWithAI(room.roomId);
        if (filled) {
          io.to(room.roomId).emit("room_ai_filled", {
            roomId: room.roomId,
            seats: filled.seats,
            message: "หา Human ไม่ครบภายในเวลา — เติม AI ให้แทน",
          });
          // Patch Multiplayer: ต้องเริ่มเกมจริงหลัง AI-fill ด้วย (เดิมลืม — ห้องค้าง 'full' เฉยๆ ไม่เริ่มเกม)
          await markInProgress(room.roomId);
        }
      }
    }
  }, 10_000);

  // Waiting Timeout Dialog (LobbyMatchmaking_Spec_v1_0 §4.4/§6.1) — เดิม High Noble เท่านั้นทุก 10 วิ
  // ตอนนี้ dialogTiers ว่างเปล่าถาวรแล้ว: ทั้ง Adept และ HighNoble ย้ายไปใช้ 2-stage wait timer ใหม่
  // (LobbyMatchmaking_Spec_v1_1) แทนหมดแล้ว — เก็บ loop/ฟังก์ชันไว้เฉยๆ ไม่ลบ (dead code ที่ปลอดภัย
  // ไม่มี tier ไหนเรียกใช้อีก, private room ก็ไม่เคยเข้า openSetKey อยู่แล้วเลยไม่เคยโดน loop นี้ตั้งแต่
  // แรก) — งดปิดถาวร ณ ตอนนี้เพื่อไม่ให้ diff Step 3 บวมเกินจำเป็น รอตัดสินใจเก็บกวาดจริงทีหลัง (ดู
  // client lobby.tsx room_wait_timeout_choice/room_wait_extended/room_timeout_choice handler ที่พังคู่กัน)
  //   รอบแรก (3 นาที) หมด → ถาม dialog "Wait 2 More Minutes" / "Delete Table" (เฉพาะ Host)
  //   รอบขยาย (2 นาที) หมด:
  //     Human >=2: Deadlock dialog "Start Now (Fill 1 Minion AI)"/"Delete Table" (Host เท่านั้น, §6.1)
  //     Human =1: ลบโต๊ะทันที
  //
  // ⚠️ สำคัญ (ไม่ใช่แค่ cleanup): ต้องเอา 'highNoble' ออกจาก array นี้จริงๆ (ไม่ใช่แค่ปรับ comment) —
  // ถ้าปล่อยไว้ loop นี้จะยังสแกน openSetKey('highNoble') ห้องเดียวกับ setInterval ใหม่ด้านล่าง (ทุก
  // 3 วิ) พร้อมกัน ชนกันได้ (เช่น mark timeoutStage='awaiting_choice' + emit dialog ทับ waitStage ใหม่
  // ทั้งที่ผู้เล่นไม่เห็น dialog UI แบบเดิมแล้วเพราะ client ไม่ฟัง event นี้อีกต่อไปหลัง Step 4)
  setInterval(async () => {
    const dialogTiers: RoomTier[] = [];
    for (const tier of dialogTiers) {
      const needChoice = await getRoomsNeedingTimeoutChoice(tier);
      for (const room of needChoice) {
        await markAwaitingTimeoutChoice(room.roomId);
        io.to(room.roomId).emit('room_wait_timeout_choice', {
          roomId: room.roomId, stage: 'first', hostUserId: room.hostUserId,
        });
      }

      const expired = await getExpiredExtendedRooms(tier);
      for (const room of expired) {
        if (tier === 'highNoble' && humanCount(room) >= 2) {
          await markAwaitingDeadlockChoice(room.roomId);
          io.to(room.roomId).emit('room_wait_timeout_choice', {
            roomId: room.roomId, stage: 'deadlock', hostUserId: room.hostUserId, humanCount: humanCount(room),
          });
          continue;
        }
        io.to(room.roomId).emit('room_wait_timeout_expired', {
          roomId: room.roomId,
          message: 'Waiting too long — table has been removed.',
        });
        await deleteRoomCompletely(room.roomId);
      }
    }
  }, 10_000);

  // Adept Dynamic Capacity (LobbyMatchmaking_Spec_v1_2) — เฉพาะโต๊ะ public (auto-match) เท่านั้น
  // (private ไม่เคยอยู่ใน openSetKey เลย ไม่โดนกระทบ ยังคงพฤติกรรมเดิม 2H+2AI ตายตัวใน joinRoom())
  // v1.2: ล็อคตายตัว 2H+2AI เท่านั้น — humanCount===2 เติม Companion Bot ตัวที่ 2 + mark 'full' ทันทีใน
  // joinRoom() เอง (ดู finalizeAndStartRoom ที่ถูกเรียกจาก room_auto_match handler ตรงๆ ทันทีที่คนที่ 2
  // join ไม่ต้องรอ loop นี้อีกแล้ว) เหลือหน้าที่เดียวของ loop นี้คือปิดโต๊ะที่ค้างแค่ 1 Human เกิน
  // secondHumanWaitMs (2 นาที) — ไม่มี stage สั้น 15 วิให้ต้องรอทันอีกต่อไป โพล 10 วิเหมือน loop อื่นพอ
  setInterval(async () => {
    const roomIds = await getAdeptWaitExpiredRoomIds();
    for (const roomId of roomIds) {
      try {
        const result = await resolveAdeptWaitExpiry(roomId);
        if (result.action === 'closed') {
          // Human>=2 บังคับ — ไม่ครบภายใน secondHumanWaitMs → ปิดโต๊ะ ไม่มี refund (escrow ยังไม่เคยหักตอน 'waiting')
          io.to(roomId).emit('room_closed_insufficient_players', {
            roomId, tier: 'adept',
            message: 'Not enough players — this tier requires at least 2 human players.',
          });
        }
        // 'noop' — มี join แทรกเข้ามาระหว่าง scan กับตอนนี้พอดี (resolveAdeptWaitExpiry เช็คสดแล้วเจอว่าไม่หมดเวลาจริง) ไม่ต้องทำอะไร
      } catch (err) {
        console.error('[ADEPT_WAIT] failed for room', roomId, err);
      }
    }
  }, 10_000);

  // HighNoble Dynamic Capacity (LobbyMatchmaking_Spec_v1_1) — เหมือน Adept ทุกอย่าง (ดู loop ด้านบน)
  // ต่างแค่ AI-fill ใช้ fillWithMinion() แทน secondAdeptBotSeat() (ดู resolveHighNobleWaitExpiry) —
  // Boss/Monarch ถูกล็อคไปแล้วตอน Human คนแรก join (ดู roomRegistry.joinRoom()) ไม่ re-roll ที่นี่
  setInterval(async () => {
    const roomIds = await getHighNobleWaitExpiredRoomIds();
    for (const roomId of roomIds) {
      try {
        const result = await resolveHighNobleWaitExpiry(roomId);
        if (result.action === 'closed') {
          io.to(roomId).emit('room_closed_insufficient_players', {
            roomId, tier: 'highNoble',
            message: 'Not enough players — this tier requires at least 2 human players.',
          });
        } else if (result.action === 'ai_filled' && result.room.status === 'full') {
          await finalizeAndStartRoom(io, result.room);
        }
        // 'noop' — มี join แทรกเข้ามาระหว่าง scan กับตอนนี้พอดี ไม่ต้องทำอะไร
      } catch (err) {
        console.error('[HIGHNOBLE_WAIT] failed for room', roomId, err);
      }
    }
  }, 3_000);

  io.on("connection", (socket: Socket) => {

    // Patch 03: ผูก Lobby realtime (subscribe/unsubscribe ต่อ Tier)
    registerLobbySocket(io, socket);

    // ──────────────────────────────────────────────────────────
    // EVENT: player_join_room
    // Client → Server: ผู้เล่นเข้าห้องเกม
    // ──────────────────────────────────────────────────────────
    socket.on("player_join_room", async (data: {
      roomId: string;
      playerId: string;
      tokenBalance: number;
      isVip: boolean;
    }) => {
      const { roomId, playerId, tokenBalance, isVip } = data;
      socket.join(roomId);

      // Patch 04: Initiate = โต๊ะส่วนตัวต่อ Human 1 คน, เติม AI ทันที, view-only ใน Lobby
      const initiateTable = createTableWithId(roomId, "initiate", { joinable: false });
      setSeat(roomId, 0, { type: "human", userId: playerId, name: playerId });
      setSeat(roomId, 1, { type: "ai", name: "Minion-2" });
      setSeat(roomId, 2, { type: "ai", name: "Minion-3" });
      setSeat(roomId, 3, { type: "ai", name: "Minion-4" });
      broadcastTableUpdate(io, initiateTable);

      // แจ้งทุกคนในห้องว่ามีผู้เล่นใหม่เข้ามา
      io.to(roomId).emit("player_joined", {
        playerId,
        tokenBalance,
        isVip,
        timestamp: Date.now(),
      });

      // สับและแจกไพ่ทันที (เทส 1 ผู้เล่น — production จะรอครบ 4 คน)
      const dealt = dealCards();
      const isValid = validateDeal(dealt);

      // map player IDs: P1=ผู้เล่นจริง, P2-P4=ชื่อ mock
      const playerIds = [playerId, "P2", "P3", "AI"];
      const cardsMap: Record<string, typeof dealt.players[0]> = {};
      playerIds.forEach((id, i) => {
        cardsMap[id] = dealt.players[i];
      });

      io.to(roomId).emit("arrangement_start", {
        roomId,
        tier: "initiate",
        cards: cardsMap,                  // ไพ่ของแต่ละคน (private ในของจริง)
        communityCards: dealt.community,  // row1/row2/row3
        blindAuction: dealt.blindAuction, // 2 ใบประมูล
        totalCards: 52,
        isValid,                          // true = ครบ 52 ไม่ซ้ำ
        timer: 45,
        timestamp: Date.now(),
      });
    });

    // ──────────────────────────────────────────────────────────
    // EVENT: arrangement_start  (S → C)
    // Server emit เมื่อทุกคนเข้าห้องครบ — ไพ่ถูก deal แล้ว
    // ──────────────────────────────────────────────────────────
    // (emit จาก game room setup logic ไม่ใช่ listener)
    // ตัวอย่าง emit ที่ matchmaking module จะเรียก:
    //
    // io.to(roomId).emit("arrangement_start", {
    //   roomId,
    //   tier,
    //   cards: { [playerId]: Card[] },   // ไพ่ 11 ใบของแต่ละคน (private)
    //   communityCards,                  // Community 6 ชุด
    //   timer: gameConfig.arrangementTimer[tier],
    //   autoSortFreeRoundsLeft: number,  // เหลือกี่ Round ที่ฟรี
    // });

    // ──────────────────────────────────────────────────────────
    // EVENT: arrangement_timeout
    // Server → Client: หมดเวลา → Auto-sort ทำงาน
    // (emit จาก timer ใน gameRoom.ts ไม่ใช่ listener)
    // ──────────────────────────────────────────────────────────
    //
    // io.to(roomId).emit("arrangement_timeout", {
    //   affectedPlayerId,
    //   autoSortCost,   // 0 ถ้ายังฟรี, หรือค่าตาม gameConfig.autoSort
    //   message: "Time's up! Auto-sort activated.",
    // });

    // ──────────────────────────────────────────────────────────
    // EVENT: showdown_result  (S → C)
    // emit หลัง Server resolve ทุก Pile — ใช้ทั้ง Beginner และ Pro+
    // ──────────────────────────────────────────────────────────
    // payload อยู่ใน arrangement_ready handler ด้านบน

    // ──────────────────────────────────────────────────────────
    // PRO+ ONLY EVENTS — emit เฉพาะเมื่อ mechanics flag = true
    // Sprint 4 จะ implement ใน pileResolution.ts / blindAuction.ts
    // ──────────────────────────────────────────────────────────

    // ─── Fog of War (Pro+) ────────────────────────────────────
    // io.to(roomId).emit("fog_of_war", { roomId }) เฉพาะ mechanics.fogOfWar === true
    //
    // ─── Pre-Auction Score Overlay (Pro+) ─────────────────────
    // io.to(roomId).emit("pre_auction_score", { scores }) เฉพาะ mechanics.blindAuction === true
    //
    // ─── Blind Auction Start (Pro+) ───────────────────────────
    // io.to(roomId).emit("blind_auction_start", { ... }) เฉพาะ mechanics.blindAuction === true
    //
    // ─── Discard Phase Start (Pro+) ───────────────────────────
    // io.to(roomId).emit("discard_phase_start", { ... }) เฉพาะ mechanics.discardPhase === true
    //
    // ─── Grand Finale Betting (Pro+) ──────────────────────────
    // io.to(roomId).emit("grand_finale_betting", { ... }) เฉพาะ mechanics.grandFinaleBetting === true
    //
    // Gate pattern ที่ Sprint 4 จะใช้สำหรับทุก Pro+ event:
    //
    //   const mechanics = getMechanics(room.tier);
    //   if (mechanics.fogOfWar) {
    //     io.to(roomId).emit("fog_of_war", { ... });
    //   }

    // ──────────────────────────────────────────────────────────
    // EVENT: match_end
    // Server → Client: จบ Match — ทุก Tier
    // ──────────────────────────────────────────────────────────
    // io.to(roomId).emit("match_end", {
    //   roomId,
    //   finalScores: { [playerId]: tokenDelta },
    //   showAd: room.players.every((p) => !p.isVip), // Ad ถ้า Free ทั้งหมด
    //   timestamp: Date.now(),
    // });

    // ──────────────────────────────────────────────────────────
    // EVENT: player_rematch / player_leave
    // Client → Server
    // ──────────────────────────────────────────────────────────
    socket.on("player_rematch", async (data: { roomId: string; playerId: string }) => {
      const { roomId, playerId } = data;
      io.to(roomId).emit("player_rematch_ack", { playerId });
      // Sprint 4: ถ้าทุกคน rematch → reset room → เริ่ม arrangement ใหม่
    });

    socket.on("player_leave", async (data: { roomId: string; playerId: string }) => {
      const { roomId, playerId } = data;
      socket.leave(roomId);

      // Buy-in Spec §4: ผู้เล่นกด Lobby กลางเกม → settle ทันทีด้วย stack ปัจจุบัน (ก่อนลบห้อง)
      // เช็คทีละ engine เพราะ handler นี้ไม่รู้ tier ล่วงหน้า (ใช้ร่วมทั้ง solo/Adept/HighNoble)
      const soloState = getMatchState(roomId);
      const multiState = getMultiMatchState(roomId);
      const hnState = getHNMatchState(roomId);
      let newTokenBalance: number | null = null;
      if (soloState?.escrowId) {
        newTokenBalance = await settleEscrow(soloState.humanPlayerId, soloState.escrowId, soloState.tokenBalance[soloState.humanPlayerId] ?? soloState.buyInAmount);
        deleteTable(roomId);
      } else if (multiState) {
        // A3/A4 (Bug A fix, 2026-07-17): settle escrow ให้ Human "ทุกคน" ในห้อง ไม่ใช่แค่ playerId ที่
        // leave (เดิมพลาดจุดนี้ — คนที่เหลือมี match_escrow ค้าง status='in_match' ไปกวนโต๊ะใหม่ทีหลัง
        // ผ่าน ACTIVE_MATCH_EXISTS) ในตัวเดียวกันนี้ก็ลบ multiMatchStates กันหน่วยความจำรั่วด้วย
        newTokenBalance = await settleAndEndMultiMatch(roomId, playerId);
        await deleteRoomCompletely(roomId);
      } else if (hnState) {
        const escrowId = hnState.escrowIds[playerId];
        if (escrowId) newTokenBalance = await settleEscrow(playerId, escrowId, hnState.tokenBalance[playerId] ?? hnState.buyInAmount);
        await deleteRoomCompletely(roomId);
      } else {
        // Patch 04 เดิม: ไม่พบ match state ที่ยัง active (เช่น ยังไม่เริ่มแมตช์จริง) — ลบ table แบบเดิม
        deleteTable(roomId);
      }

      // ถือว่า Leave = ทุกคนกลับ Lobby ตาม spec (ดู CoreRules 1.8)
      // newTokenBalance เป็นของ playerId ที่ leave เท่านั้น — client อื่นในห้องต้องเช็ค leavingPlayerId ตรงกับตัวเองก่อนใช้ค่านี้
      io.to(roomId).emit("match_end", {
        roomId,
        reason: "player_left",
        leavingPlayerId: playerId,
        newTokenBalance,
        timestamp: Date.now(),
      });
    });

    // start_match — Human เริ่ม Match ใหม่ (Initiate/Mastermind, solo)
    socket.on("start_match", async (data: {
      roomId: string; playerId: string; tier: string; devBossId?: string; bossId?: string;
    }) => {
      const { roomId, playerId, tier, devBossId, bossId } = data;
      socket.join(roomId);
      // Buy-in Spec §4: ต้อง track ใน socketUserMap ให้ disconnect กลางเกม settle escrow ได้
      // (เดิม solo tier ไม่เคยถูก track เลย เพราะ join ผ่าน player_join_room คนละ event กับ Adept/HighNoble)
      trackMatchmakingSocket(socket.id, { userId: playerId, roomId, tier });
      await startMatch(io, roomId, playerId, tier, devBossId, bossId);
    });

    // player_ready — Human ส่ง arrangement
    socket.on("player_ready", async (data: {
      roomId: string; playerId: string;
      arrangement: { pile1: string[]; pile2: string[]; pile3: string[] };
    }) => {
      const { roomId, arrangement } = data;
      // แปลง string key → Card object (stub ง่ายๆ)
      const toCards = (keys: string[]) => keys.map(k => {
        const suitMap: Record<string,string> = { s:'spades', h:'hearts', d:'diamonds', c:'clubs' };
        const rankMap: Record<string,number> = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'j':11,'q':12,'k':13,'a':14 };
        const suit = suitMap[k[k.length-1]] ?? 'spades';
        const rank = k.slice(0,-1).toUpperCase();
        const value = rankMap[k.slice(0,-1).toLowerCase()] ?? 0;
        return { suit, rank, value } as any;
      });
      await submitArrangement(io, roomId, {
        pile1: toCards(arrangement.pile1),
        pile2: toCards(arrangement.pile2),
        pile3: toCards(arrangement.pile3),
      });
    });
    // Patch High Noble: submit_arrangement_2 — Human ส่ง arrangement รอบ2 (รวมไพ่ประมูล สูงสุด 12 ใบ)
    socket.on("submit_arrangement_2", async (data: {
      roomId: string; playerId: string;
      arrangement: { pile1: string[]; pile2: string[]; pile3: string[] };
    }) => {
      const { roomId, arrangement } = data;
      const toCards = (keys: string[]) => keys.map(k => {
        const suitMap: Record<string,string> = { s:'spades', h:'hearts', d:'diamonds', c:'clubs' };
        const rankMap: Record<string,number> = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'j':11,'q':12,'k':13,'a':14 };
        const suit = suitMap[k[k.length-1]] ?? 'spades';
        const rank = k.slice(0,-1).toUpperCase();
        const value = rankMap[k.slice(0,-1).toLowerCase()] ?? 0;
        return { suit, rank, value } as any;
      });
      await submitArrangementRound2(io, roomId, {
        pile1: toCards(arrangement.pile1),
        pile2: toCards(arrangement.pile2),
        pile3: toCards(arrangement.pile3),
      });
    });


    // Patch Blind Auction: รับ bid จาก Human (กดได้ครั้งเดียว/ใบ — ตรวจซ้ำในฟังก์ชัน submitAuctionBid)
    socket.on("auction_bid", (data: {
      roomId: string; playerId: string; cardIndex: 0 | 1; level: number;
    }) => {
      const { roomId, playerId, cardIndex, level } = data;
      const result = submitAuctionBid(roomId, playerId, cardIndex, level);
      socket.emit("auction_bid_ack", result);
    });


    // Patch Discard Phase: รับการเลือกเก็บไพ่ 3 ใบจาก Human
    socket.on("discard_submit", (data: {
      roomId: string; playerId: string; keepKeys: string[];
    }) => {
      const { roomId, playerId, keepKeys } = data;
      const result = submitDiscard(io, roomId, playerId, keepKeys);
      socket.emit("discard_submit_ack", result);
    });


    // Patch Grand Finale: รับการ Call/Fold จาก Human
    // Patch High Noble: รับ revealedCardKey เพิ่ม — ใบที่ Human เลือกหงาย (ทั้งรอบ 1 และรอบ 2)
    socket.on("grand_finale_action", (data: {
      roomId: string; playerId: string; action: "call" | "fold"; revealedCardKey?: string;
    }) => {
      const { roomId, playerId, action, revealedCardKey } = data;
      const result = submitGrandFinaleAction(io, roomId, playerId, action, revealedCardKey);
      socket.emit("grand_finale_action_ack", result);
    });

    socket.on("player_continue", (data: { roomId: string }) => {
      resolveContinue(data.roomId)
    });

    // ──────────────────────────────────────────────────────────
    // Patch 11: Adept VIP Lock — สร้างโต๊ะ / เข้าโต๊ะที่ 2
    // ──────────────────────────────────────────────────────────
    socket.on("adept_create_table", (data: {
      userId: string; userName: string; isVip: boolean; pin?: string;
    }) => {
      try {
        const table = createAdeptTable(data.userId, data.userName, data.isVip, data.pin);
        socket.join(table.tableId);
        socket.emit("adept_table_created", { table });
        io.to(`lobby:adept`).emit("lobby:tableUpdate", { tier: "adept", table });
      } catch (err: any) {
        socket.emit("adept_create_error", { message: err.message ?? "สร้างโต๊ะไม่สำเร็จ" });
      }
    });

    socket.on("adept_join_table", (data: {
      tableId: string; userId: string; userName: string; isVip: boolean; pin?: string;
    }) => {
      const result = joinAdeptTable(data.tableId, data.userId, data.userName, data.isVip, data.pin);
      socket.emit("adept_join_result", result);
      if (result.ok) {
        socket.join(data.tableId);
        io.to(`lobby:adept`).emit("lobby:tableUpdate", { tier: "adept", tableId: data.tableId });
        // ครบ 4 ที่นั่งแล้ว -> ดันทุกคนในโต๊ะเข้าเกมทันที (ผู้เล่นรอใน Lobby จนเต็มโต๊ะ)
        io.to(data.tableId).emit("adept_table_ready", { tableId: data.tableId });
      }
    });

    // ──────────────────────────────────────────────────────────
    // ROOM REGISTRY (ใหม่) — Multiplayer Matchmaking
    // ใช้กับ Adept / Mastermind / HighNoble เท่านั้น (3H + 1AI)
    // ──────────────────────────────────────────────────────────

    // Auto-Match: หาห้อง public ที่เปิดอยู่ก่อน ถ้าไม่มีสร้างใหม่
    socket.on("room_auto_match", async (data: {
      tier: RoomTier; userId: string; userName: string; avatarUrl?: string;
    }) => {
      const { tier, userId, userName, avatarUrl } = data;
      try {
        const result = await findOrCreateRoomAndJoin(tier, userId, userName, avatarUrl);
        if (!result.ok || !result.room) {
          // Patch (2026-07-17): แก้ข้อความเป็นภาษาอังกฤษ (canon บังคับ UI/error message ทั้งหมดเป็น
          // อังกฤษ — เจอเป็นภาษาไทยค้างอยู่ระหว่างแก้ A2)
          socket.emit("room_error", { message: "Could not join the table. Please try again." });
          return;
        }
        socket.join(result.room.roomId);
        socket.join(userId); // Patch Multiplayer: private card delivery ต่อ user
        trackMatchmakingSocket(socket.id, { userId, roomId: result.room.roomId, tier });
        socket.emit("room_matched", { room: result.room, seatIndex: result.seatIndex });
        io.to(result.room.roomId).emit("room_status", { room: result.room });

        if (result.room.status === 'full') {
          await finalizeAndStartRoom(io, result.room);
        }
      } catch (err: any) {
        socket.emit("room_error", { message: err.message ?? "Something went wrong. Please try again." });
      }
    });

    // สร้างห้อง Private (VIP+PIN หรือ Free=public no-pin)
    socket.on("room_create_private", async (data: {
      tier: RoomTier; userId: string; userName: string; isVip: boolean; pin?: string;
    }) => {
      const { tier, userId, userName, isVip, pin } = data;
      try {
        const room = await createPrivateRoom(tier, userId, userName, isVip, pin);
        socket.join(room.roomId);
        socket.emit("room_created", { room });
        io.to(`lobby:${tier}`).emit("lobby:tableUpdate", { tier, room });
      } catch (err: any) {
        socket.emit("room_error", { message: err.message ?? "สร้างห้องไม่สำเร็จ" });
      }
    });

    // เข้าห้อง Private ด้วย roomId (+ PIN ถ้ามี)
    socket.on("room_join_private", async (data: {
      roomId: string; userId: string; userName: string; pin?: string; tier?: RoomTier;
    }) => {
      const { roomId, userId, userName, pin, tier } = data;
      const result = await joinRoomLocked(roomId, userId, userName, pin);
      socket.emit("room_join_result", result);
      if (result.ok && result.room) {
        socket.join(roomId);
        socket.join(userId); // Patch Multiplayer: private card delivery ต่อ user
        trackMatchmakingSocket(socket.id, { userId, roomId, tier: tier ?? result.room.tier });
        io.to(roomId).emit("room_status", { room: result.room });

        if (result.room.status === 'full') {
          await finalizeAndStartRoom(io, result.room);
        }
      }
    });

    // เช็คสถานะห้องปัจจุบัน (สำหรับ waiting room UI polling/reconnect)
    socket.on("room_get_status", async (data: { roomId: string }) => {
      const room = await getRoomFromRegistry(data.roomId);
      socket.emit("room_status", { room });
    });

    // Waiting Timeout Dialog (§4.4/§6.1): ผู้เล่นตอบ dialog
    //   Adept: "wait_2_more" / "delete" — ใครก็ตอบได้ (มี Human รอแค่คนเดียวเสมอ)
    //   High Noble: "wait_2_more" / "delete" (รอบแรก) และ "start_now" (รอบ Deadlock) — เฉพาะ Host เท่านั้น
    socket.on("room_timeout_choice", async (data: { roomId: string; userId: string; choice: "wait_2_more" | "delete" | "start_now" }) => {
      const { roomId, userId, choice } = data;
      const room = await getRoomFromRegistry(roomId);
      if (!room) return;

      // High Noble ทุก choice ต้องเป็น Host เท่านั้น (§6.1) — Adept ไม่ gate เพราะมี Human รอแค่คนเดียว
      if (room.tier === "highNoble" && room.hostUserId && userId !== room.hostUserId) {
        socket.emit("room_error", { message: "Only the host can decide for this table." });
        return;
      }

      if (choice === "wait_2_more") {
        const extended = await extendRoomWait(roomId);
        if (extended) io.to(roomId).emit("room_wait_extended", { roomId, timeoutAt: extended.timeoutAt });
        return;
      }

      if (choice === "start_now" && room.tier === "highNoble") {
        let filled = await fillWithMinion(roomId);
        if (!filled) return;
        // LobbyMatchmaking_Spec_v1_1: public room ล็อค Boss/Monarch ไปแล้วตอน Human คนแรก join (ดู
        // roomRegistry.joinRoom()) — finalizeBossSeat() ที่นี่จะ re-roll ทับผลที่ล็อกไว้ ต้อง gate ด้วย
        // isPrivate เหมือน finalizeAndStartRoom() ด้านบน (private room เท่านั้นที่ยังใช้ placeholder รอ roll จริงตรงนี้)
        if (filled.isPrivate) filled = await finalizeBossSeat(filled);
        await markInProgress(roomId);
        io.to(roomId).emit("room_ready", { roomId, seats: filled.seats });
        await startHighNobleMultiMatch(io, roomId, filled.seats);
        return;
      }

      // "delete" (หรือ start_now ที่ไม่ใช่ highNoble — ไม่ควรเกิดขึ้นจาก client ปกติ)
      io.to(roomId).emit("room_deleted", { roomId, message: "Table has been deleted." });
      await deleteRoomCompletely(roomId);
    });

    // Multiplayer: Human ส่ง arrangement (Adept — 1-3 Human ในห้องเดียวกัน)
    // Multiplayer: Client เข้ามาถึง game screen แล้ว → join user room + ขอไพ่ปัจจุบัน
    // (แก้ race: server อาจ emit round_start ก่อน client พร้อม)
    socket.on("game_join", async (data: { roomId: string; userId: string; tier?: RoomTier }) => {
      const { roomId, userId, tier } = data;
      socket.join(roomId);
      socket.join(userId);
      trackMatchmakingSocket(socket.id, { userId, roomId, tier: tier ?? 'adept' });
      if (tier === 'highNoble') {
        resendHNRoundStartToPlayer(io, roomId, userId);
      } else {
        await resendRoundStartToPlayer(io, roomId, userId);
      }
    });

    // Multiplayer HighNoble: Human ส่ง arrangement รอบ 1
    socket.on("hn_player_ready", async (data: {
      roomId: string; userId: string;
      arrangement: { pile1: string[]; pile2: string[]; pile3: string[] };
    }) => {
      const { roomId, userId, arrangement } = data;
      const result = await submitHNArrangement(io, roomId, userId, {
        pile1: toCards(arrangement.pile1), pile2: toCards(arrangement.pile2), pile3: toCards(arrangement.pile3),
      });
      socket.emit("hn_player_ready_ack", result);
    });

    // Multiplayer HighNoble: Human ประมูล
    socket.on("hn_auction_bid", (data: {
      roomId: string; userId: string; cardIndex: 0 | 1; level: number;
    }) => {
      const { roomId, userId, cardIndex, level } = data;
      const result = submitHNAuctionBid(roomId, userId, cardIndex, level);
      socket.emit("hn_auction_bid_ack", result);
    });

    // Multiplayer HighNoble: Human ส่ง arrangement รอบ 2 (รวมไพ่ประมูล)
    socket.on("hn_arrangement_2", async (data: {
      roomId: string; userId: string;
      arrangement: { pile1: string[]; pile2: string[]; pile3: string[] };
    }) => {
      const { roomId, userId, arrangement } = data;
      const result = await submitHNArrangementRound2(io, roomId, userId, {
        pile1: toCards(arrangement.pile1), pile2: toCards(arrangement.pile2), pile3: toCards(arrangement.pile3),
      });
      socket.emit("hn_arrangement_2_ack", result);
    });

    // Multiplayer HighNoble: Human เลือกเก็บไพ่ 9 ใบ (3/3/3)
    socket.on("hn_discard_submit", (data: {
      roomId: string; userId: string; keepKeys: string[];
    }) => {
      const { roomId, userId, keepKeys } = data;
      const result = submitHNDiscard(io, roomId, userId, keepKeys);
      socket.emit("hn_discard_submit_ack", result);
    });

    // Multiplayer HighNoble: Human Call/Fold ใน Grand Finale (revealedCardKey = ใบที่เลือกหงายเอง ถ้ามี)
    socket.on("hn_grand_finale_action", (data: {
      roomId: string; userId: string; action: "call" | "fold"; revealedCardKey?: string;
    }) => {
      const { roomId, userId, action, revealedCardKey } = data;
      const result = submitHNGrandFinaleAction(io, roomId, userId, action, revealedCardKey);
      socket.emit("hn_grand_finale_action_ack", result);
    });

    socket.on("player_ready_multi", async (data: {
      roomId: string; userId: string;
      arrangement: { pile1: string[]; pile2: string[]; pile3: string[] };
    }) => {
      const { roomId, userId, arrangement } = data;
      const toCards = (keys: string[]) => keys.map(k => {
        const suitMap: Record<string,string> = { s:'spades', h:'hearts', d:'diamonds', c:'clubs' };
        const rankMap: Record<string,number> = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'j':11,'q':12,'k':13,'a':14 };
        const suit = suitMap[k[k.length-1]] ?? 'spades';
        const rank = k.slice(0,-1).toUpperCase();
        const value = rankMap[k.slice(0,-1).toLowerCase()] ?? 0;
        return { suit, rank, value } as any;
      });
      await submitMultiArrangement(io, roomId, userId, {
        pile1: toCards(arrangement.pile1),
        pile2: toCards(arrangement.pile2),
        pile3: toCards(arrangement.pile3),
      });
    });

    socket.on("disconnect", async () => {
      const info = socketUserMap.get(socket.id);
      if (info) {
        console.log('[DISCONNECT]', Date.now(), info.userId, 'from room', info.roomId);
        // Bug A fix (2026-07-17): ครอบ try/catch — เดิมไม่มีเลย ถ้า replace/AFK logic throw กลางทาง
        // socketUserMap.delete() ด้านล่างจะไม่ทำงาน ทิ้ง entry ค้างตลอดไป
        try {
          if (info.tier === 'adept') {
            // A5: mark AFK + ให้ AI ตอบแทนทันที (ไม่ settle escrow ตรงนี้แล้ว — รอ grace 60s ก่อน
            // reconnect ได้ ดู markPlayerAFK/finalizeAFKReplacement ใน gameLoop.ts)
            // TEMP DEBUG (2026-07-24, Symptom A): จุดที่ trigger AFK จริง — เทียบ timestamp นี้กับ
            // [DEBUG_SOCKETMAP] SET/CLEAR ของ userId เดียวกันเพื่อดูว่า set() มาทันหรือหลัง clear ไปแล้ว
            console.log('[DEBUG_AFK_TRIGGER]', Date.now(), 'marking AFK for', info.userId, 'in room', info.roomId, 'from socket', socket.id);
            await markPlayerAFK(io, info.roomId, info.userId);
          } else if (info.tier === 'highNoble') {
            await replaceHNPlayerWithAI(io, info.roomId, info.userId);
          } else if (info.tier === 'initiate' || info.tier === 'mastermind') {
            // Buy-in Spec §4: solo tier ไม่มี Human อื่นให้เล่นต่อ — settle ทันทีด้วย stack ปัจจุบันแล้วปิดแมตช์
            await settleAndEndSoloMatch(info.roomId);
          }
        } catch (err) {
          console.error('[DISCONNECT]', Date.now(), 'handler failed for', info.userId, 'in', info.roomId, err);
        }
        socketUserMap.delete(socket.id);
      } else {
        console.log('[DISCONNECT]', Date.now(), 'Socket disconnected (untracked):', socket.id);
      }
    });
  });
}
