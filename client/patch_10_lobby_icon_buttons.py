#!/usr/bin/env python3
"""
TriplePoker Patch 10 — เปลี่ยนปุ่มลิสต์โต๊ะจาก text (Join/View Only/Locked) เป็นไอคอน ✓ (เขียว) / ✗ (แดง)
รันจาก: /mnt/c/Users/psm_y/OneDrive/เอกสาร/TriplePoker/client (WSL)
คำสั่ง: python3 patch_10_lobby_icon_buttons.py
"""
import os

CLIENT_ROOT = os.getcwd()
LOBBY_PATH = os.path.join(CLIENT_ROOT, "app", "(home)", "lobby.tsx")

OLD_BLOCK = '''            <TouchableOpacity
              disabled={!table.joinable}
              onPress={() => handleEnterTable(table)}
              style={[s.joinBtn, !table.joinable && s.joinBtnDisabled]}
            >
              <Text style={[s.joinBtnTxt, !table.joinable && s.joinBtnTxtDisabled]}>
                {table.joinable ? 'Join' : (!isEligible(table.tier, MOCK_USER_TOKEN) ? 'Locked' : 'View Only')}
              </Text>
            </TouchableOpacity>'''

NEW_BLOCK = '''            <TouchableOpacity
              disabled={!table.joinable}
              onPress={() => handleEnterTable(table)}
              style={[s.joinIconBtn, { backgroundColor: table.joinable ? 'rgba(141,255,181,0.15)' : 'rgba(255,107,107,0.15)', borderColor: table.joinable ? COLOR.greenHighlight : COLOR.red }]}
            >
              <Text style={[s.joinIconTxt, { color: table.joinable ? COLOR.greenHighlight : COLOR.red }]}>
                {table.joinable ? '✓' : '✗'}
              </Text>
            </TouchableOpacity>'''

STYLE_ANCHOR = "  joinBtn: { backgroundColor: COLOR.goldPrimary, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 8 },"
STYLE_INSERT = STYLE_ANCHOR + "\n  joinIconBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },\n  joinIconTxt: { fontSize: 18, fontWeight: '800' },"


def main():
    if not os.path.isfile(LOBBY_PATH):
        print(f"❌ ไม่พบไฟล์: {LOBBY_PATH}")
        return

    with open(LOBBY_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    changed = False

    if "joinIconBtn" in content:
        print("⚠️  พบ joinIconBtn อยู่แล้ว — ดูเหมือน patch นี้รันไปแล้ว")
    elif OLD_BLOCK not in content:
        print("❌ ไม่พบ block ปุ่ม Join เดิมที่คาดไว้ — ไม่แก้ไฟล์ (ป้องกัน corrupt)")
        print("   อาจเป็นเพราะไฟล์ถูกแก้ structure ไปจาก Patch ก่อนหน้าที่คาดไว้")
        return
    else:
        content = content.replace(OLD_BLOCK, NEW_BLOCK, 1)
        changed = True
        print("✅ เปลี่ยนปุ่ม Join เป็นไอคอน ✓/✗")

    if "joinIconBtn:" in content and "joinIconBtn: { width: 40" not in content:
        pass  # already added via NEW_BLOCK usage only, style still needed
    if "joinIconTxt:" not in content:
        if STYLE_ANCHOR in content:
            content = content.replace(STYLE_ANCHOR, STYLE_INSERT, 1)
            changed = True
            print("✅ เพิ่ม style joinIconBtn/joinIconTxt")
        else:
            print("❌ ไม่พบ style anchor (joinBtn) — ไม่เพิ่ม style ใหม่")

    if changed:
        with open(LOBBY_PATH, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"\n🎉 Patch 10 เสร็จสิ้น: {LOBBY_PATH}")
        print("รีเฟรช browser (Ctrl+Shift+R) ดูไอคอน ✓ เขียว / ✗ แดง แทนข้อความ")
    else:
        print("\nℹ️  ไม่มีการเปลี่ยนแปลงไฟล์")


if __name__ == "__main__":
    main()
