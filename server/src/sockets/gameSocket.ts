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
import { startMatch, submitArrangement, submitArrangementRound2, resolveContinue, submitAuctionBid, submitDiscard, submitGrandFinaleAction, burnLockedTokens } from "../game/gameLoop";
import { startMultiplayerMatch, submitMultiArrangement, replaceMultiPlayerWithAI, resendRoundStartToPlayer } from "../game/gameLoop";
import { gameConfig, getMechanics, getTierFromToken, type Tier } from "../config/gameConfig";
import { registerLobbySocket } from "./lobbySocket";
import { supabase } from "../config/supabase";
import { createTableWithId, setSeat, deleteTable } from "../game/tableRegistry";
import { createAdeptTable, joinAdeptTable, getTimedOutAdeptTables } from "../game/tableRegistry";
import {
  findOrCreateRoom, createPrivateRoom, joinRoom, getRoom as getRoomFromRegistry,
  fillRemainingWithAI, getTimedOutRooms, markInProgress,
  type Tier as RoomTier,
} from "../game/roomRegistry";
import { broadcastTableUpdate } from "./lobbySocket";

// ─── Types ───────────────────────────────────────────────────────

// โครงสร้างไพ่ 1 ใบ
interface Card {
  suit: "spades" | "hearts" | "diamonds" | "clubs";
  rank: number; // 2–14 (14 = Ace)
}

// การจัดไพ่ 11 ใบลง 3 Pile ของผู้เล่น 1 คน
interface PlayerArrangement {
  playerId: string;
  pile1: Card[]; // 3 ใบ (อ่อนสุด)
  pile2: Card[]; // 3 ใบ (กลาง)
  pile3: Card[]; // 5 ใบ (แข็งสุด) — Beginner ใช้ทั้ง 5, Pro+ Discard เหลือ 3
  isAutoSorted: boolean;
  foulChecked: boolean; // Client ตรวจแล้ว (Server ตรวจซ้ำที่ Showdown)
}

// ผลชนะ/แพ้ต่อ Pile
interface PileResult {
  pileNumber: 1 | 2 | 3;
  winnerId: string;        // playerId ที่ชนะ
  winnerHand: string;      // เช่น "Full House"
  potAmount: number;       // Token ที่ได้ (หลังหัก Rake แล้ว)
  hasFoul: boolean;        // มี Foul ใน Pile นี้ไหม
}

// State ของห้องเกม (เก็บใน Redis)
interface GameRoom {
  roomId: string;
  tier: Tier;
  players: {
    id: string;
    tokenBalance: number;
    isAI: boolean;
    isVip: boolean;
    isReady: boolean;
    arrangement?: PlayerArrangement;
  }[];
  round: number;          // รอบปัจจุบัน (นับตั้งแต่ต้น Match)
  phase: GamePhase;
  communityCards: {
    pile1: Card[];         // Community 2 ใบสำหรับ Pile 1
    pile2: Card[];         // Community 2 ใบสำหรับ Pile 2
    pile3: Card[];         // Community 2 ใบสำหรับ Pile 3
  };
}

// Phase ทั้งหมดของเกม
type GamePhase =
  | "waiting"
  | "arrangement"
  | "simultaneous_showdown"  // Beginner เท่านั้น
  | "pile1_reveal"           // Pro+
  | "pile2_reveal"           // Pro+
  | "fog_of_war"             // Pro+
  | "pre_auction"            // Pro+
  | "blind_auction"          // Pro+
  | "discard"                // Pro+
  | "grand_finale"           // Pro+
  | "match_end";

// ─── Helper: ดึง GameRoom จาก Redis ─────────────────────────────
// จริงๆ ต้อง import redis client — stub ไว้เพื่อ Sprint 3
// Sprint 4 จะ implement เต็มใน gameRoom.ts
async function getRoom(roomId: string): Promise<GameRoom | null> {
  // TODO: return await redisClient.get(`room:${roomId}`)
  return null;
}

async function saveRoom(room: GameRoom): Promise<void> {
  // TODO: await redisClient.set(`room:${roomId}`, JSON.stringify(room))
}

// ─── Multiplayer: track socket -> {userId, roomId} สำหรับ disconnect handling ───
const socketUserMap = new Map<string, { userId: string; roomId: string; tier: string }>();

// ─── Helper: ตรวจว่าทุกคน Ready แล้วหรือยัง ────────────────────
function allPlayersReady(room: GameRoom): boolean {
  return room.players.every((p) => p.isReady);
}

// ─── Helper: คำนวณ Token ที่ชนะแต่ละ Pile (หลัง Rake) ──────────
function calcPotAfterRake(tierKey: Tier, pileNumber: 1 | 2 | 3): number {
  const stakes = gameConfig.tokenPot.tiers[tierKey];
  const rawStake = pileNumber === 1 ? stakes.pile1 :
                   pileNumber === 2 ? stakes.pile2 : stakes.pile3;
  const players = gameConfig.tokenPot.s1s2.potPlayers; // 4 คน (3H + AI)
  const totalPot = rawStake * players;
  return Math.floor(totalPot * (1 - gameConfig.tokenPot.rake));
}

// ============================================================
// Main Socket Handler — register ที่ server/index.ts
// ============================================================
// ============================================================
// Handler: handleEndOfMatch — ประมวลผลจบ Match + Skin Unlock
// ============================================================
async function handleEndOfMatch(
  io: Server,
  roomId: string,
  room: GameRoom,
  results: PileResult[]
): Promise<void> {
  // Step 1: คำนวณ Token deltas
  const tokenDeltas = calcTokenDeltas(results, room);

  // Step 2: ตรวจสอบ skin unlock ต่อแต่ละ Human player
  for (const player of room.players) {
    if (player.isAI) continue; // ข้าม AI
    
    const tokenDelta = tokenDeltas[player.id] ?? 0;
    const isWin = tokenDelta > 0;

    if (!isWin) continue;

    try {
      const { data: userSkins } = await supabase
        .from('user_table_skins')
        .select('*')
        .eq('user_id', player.id)
        .single();

      if (!userSkins) {
        console.warn(`[SKIN] No skin record for ${player.id}`);
        continue;
      }

      let unlockedNewSkin = false;
      let newActiveSkin = userSkins.active_skin;

      // Tier B (Adept) → unlock Skin #2
      if (room.tier === 'adept' && !userSkins.skin_unlock_b) {
        const { error } = await supabase
          .from('user_table_skins')
          .update({
            unlocked_skins: [1, 2],
            active_skin: 2,
            skin_unlock_b: true,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', player.id);

        if (!error) {
          unlockedNewSkin = true;
          newActiveSkin = 2;
          console.log(`[SKIN] ${player.id} unlocked Skin #2 (Adept)`);
        }
      }

      // Tier A (Mastermind) → unlock Skin #3
      if (room.tier === 'mastermind' && !userSkins.skin_unlock_a) {
        const { error } = await supabase
          .from('user_table_skins')
          .update({
            unlocked_skins: [1, 2, 3],
            active_skin: 3,
            skin_unlock_a: true,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', player.id);

        if (!error) {
          unlockedNewSkin = true;
          newActiveSkin = 3;
          console.log(`[SKIN] ${player.id} unlocked Skin #3 (Mastermind)`);
        }
      }

      // Tier A+ (High Noble) → unlock Skin #4
      if (room.tier === 'highNoble' && !userSkins.skin_unlock_a_plus) {
        const { error } = await supabase
          .from('user_table_skins')
          .update({
            unlocked_skins: [1, 2, 3, 4],
            active_skin: 4,
            skin_unlock_a_plus: true,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', player.id);

        if (!error) {
          unlockedNewSkin = true;
          newActiveSkin = 4;
          console.log(`[SKIN] ${player.id} unlocked Skin #4 (High Noble)`);
        }
      }

      if (unlockedNewSkin) {
        const skinNames: Record<number, string> = {
          1: 'Marble Luxury',
          2: 'Ancient Stone Castle',
          3: 'Cosmic Mystical',
          4: 'Bamboo Rice Field'
        };

        io.to(roomId).emit('skin_unlocked', {
          playerId: player.id,
          skinId: newActiveSkin,
          skinName: skinNames[newActiveSkin],
          tier: room.tier,
          message: `🎉 ยินดีด้วย! คุณปลดล็อค Skin: ${skinNames[newActiveSkin]}`
        });
      }
    } catch (err) {
      console.error(`[SKIN] Error processing skin unlock for ${player.id}:`, err);
    }
  }

  io.to(roomId).emit('match_end', {
    roomId,
    tier: room.tier,
    finalScores: tokenDeltas,
    pileResults: results,
    showAd: room.players.every((p) => !p.isVip),
    timestamp: Date.now(),
  });

  await saveRoom(room);
}


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
  setInterval(async () => {
    const tiers: RoomTier[] = ['adept', 'mastermind', 'highNoble'];
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
          if (tier === 'adept') {
            await startMultiplayerMatch(io, room.roomId, filled.seats, 'adept');
          }
        }
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
    // EVENT: arrangement_ready
    // Client → Server: ผู้เล่นกด Ready ส่งการจัดไพ่มา
    // ──────────────────────────────────────────────────────────
    socket.on("arrangement_ready", async (data: {
      roomId: string;
      playerId: string;
      arrangement: PlayerArrangement;
    }) => {
      const { roomId, playerId, arrangement } = data;
      const room = await getRoom(roomId);
      if (!room) return;

      const mechanics = getMechanics(room.tier);

      // อัปเดต arrangement และ isReady ของผู้เล่นคนนี้
      const player = room.players.find((p) => p.id === playerId);
      if (player) {
        player.arrangement = arrangement;
        player.isReady = true;
      }
      await saveRoom(room);

      // แจ้ง Client คนอื่นว่าคนนี้ Ready แล้ว
      io.to(roomId).emit("player_ready_ack", { playerId });

      // ตรวจว่าทุกคน (Human + AI) Ready ครบหรือยัง
      if (!allPlayersReady(room)) return;

      // ─── แตกทางตาม Tier ────────────────────────────────────
      if (mechanics.showdownStyle === "simultaneous") {
        // ════ BEGINNER FLOW ════════════════════════════════════
        // ข้ามทุก phase → Simultaneous Showdown ทันที
        room.phase = "simultaneous_showdown";
        await saveRoom(room);

        io.to(roomId).emit("simultaneous_showdown", {
          roomId,
          tier: room.tier,
          countdownSeconds: 3, // นับถอยหลัง 3-2-1 ก่อนหงาย
          message: "All piles reveal at once!",
          // Server ส่ง payload ขั้นต่ำ — ผลแท้จริงจะมาใน showdown_result
          // หลัง Client แสดง animation 3-2-1 ครบ → emit showdown_result
        });

        // หลัง countdown → Server resolve ทุก Pile พร้อมกัน → emit showdown_result
        // (ใน production จะมี setTimeout หรือ await ตาม countdown)
        // สำหรับ Sprint 3: emit ทันที พร้อมกำหนด delay ฝั่ง Client
        const results = await resolveAllPilesSimultaneous(room);

        await handleEndOfMatch(io, roomId, room, results);

      } else {
        // ════ PRO+ FLOW ════════════════════════════════════════
        // เริ่มด้วย Pile 1 Resolution → sequential ต่อใน Sprint 4
        room.phase = "pile1_reveal";
        await saveRoom(room);

        io.to(roomId).emit("pile_1_reveal_start", {
          roomId,
          tier: room.tier,
          revealDelayMs: room.tier === "mastermind" ? 6_000 : 5_000,
        });
        // Pile 2, Fog of War, Auction, Discard, Grand Finale
        // → implement ใน Sprint 4 ใน pileResolution.ts + blindAuction.ts
      }
    });

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
      // Patch 04: Leave จริง = ลบโต๊ะออกจาก registry (Rematch ไม่เรียกจุดนี้ จึงไม่ถูกลบ)
      deleteTable(roomId);
      // ถือว่า Leave = ทุกคนกลับ Lobby ตาม spec (ดู CoreRules 1.8)
      io.to(roomId).emit("match_end", {
        roomId,
        reason: "player_left",
        leavingPlayerId: playerId,
        timestamp: Date.now(),
      });
    });

    // start_match — Human เริ่ม Match ใหม่
    socket.on("start_match", async (data: {
      roomId: string; playerId: string; tier: string; devBossId?: string;
    }) => {
      const { roomId, playerId, tier, devBossId } = data;
      socket.join(roomId);
      await startMatch(io, roomId, playerId, tier, devBossId);
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
        const room = await findOrCreateRoom(tier);
        const result = await joinRoom(room.roomId, userId, userName);
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
          await markInProgress(result.room.roomId);
          io.to(result.room.roomId).emit("room_ready", { roomId: result.room.roomId, seats: result.room.seats });
          // Patch Multiplayer: เริ่มเกมทันทีเมื่อห้องเต็ม (Adept เท่านั้นตอนนี้)
          if (tier === 'adept') {
            await startMultiplayerMatch(io, result.room.roomId, result.room.seats, 'adept');
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
      const result = await joinRoom(roomId, userId, userName, pin);
      socket.emit("room_join_result", result);
      if (result.ok && result.room) {
        socket.join(roomId);
        socket.join(userId); // Patch Multiplayer: private card delivery ต่อ user
        socketUserMap.set(socket.id, { userId, roomId, tier: tier ?? result.room.tier });
        io.to(roomId).emit("room_status", { room: result.room });

        if (result.room.status === 'full') {
          await markInProgress(roomId);
          io.to(roomId).emit("room_ready", { roomId, seats: result.room.seats });
          if (result.room.tier === 'adept') {
            await startMultiplayerMatch(io, roomId, result.room.seats, 'adept');
          }
        }
      }
    });

    // เช็คสถานะห้องปัจจุบัน (สำหรับ waiting room UI polling/reconnect)
    socket.on("room_get_status", async (data: { roomId: string }) => {
      const room = await getRoomFromRegistry(data.roomId);
      socket.emit("room_status", { room });
    });

    // Multiplayer: Human ส่ง arrangement (Adept — 1-3 Human ในห้องเดียวกัน)
    // Multiplayer: Client เข้ามาถึง game screen แล้ว → join user room + ขอไพ่ปัจจุบัน
    // (แก้ race: server อาจ emit round_start ก่อน client พร้อม)
    socket.on("game_join", async (data: { roomId: string; userId: string }) => {
      const { roomId, userId } = data;
      socket.join(roomId);
      socket.join(userId);
      socketUserMap.set(socket.id, { userId, roomId, tier: 'adept' });
      await resendRoundStartToPlayer(io, roomId, userId);
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
        }
        socketUserMap.delete(socket.id);
      } else {
        console.log('[DISCONNECT] Socket disconnected (untracked):', socket.id);
      }
    });
  });
}

// ============================================================
// Internal Resolvers (Stub — Sprint 3)
// จะ implement เต็มใน Sprint 4 ใน pileResolution.ts
// ============================================================

// resolve ทุก Pile พร้อมกัน (Beginner)
// Sprint 4 จะ import จาก pileResolution.ts แทน
async function resolveAllPilesSimultaneous(room: GameRoom): Promise<PileResult[]> {
  // TODO Sprint 4: เรียก handEvaluator.ts + foulChecker.ts → คืน PileResult[]
  // สำหรับ Sprint 3: return stub เพื่อให้ socket flow compile ผ่าน
  return [
    { pileNumber: 1, winnerId: "", winnerHand: "", potAmount: calcPotAfterRake(room.tier, 1), hasFoul: false },
    { pileNumber: 2, winnerId: "", winnerHand: "", potAmount: calcPotAfterRake(room.tier, 2), hasFoul: false },
    { pileNumber: 3, winnerId: "", winnerHand: "", potAmount: calcPotAfterRake(room.tier, 3), hasFoul: false },
  ];
}

// คำนวณ +/- Token ต่อผู้เล่นจากผล Pile ทั้งหมด
function calcTokenDeltas(
  results: PileResult[],
  room: GameRoom
): Record<string, number> {
  const deltas: Record<string, number> = {};
  room.players.forEach((p) => (deltas[p.id] = 0));

  for (const result of results) {
    if (!result.hasFoul && result.winnerId) {
      deltas[result.winnerId] = (deltas[result.winnerId] ?? 0) + result.potAmount;

      // หัก Ante จากทุกคน (จ่ายไปแล้วตอนต้น Hand — บันทึกการเปลี่ยนแปลงสุทธิ)
      const stakes = gameConfig.tokenPot.tiers[room.tier];
      const ante = result.pileNumber === 1 ? stakes.pile1 :
                   result.pileNumber === 2 ? stakes.pile2 : stakes.pile3;
      room.players.forEach((p) => {
        if (p.id !== result.winnerId) {
          deltas[p.id] = (deltas[p.id] ?? 0) - ante;
        }
      });
    }
  }
  return deltas;
}
