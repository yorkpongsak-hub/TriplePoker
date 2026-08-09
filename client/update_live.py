import re

file_path = 'src/app/(game)/live.tsx'

# อ่านไฟล์เดิม
try:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
except FileNotFoundError:
    print(f"❌ หาไฟล์ไม่พบที่ตำแหน่ง: {file_path}")
    print("กรุณาcd ไปที่ root folder ของโปรเจกต์ก่อนรันสคริปต์ครับ")
    exit(1)

# สำรองไฟล์เดิม
with open(file_path + '.bak', 'w', encoding='utf-8') as f:
    f.write(content)

# 1. ปรับปรุงส่วน USER AREA
old_user_area_pattern = r'\{\/\* USER AREA \*\/\}[\s\S]*?\{\/\* USER AVATAR'
new_user_area_code = '''{/* USER AREA */}
          <View style={[s.userArea, { opacity: (phase === 'countdown' || phase === 'showdown' || phase === 'result') ? 0 : 1 }]}>
            <Text style={[s.swapHint, { opacity: selected ? 1 : 0 }]}>Tap the cards you want to swap</Text>
            {hasFoul[PLAYER_ID] && <Text style={s.foulText}>⚠️ FOUL{foulReasons[PLAYER_ID] ? ` — ${foulReasons[PLAYER_ID]}` : ''}</Text>}

            {isRevealed ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
                {[1, 2, 3].flatMap(pNum => userRevealed[pNum] ?? []).map((key, ci) => (
                  <View key={ci} style={[s.userCard, { zIndex: ci }]}>
                    {CARD_IMG[key] && <Image source={CARD_IMG[key]} style={{ width: CW, height: CH }} resizeMode="cover" />}
                  </View>
                ))}
              </View>
            ) : (
              /* ── กรอบทองล้อมรอบทั้ง 3 Pile แนวนอนแถวเดียวกัน ── */
              <View style={s.pilesContainerFrame}>
                
                {/* PILE 1 */}
                <View style={s.pileGroup}>
                  <Text style={s.pileLabelHeader}>PILE 1</Text>
                  <View style={s.cardStackRow}>
                    {piles[0].map((card, ci) => (
                      <FaceCard key={card.id} card={card} pi={0} ci={ci} first={ci === 0} />
                    ))}
                  </View>
                </View>

                {/* PILE 2 */}
                <View style={s.pileGroup}>
                  <Text style={s.pileLabelHeader}>PILE 2</Text>
                  <View style={s.cardStackRow}>
                    {piles[1].map((card, ci) => (
                      <FaceCard key={card.id} card={card} pi={1} ci={ci} first={ci === 0} />
                    ))}
                  </View>
                </View>

                {/* PILE 3 */}
                <View style={s.pileGroup}>
                  <Text style={s.pileLabelHeader}>PILE 3</Text>
                  <View style={s.cardStackRow}>
                    {piles[2].map((card, ci) => (
                      <TouchableOpacity
                        key={card.id}
                        onPress={() => handleCardPress(2, ci)}
                        activeOpacity={0.85}
                        style={[
                          s.userCard,
                          ci > 0 && { marginLeft: -38 },
                          selected?.pi === 2 && selected?.ci === ci && s.userCardSel,
                          { zIndex: ci }
                        ]}
                      >
                        {CARD_IMG[card.key]
                          ? <Image source={CARD_IMG[card.key]} style={{ width: CW, height: CH }} resizeMode="cover" />
                          : <Text style={{ fontSize: 8 }}>{card.key}</Text>}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

              </View>
            )}
          </View>

          </Animated.View>
          {/* USER AVATAR'''

content = re.sub(old_user_area_pattern, new_user_area_code, content)

# 2. เพิ่ม Style ท้ายไฟล์
new_styles = '''
  // ── Piles Frame Alignment Styles ──
  pilesContainerFrame: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    width: '98%',
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(0, 30, 15, 0.55)',
    borderWidth: 1.5,
    borderColor: '#c9a84c',
    borderRadius: 16,
    shadowColor: '#c9a84c',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
    marginTop: 6,
  },
  pileGroup: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  pileLabelHeader: {
    fontSize: 10,
    color: '#FFD76A',
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  cardStackRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
})'''

content = re.sub(r'\n\}\)\s*$', new_styles, content)

# เขียนไฟล์กลับ
with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ แก้ไขไฟล์ src/app/(game)/live.tsx เรียบร้อยแล้วครับลุง!")
