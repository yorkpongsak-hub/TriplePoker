#!/usr/bin/env python3
"""
TriplePoker Hotfix 02 — แก้ relative import path ใน app/game/initiate/index.tsx
สาเหตุ: copy จาก app/test/live.tsx (ลึก 2 ระดับ) ไป app/game/initiate/index.tsx (ลึก 3 ระดับ)
        ทำให้ '../../xxx' ที่เคยถูก ต้องเป็น '../../../xxx'
รันจาก: /mnt/c/Users/psm_y/OneDrี/เอกสาร/TriplePoker/client (WSL)
คำสั่ง: python3 hotfix_02_fix_initiate_import_depth.py
"""
import os
import re

CLIENT_ROOT = os.getcwd()
TARGET_PATH = os.path.join(CLIENT_ROOT, "app", "game", "initiate", "index.tsx")


def main():
    if not os.path.isfile(TARGET_PATH):
        print(f"❌ ไม่พบไฟล์: {TARGET_PATH}")
        return

    with open(TARGET_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    # แทนที่ '../../  -> '../../../  (เฉพาะใน import/require string ที่ขึ้นต้นด้วย ../../)
    # ใช้ regex จับ ../../ ที่อยู่หลัง quote (' หรือ ") เท่านั้น ป้องกันไปแก้ที่อื่นโดยไม่ตั้งใจ
    pattern = re.compile(r"(['\"])\.\./\.\./(?!\.\./)")
    new_content, count = pattern.subn(r"\1../../../", content)

    if count == 0:
        print("⚠️  ไม่พบ pattern '../../' ที่ต้องแก้ — ไฟล์อาจถูกแก้ไปแล้ว หรือโครงสร้าง import เปลี่ยนไปจากที่คาด")
        print("    เปิดไฟล์ดูด้วยตาตรงๆ ว่ายังมี import ที่ resolve ไม่ได้อยู่ไหม")
        return

    with open(TARGET_PATH, "w", encoding="utf-8") as f:
        f.write(new_content)

    print(f"✅ แก้ relative import {count} จุด ใน {TARGET_PATH}")
    print("   ('../../xxx' -> '../../../xxx')")
    print("\n🎉 Hotfix เสร็จสิ้น — รัน expo start ใหม่อีกครั้ง")


if __name__ == "__main__":
    main()
