#!/usr/bin/env python3
"""
TriplePoker Hotfix — ลบ @ts-expect-error ที่ไม่จำเป็นออกจาก tableRegistry.ts
(เกิดจาก Patch 04 ใส่ comment ignore error ไว้ แต่ field ถูกเพิ่มใน interface แล้วจริงๆ ไม่มี error ให้ ignore)
รันจาก: /mnt/c/Users/psm_y/OneDrive/เอกสาร/TriplePoker/server (WSL)
คำสั่ง: python3 hotfix_01_remove_ts_expect_error.py
"""
import os

SERVER_ROOT = os.getcwd()
REGISTRY_PATH = os.path.join(SERVER_ROOT, "src", "game", "tableRegistry.ts")

LINE_TO_REMOVE = "    // @ts-expect-error joinable เพิ่มแบบ runtime field — ดู type ขยายด้านล่าง\n"


def main():
    if not os.path.isfile(REGISTRY_PATH):
        print(f"❌ ไม่พบไฟล์: {REGISTRY_PATH}")
        return

    with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    if LINE_TO_REMOVE not in content:
        print("⚠️  ไม่พบบรรทัดที่ต้องลบ — อาจถูกแก้ไปแล้ว หรือไม่ตรง whitespace เป๊ะๆ")
        print("    ลองเปิดไฟล์ดูบรรทัดประมาณ 145 ด้วยตาตรงๆ ถ้ายังมี @ts-expect-error อยู่ ลบทิ้งได้เลยครับ")
        return

    content = content.replace(LINE_TO_REMOVE, "", 1)
    with open(REGISTRY_PATH, "w", encoding="utf-8") as f:
        f.write(content)
    print("✅ ลบ @ts-expect-error ออกแล้ว — ลองรัน npm run dev ใหม่อีกครั้ง")


if __name__ == "__main__":
    main()
