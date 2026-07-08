#!/usr/bin/env python3
"""
TriplePoker Patch 09 — เพิ่ม VIP Lock (PIN 4 หลัก) เข้า tableRegistry.ts
รันจาก: /mnt/c/Users/psm_y/OneDrive/เอกสาร/TriplePoker/server (WSL)
คำสั่ง: python3 patch_09_vip_lock_registry.py
"""
import os

SERVER_ROOT = os.getcwd()
REGISTRY_PATH = os.path.join(SERVER_ROOT, "src", "game", "tableRegistry.ts")

INTERFACE_ANCHOR = "  joinable?: boolean; // Patch 04: false = Lobby แสดงผลอย่างเดียว กดเข้าไม่ได้ (ใช้กับ Initiate)\n}"
INTERFACE_REPLACEMENT = (
    "  joinable?: boolean; // Patch 04: false = Lobby แสดงผลอย่างเดียว กดเข้าไม่ได้ (ใช้กับ Initiate)\n"
    "  vipLocked?: boolean;  // Patch 09: true = ต้องเป็น VIP + รู้ PIN ถึงเข้าได้\n"
    "  vipPin?: string;      // Patch 09: PIN 4 หลัก (เก็บเฉพาะตอน vipLocked=true) — ห้ามส่งกลับ client ที่ไม่ใช่เจ้าของโต๊ะ\n}"
)

APPEND_CODE = '''

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

  if (vipLocked && (!pin || pin.length !== 4 || !/^\\d{4}$/.test(pin))) {
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
'''


def main():
    if not os.path.isfile(REGISTRY_PATH):
        print(f"❌ ไม่พบไฟล์: {REGISTRY_PATH}")
        return

    with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    if "createAdeptTable" in content:
        print("⚠️  พบ createAdeptTable อยู่แล้ว — ดูเหมือน patch นี้รันไปแล้ว ข้าม")
        return

    if INTERFACE_ANCHOR not in content:
        print("❌ ไม่พบ interface anchor ที่คาดไว้ — ไม่แก้ไฟล์ (ป้องกัน corrupt)")
        print("   อาจเป็นเพราะรัน patch ก่อนหน้าไม่ครบ หรือไฟล์ถูกแก้มือไปแล้ว")
        return

    content = content.replace(INTERFACE_ANCHOR, INTERFACE_REPLACEMENT, 1)
    content += APPEND_CODE

    with open(REGISTRY_PATH, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"✅ เพิ่ม VIP Lock fields + createAdeptTable/joinAdeptTable/getTimedOutAdeptTables: {REGISTRY_PATH}")
    print("\n🎉 Patch 09 เสร็จสิ้น")
    print("ขั้นต่อไป: Patch 10 จะเพิ่ม Socket events ใน gameSocket.ts สำหรับ adept_create_table / adept_join_table")


if __name__ == "__main__":
    main()
