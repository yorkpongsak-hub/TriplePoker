#!/usr/bin/env python3
"""
TriplePoker Patch 01 — Restructure Tier folders + ย้าย live.tsx -> initiate
รันจาก: /mnt/c/Users/psm_y/OneDrive/เอกสาร/TriplePoker/client (WSL)
คำสั่ง: python3 patch_01_restructure_tiers.py
"""
import os
import shutil

CLIENT_ROOT = os.getcwd()  # ต้องรันจาก client/ root
APP_DIR = os.path.join(CLIENT_ROOT, "app")
GAME_DIR = os.path.join(APP_DIR, "game")
TEST_DIR = os.path.join(APP_DIR, "test")

TIERS = ["initiate", "adept", "mastermind", "high_noble", "last_boss"]

def main():
    print(f"📂 Working in: {CLIENT_ROOT}")
    if not os.path.isdir(APP_DIR):
        print("❌ ไม่พบ app/ — กรุณารัน script นี้จาก client/ root")
        return

    # 1. สร้างโฟลเดอร์ app/game/<tier>/ ทั้งหมด
    os.makedirs(GAME_DIR, exist_ok=True)
    for tier in TIERS:
        tier_path = os.path.join(GAME_DIR, tier)
        os.makedirs(tier_path, exist_ok=True)
        print(f"✅ สร้างโฟลเดอร์: app/game/{tier}/")

    # 2. ย้าย live.tsx -> app/game/initiate/index.tsx (ใช้ index.tsx เพื่อให้ expo-router จับ route ถูก)
    live_src = os.path.join(TEST_DIR, "live.tsx")
    initiate_dst = os.path.join(GAME_DIR, "initiate", "index.tsx")

    if os.path.isfile(live_src):
        if os.path.isfile(initiate_dst):
            print("⚠️  app/game/initiate/index.tsx มีอยู่แล้ว — ข้ามการย้าย (ไม่ทับไฟล์)")
        else:
            shutil.copy2(live_src, initiate_dst)
            print(f"✅ Copy live.tsx -> app/game/initiate/index.tsx")
            print("ℹ️  ไฟล์เดิม app/test/live.tsx ยังคงอยู่ (ยังไม่ลบ) — ทดสอบ initiate/index.tsx ให้ทำงานเหมือนเดิมก่อน ค่อยลบไฟล์เก่าด้วยตนเอง")
    else:
        print(f"❌ ไม่พบไฟล์ {live_src} — ตรวจสอบ path อีกครั้ง")

    print("\n🎉 Patch 01 เสร็จสิ้น")
    print("ขั้นต่อไป: เทส app/game/initiate/index.tsx ว่าทำงานเหมือน live.tsx เดิมทุกอย่าง ก่อนเริ่ม patch 02 (สร้าง Adept)")

if __name__ == "__main__":
    main()
