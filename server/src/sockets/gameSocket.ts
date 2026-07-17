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
import { startMultiplayerMatch, submitMultiArrangement, replaceMultiPlayerWithAI, resendRoundStartToPlayer } from "../game/gameLoop";
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
  markAwaitingDeadlockChoice,
  type Tier as RoomTier,
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

  // Waiting Timeout Dialog (LobbyMatchmaking_Spec_v1_0 §4.4/§6.1) — Adept + High Noble ทุก 10 วิ:
  //   รอบแรก (3 นาที) หมด → ถาม dialog "Wait 2 More Minutes" / "Delete Table"
  //     (Adept: ใครก็ตอบได้ — มี Human รอแค่คนเดียวเสมอ / High Noble: เฉพาะ Host เท่านั้น)
  //   รอบขยาย (2 นาที) หมด:
  //     Adept → ลบโต๊ะทันที ไม่ถามซ้ำ
  //     High Noble → Human >=2: Deadlock dialog "Start Now (Fill 1 Minion AI)"/"Delete Table" (Host เท่านั้น, §6.1)
  //                  Human =1: ลบโต๊ะทันทีเหมือน Adept
  setInterval(async () => {
    const dialogTiers: RoomTier[] = ['adept', 'highNoble'];
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
        const escrowId = multiState.escrowIds[playerId];
        if (escrowId) newTokenBalance = await settleEscrow(playerId, escrowId, multiState.tokenBalance[playerId] ?? multiState.buyInAmount);
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
      socketUserMap.set(socket.id, { userId: playerId, roomId, tier });
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
      tier: RoomTier; userId: string; userName: string;
    }) => {
      const { tier, userId, userName } = data;
      try {
        const result = await findOrCreateRoomAndJoin(tier, userId, userName);
        if (!result.ok || !result.room) {
          socket.emit("room_error", { message: "เข้าห้องไม่สำเร็จ กรุณาลองใหม่" });
          return;
        }
        socket.join(result.room.roomId);
        socket.join(userId); // Patch Multiplayer: private card delivery ต่อ user
        socketUserMap.set(socket.id, { userId, roomId: result.room.roomId, tier });
        socket.emit("room_matched", { room: result.room, seatIndex: result.seatIndex });
        io.to(result.room.roomId).emit("room_status", { room: result.room });

        if (result.room.status === 'full') {
          // Monarch Spec v1.3: สุ่ม Boss จริง (weighted + pity) ตอนรู้ user_id Human ครบ 3 คนแล้ว
          const finalRoom = tier === 'highNoble' ? await finalizeBossSeat(result.room) : result.room;
          await markInProgress(finalRoom.roomId);
          io.to(finalRoom.roomId).emit("room_ready", { roomId: finalRoom.roomId, seats: finalRoom.seats });
          // Patch Multiplayer: เริ่มเกมทันทีเมื่อห้องเต็ม
          if (tier === 'adept') {
            await startMultiplayerMatch(io, finalRoom.roomId, finalRoom.seats, 'adept');
          } else if (tier === 'highNoble') {
            await startHighNobleMultiMatch(io, finalRoom.roomId, finalRoom.seats);
          }
        }
      } catch (err: any) {
        socket.emit("room_error", { message: err.message ?? "เกิดข้อผิดพลาด" });
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
        socketUserMap.set(socket.id, { userId, roomId, tier: tier ?? result.room.tier });
        io.to(roomId).emit("room_status", { room: result.room });

        if (result.room.status === 'full') {
          // Monarch Spec v1.3: สุ่ม Boss จริง (weighted + pity) ตอนรู้ user_id Human ครบ 3 คนแล้ว
          const finalRoom = result.room.tier === 'highNoble' ? await finalizeBossSeat(result.room) : result.room;
          await markInProgress(roomId);
          io.to(roomId).emit("room_ready", { roomId, seats: finalRoom.seats });
          if (finalRoom.tier === 'adept') {
            await startMultiplayerMatch(io, roomId, finalRoom.seats, 'adept');
          } else if (finalRoom.tier === 'highNoble') {
            await startHighNobleMultiMatch(io, roomId, finalRoom.seats);
          }
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
        filled = await finalizeBossSeat(filled);
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
      socketUserMap.set(socket.id, { userId, roomId, tier: tier ?? 'adept' });
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
        console.log('[DISCONNECT]', info.userId, 'from room', info.roomId);
        if (info.tier === 'adept') {
          await replaceMultiPlayerWithAI(io, info.roomId, info.userId);
        } else if (info.tier === 'highNoble') {
          await replaceHNPlayerWithAI(io, info.roomId, info.userId);
        } else if (info.tier === 'initiate' || info.tier === 'mastermind') {
          // Buy-in Spec §4: solo tier ไม่มี Human อื่นให้เล่นต่อ — settle ทันทีด้วย stack ปัจจุบันแล้วปิดแมตช์
          await settleAndEndSoloMatch(info.roomId);
        }
        socketUserMap.delete(socket.id);
      } else {
        console.log('[DISCONNECT] Socket disconnected (untracked):', socket.id);
      }
    });
  });
}
