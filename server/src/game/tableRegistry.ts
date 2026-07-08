/**
 * tableRegistry.ts
 * Table Registry กลาง — เก็บ state โต๊ะทุก Tier (Initiate/Adept/Mastermind/HighNoble/LastBoss)
 * ใช้ร่วมกันโดย: Lobby (list+realtime), Adept Matchmaking, AI Fill System
 * The Sage Unicorn Studio Co., Ltd.
 */

export type Tier = 'initiate' | 'adept' | 'mastermind' | 'high_noble' | 'last_boss';

export type SeatType = 'human' | 'bot' | 'ai' | 'empty';

export interface Seat {
  type: SeatType;
  userId?: string;       // human เท่านั้น
  name: string;          // ชื่อแสดงผล (human=display_name, bot=สุ่มชื่อ, ai=personality name)
  avatarUrl?: string;
  joinedAt: number;       // epoch ms
}

export interface GameTable {
  tableId: string;
  tier: Tier;
  seats: [Seat, Seat, Seat, Seat]; // P1-P4 ตามลำดับเข้า/fill จริง
  createdAt: number;
  timeoutAt: number | null;        // null = ไม่มี timeout (เช่น Initiate ที่ AI Fill เติมได้ทันที)
  status: 'waiting' | 'full' | 'in_progress' | 'closed';
  joinable?: boolean; // Patch 04: false = Lobby แสดงผลอย่างเดียว กดเข้าไม่ได้ (ใช้กับ Initiate)
  vipLocked?: boolean;  // Patch 09: true = ต้องเป็น VIP + รู้ PIN ถึงเข้าได้
  vipPin?: string;      // Patch 09: PIN 4 หลัก (เก็บเฉพาะตอน vipLocked=true) — ห้ามส่งกลับ client ที่ไม่ใช่เจ้าของโต๊ะ
}

// ─── In-memory store (ย้ายเป็น Redis ทีหลังถ้าต้อง scale หลาย instance) ───
const tables: Map<string, GameTable> = new Map();
let tableSeq = 1;

// ─── Config ต่อ Tier: จำนวนที่นั่ง human ขั้นต่ำ, timeout, สร้างยังไงตอนเปิดโต๊ะใหม่ ───
// หมายเหตุ: ลอจิกการ "เติมที่นั่งใคร่อนหลัง" (เช่น Adept: Human->Bot->AI->Human)
// อยู่ในไฟล์ tier-specific matchmaking (เช่น adeptMatchmaking.ts) — ไฟล์นี้เป็นแค่ "ที่เก็บ + broadcast"
export const TIER_TABLE_CONFIG: Record<Tier, { waitTimeoutMs: number | null; seatCount: 4 }> = {
  initiate:   { waitTimeoutMs: null,            seatCount: 4 }, // AI Fill เติมได้ทันที ไม่ต้องรอ
  adept:      { waitTimeoutMs: 3 * 60 * 1000,   seatCount: 4 }, // ต้องมี Human >= 2 ภายใน 3 นาที
  mastermind: { waitTimeoutMs: null,            seatCount: 4 },
  high_noble: { waitTimeoutMs: null,            seatCount: 4 },
  last_boss:  { waitTimeoutMs: null,            seatCount: 4 },
};

function emptySeat(): Seat {
  return { type: 'empty', name: '', joinedAt: 0 };
}

function makeTableId(tier: Tier): string {
  return `${tier}_${tableSeq++}_${Date.now().toString(36)}`;
}

// ─── Query: ดูโต๊ะทั้งหมดของ Tier ที่ยังไม่เต็ม (สำหรับ Lobby list) ───
export function getOpenTablesByTier(tier: Tier): GameTable[] {
  return Array.from(tables.values()).filter(
    t => t.tier === tier && (t.status === 'waiting')
  );
}

// ─── หา "โต๊ะที่ยังไม่เต็ม" 1 โต๊ะของ Tier นี้ ถ้าไม่มี -> คืน null (ให้เรียก createTable ต่อ) ───
export function findOpenTable(tier: Tier): GameTable | null {
  const open = getOpenTablesByTier(tier);
  return open.length > 0 ? open[0] : null;
}

// ─── สร้างโต๊ะใหม่ — เรียกเฉพาะเมื่อ findOpenTable คืน null เท่านั้น (ห้ามสร้างถ้ายังมีโต๊ะไม่เต็ม) ───
export function createTable(tier: Tier): GameTable {
  const cfg = TIER_TABLE_CONFIG[tier];
  const table: GameTable = {
    tableId: makeTableId(tier),
    tier,
    seats: [emptySeat(), emptySeat(), emptySeat(), emptySeat()],
    createdAt: Date.now(),
    timeoutAt: cfg.waitTimeoutMs ? Date.now() + cfg.waitTimeoutMs : null,
    status: 'waiting',
  };
  tables.set(table.tableId, table);
  return table;
}

// ─── หา-หรือ-สร้าง โต๊ะที่เหมาะสมสำหรับ Tier นี้ (ใช้นี้จาก Lobby/Matchmaking) ───
export function findOrCreateTable(tier: Tier): GameTable {
  return findOpenTable(tier) ?? createTable(tier);
}

// ─── ใส่ผู้เล่นลงที่นั่งแรกที่ว่าง (ลำดับ P1->P4) — ใช้สำหรับ flow ง่าย (Initiate) ───
// Tier ที่มี fill-order เฉพาะ (เช่น Adept) ควรเรียก setSeat() ตรงๆ แทน
export function joinNextEmptySeat(tableId: string, seat: Omit<Seat, 'joinedAt'>): number | null {
  const table = tables.get(tableId);
  if (!table) return null;
  const idx = table.seats.findIndex(s => s.type === 'empty');
  if (idx === -1) return null;
  table.seats[idx] = { ...seat, joinedAt: Date.now() };
  recomputeStatus(table);
  return idx;
}

// ─── ใส่ผู้เล่นลงที่นั่งตำแหน่งที่กำหนดตรงๆ (ใช้โดย tier-specific matchmaking เช่น Adept P2=Bot,P3=AI) ───
export function setSeat(tableId: string, seatIndex: 0 | 1 | 2 | 3, seat: Omit<Seat, 'joinedAt'>): boolean {
  const table = tables.get(tableId);
  if (!table) return false;
  table.seats[seatIndex] = { ...seat, joinedAt: Date.now() };
  recomputeStatus(table);
  return true;
}

function recomputeStatus(table: GameTable) {
  const full = table.seats.every(s => s.type !== 'empty');
  table.status = full ? 'full' : 'waiting';
}

export function getTable(tableId: string): GameTable | undefined {
  return tables.get(tableId);
}

export function closeTable(tableId: string) {
  const t = tables.get(tableId);
  if (t) t.status = 'closed';
  // เก็บไว้สักพักเผื่อ debug แล้วค่อย cleanup ด้วย job แยก ไม่ลบทันที
}

// ─── สำหรับ debug/admin เท่านั้น ───
export function _debugAllTables(): GameTable[] {
  return Array.from(tables.values());
}


// ─── Patch 04: Initiate-specific helpers ──────────────────────
// Initiate = 1 Human ต่อโต๊ะเสมอ, เติม AI ทันที, โชว์ใน Lobby แบบดูได้อย่างเดียว (กดเข้าไม่ได้)

// สร้างโต๊ะโดยกำหนด tableId เอง (ใช้กรณี roomId มาจาก client อยู่แล้ว เช่น Initiate ปัจจุบัน)
// joinable=false หมายถึง Lobby แสดงผลแต่ห้ามกด join (โต๊ะส่วนตัวต่อ 1 Human)
export function createTableWithId(
  tableId: string,
  tier: Tier,
  opts: { joinable: boolean } = { joinable: true }
): GameTable {
  const table: GameTable = {
    tableId,
    tier,
    seats: [emptySeat(), emptySeat(), emptySeat(), emptySeat()],
    createdAt: Date.now(),
    timeoutAt: null,
    status: 'waiting',
    joinable: opts.joinable,
  };
  tables.set(tableId, table);
  return table;
}

// ลบโต๊ะออกจาก registry จริง (ใช้ตอน player_leave เท่านั้น — ห้ามเรียกตอน rematch)
export function deleteTable(tableId: string): boolean {
  return tables.delete(tableId);
}

// ดูโต๊ะทุกโต๊ะของ Tier แบบ "view-only" (Initiate) — ใช้แสดงรายชื่อ+คนเล่นใน Lobby แต่ฝั่ง Frontend ต้อง disable ปุ่ม join เอง โดยเช็คจาก field joinable
export function getViewOnlyTablesByTier(tier: Tier): GameTable[] {
  return Array.from(tables.values()).filter(t => t.tier === tier && t.status !== 'closed');
}


// ─── Patch 09: VIP Lock (เฉพาะ Tier ที่มี Human เปิดโต๊ะเองได้ เช่น Adept) ──
// หลักการป้องกันการพนัน: ทุกโต๊ะต้องมี Bot/AI อย่างน้อย 1 ตัวเสมอ ครบ 4 ที่นั่งเสมอ
// VIP Lock เป็นแค่ "ใครเข้าที่นั่ง Human คนที่ 2 ได้" ไม่กระทบกฎ Bot/AI ข้อนี้

export interface VipJoinResult {
  ok: boolean;
  reason?: 'not_found' | 'wrong_pin' | 'not_vip' | 'full' | 'success';
}

// สร้างโต๊ะ Adept — ใส่ Bot+AI ทันที, เปิด VIP Lock ถ้าผู้สร้างเป็น VIP และระบุ PIN มา
export function createAdeptTable(
  hostUserId: string,
  hostName: string,
  isVipHost: boolean,
  pin?: string
): GameTable {
  const tableId = makeTableId('adept');
  const cfg = TIER_TABLE_CONFIG['adept'];
  const vipLocked = isVipHost && !!pin;

  if (vipLocked && (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin))) {
    throw new Error('PIN ต้องเป็นตัวเลข 4 หลักเท่านั้น');
  }

  const table: GameTable = {
    tableId,
    tier: 'adept',
    seats: [
      { type: 'human', userId: hostUserId, name: hostName, joinedAt: Date.now() },
      { type: 'bot', name: randomBotName(), joinedAt: Date.now() },
      { type: 'ai', name: 'Minion', joinedAt: Date.now() },
      emptySeat(),
    ],
    createdAt: Date.now(),
    timeoutAt: Date.now() + cfg.waitTimeoutMs!,
    status: 'waiting',
    vipLocked,
    vipPin: vipLocked ? pin : undefined,
  };
  tables.set(tableId, table);
  return table;
}

// Human คนที่ 2 เข้าโต๊ะ Adept — เช็ค VIP Lock ก่อนถ้าจำเป็น
export function joinAdeptTable(
  tableId: string,
  userId: string,
  userName: string,
  isVip: boolean,
  pin?: string
): VipJoinResult {
  const table = tables.get(tableId);
  if (!table) return { ok: false, reason: 'not_found' };
  if (table.status !== 'waiting') return { ok: false, reason: 'full' };

  if (table.vipLocked) {
    if (!isVip) return { ok: false, reason: 'not_vip' };
    if (pin !== table.vipPin) return { ok: false, reason: 'wrong_pin' };
  }

  table.seats[3] = { type: 'human', userId, name: userName, joinedAt: Date.now() };
  recomputeStatus(table);
  return { ok: true, reason: 'success' };
}

const BOT_NAME_POOL = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Avery', 'Quinn', 'Reese', 'Sage'];
function randomBotName(): string {
  return BOT_NAME_POOL[Math.floor(Math.random() * BOT_NAME_POOL.length)];
}

// ตรวจ timeout ของโต๊ะ Adept ทั้งหมด — เรียกจาก setInterval ใน index.ts หรือ gameSocket.ts
// คืนลิสต์ tableId ที่หมดเวลาแล้วแต่ยังไม่ครบ Human (ให้ caller เป็นคนแจ้ง client + เรียก deleteTable เอง)
export function getTimedOutAdeptTables(): GameTable[] {
  const now = Date.now();
  return Array.from(tables.values()).filter(
    t => t.tier === 'adept' && t.status === 'waiting' && t.timeoutAt !== null && now > t.timeoutAt!
  );
}
