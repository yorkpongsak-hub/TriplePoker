// ============================================================
// TriplePoker — ArrangementPhase.tsx
// Tap-to-Swap + FoulChecker (Client) + Ready Button
// พาธ: triplepoker-app/src/components/game/ArrangementPhase.tsx
// The Sage Unicorn Studio Co., Ltd.
// Founder & Chief Architect: Assistant Professor Pongnathee Maneekul
// Updated: May 2026 — v1.1 เพิ่ม Beginner Guide Overlay + Ready sub-label
// ============================================================

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Vibration,
  Platform,
  Modal,
} from "react-native";

// ─── Types ───────────────────────────────────────────────────────

type Tier = "beginner" | "pro" | "boss" | "lastBoss";
type Suit = "spades" | "hearts" | "diamonds" | "clubs";

interface Card {
  id: string;       // unique ID สำหรับ key + swap tracking
  suit: Suit;
  rank: number;     // 2–14 (14 = Ace)
}

// ตำแหน่งของไพ่ใบหนึ่ง
interface CardPosition {
  pile: 1 | 2 | 3;
  index: number;
}

// ผลการตรวจ FoulChecker (Client-side)
interface FoulCheckResult {
  hasFoul: boolean;
  foulPiles: (1 | 2 | 3)[]; // Pile ที่ผิดกติกา
  message: string;
}

// Props
interface ArrangementPhaseProps {
  tier: Tier;
  initialCards: Card[];                // ไพ่ 11 ใบที่ Server ส่งมา
  autoSortFreeRoundsLeft: number;      // จำนวน Round ที่ยังฟรี
  isFirstArrangementEver: boolean;     // แสดง Guide Overlay ครั้งแรกหรือไม่
  onReady: (piles: { pile1: Card[]; pile2: Card[]; pile3: Card[] }) => void;
  onAutoSort: () => void;
  onGuideShown: () => void;            // callback เพื่อบันทึกว่าแสดง Guide แล้ว
}

// ─── Constants ───────────────────────────────────────────────────

const COLORS = {
  tableGreen:    "#1B5E20",
  gold:          "#C9A84C",
  goldLight:     "#F5E6B8",
  white:         "#FFFFFF",
  cardWhite:     "#FAFAF8",
  darkText:      "#1A1A1A",
  dimText:       "#888888",
  selectedBlue:  "#1565C0",  // Glow เมื่อเลือกไพ่
  foulRed:       "#C62828",  // Pile highlight เมื่อ Foul
  foulRedLight:  "#FFCDD2",
  toastBg:       "#212121",
  guideBlue:     "#1565C0",  // Guide overlay
  guideBlueBg:   "#E3F2FD",
};

// Hand rank ทั้ง 10 ระดับ (ใช้สำหรับ FoulChecker comparison)
// ค่ายิ่งสูง hand ยิ่งแข็ง — ตรงกับ handEvaluator.ts ฝั่ง Backend
const HAND_RANK = {
  HIGH_CARD:       1,
  ONE_PAIR:        2,
  TWO_PAIR:        3,
  THREE_OF_A_KIND: 4,
  STRAIGHT:        5,
  FLUSH:           6,
  FULL_HOUSE:      7,
  FOUR_OF_A_KIND:  8,
  STRAIGHT_FLUSH:  9,
  ROYAL_FLUSH:     10,
};

// ─── Helper: แจก 11 ใบเป็น 3 Pile เริ่มต้น ──────────────────────
// Pile 1: 3 ใบแรก, Pile 2: 3 ใบถัดไป, Pile 3: 5 ใบสุดท้าย
function splitInitialPiles(cards: Card[]): {
  pile1: Card[];
  pile2: Card[];
  pile3: Card[];
} {
  return {
    pile1: cards.slice(0, 3),
    pile2: cards.slice(3, 6),
    pile3: cards.slice(6, 11),
  };
}

// ─── FoulChecker — Client-side ───────────────────────────────────
// ตรวจสอบกฎ Pile 1 ≤ Pile 2 ≤ Pile 3 (Hand Strength)
// Sprint 3: ใช้การนับ rank ง่ายๆ เป็น proxy — Server ตรวจซ้ำที่ Showdown
function clientFoulCheck(
  pile1: Card[],
  pile2: Card[],
  pile3: Card[]
): FoulCheckResult {
  // คำนวณ Hand Strength คร่าวๆ จากไพ่ในแต่ละ Pile (Sprint 3: sum of ranks)
  // Sprint 4: จะ import handEvaluator logic จริงมาใช้
  const strength = (cards: Card[]) =>
    cards.reduce((sum, c) => sum + c.rank, 0);

  const s1 = strength(pile1);
  const s2 = strength(pile2);
  const s3 = strength(pile3);

  const foulPiles: (1 | 2 | 3)[] = [];

  // กฎ: Pile 1 ต้องไม่แข็งกว่า Pile 2
  if (s1 > s2) {
    foulPiles.push(1);
    foulPiles.push(2);
  }
  // กฎ: Pile 2 ต้องไม่แข็งกว่า Pile 3
  if (s2 > s3) {
    if (!foulPiles.includes(2)) foulPiles.push(2);
    foulPiles.push(3);
  }

  const hasFoul = foulPiles.length > 0;
  const message = hasFoul
    ? "Foul! Piles must go weakest → strongest. Fix before submitting."
    : "";

  return { hasFoul, foulPiles, message };
}

// ─── Helper: Rank Label ──────────────────────────────────────────
function rankLabel(rank: number): string {
  if (rank === 14) return "A";
  if (rank === 13) return "K";
  if (rank === 12) return "Q";
  if (rank === 11) return "J";
  return String(rank);
}

// ─── Helper: Suit Symbol ─────────────────────────────────────────
function suitSymbol(suit: Suit): string {
  return { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" }[suit];
}

// ============================================================
// Component หลัก
// ============================================================
const ArrangementPhase: React.FC<ArrangementPhaseProps> = ({
  tier,
  initialCards,
  autoSortFreeRoundsLeft,
  isFirstArrangementEver,
  onReady,
  onAutoSort,
  onGuideShown,
}) => {
  const isBeginner = tier === "beginner";

  // ─── State ───────────────────────────────────────────────────
  const [piles, setPiles] = useState(() => splitInitialPiles(initialCards));
  const [selectedPos, setSelectedPos] = useState<CardPosition | null>(null); // ไพ่ที่เลือกอยู่
  const [foulResult, setFoulResult]   = useState<FoulCheckResult | null>(null);
  const [showToast, setShowToast]     = useState(false);
  const [toastMsg, setToastMsg]       = useState("");

  // Guide Overlay state — แสดงเฉพาะครั้งแรก
  const [showGuide, setShowGuide]         = useState(isFirstArrangementEver);
  const [guideReadyShown, setGuideReadyShown] = useState(false); // Guide สำหรับปุ่ม Ready

  // Animated values
  const selectedAnim  = useRef(new Animated.Value(0)).current; // glow ไพ่ที่เลือก
  const foulShakeAnim = useRef(new Animated.Value(0)).current; // shake Pile ที่ Foul
  const toastAnim     = useRef(new Animated.Value(0)).current; // fade Toast
  const guideAnim     = useRef(new Animated.Value(0)).current; // fade-in Guide

  // ─── Guide Overlay Appear ────────────────────────────────────
  useEffect(() => {
    if (!showGuide) return;
    Animated.timing(guideAnim, {
      toValue: 1, duration: 400, useNativeDriver: true,
    }).start();
  }, [showGuide]);

  // ─── ปิด Arrangement Guide + บันทึกว่าแสดงแล้ว ──────────────
  const dismissArrangementGuide = useCallback(() => {
    Animated.timing(guideAnim, {
      toValue: 0, duration: 250, useNativeDriver: true,
    }).start(() => {
      setShowGuide(false);
      onGuideShown(); // แจ้ง parent บันทึก flag ใน AsyncStorage
    });
  }, [onGuideShown]);

  // ─── Toast ───────────────────────────────────────────────────
  const showToastMsg = useCallback((msg: string) => {
    setToastMsg(msg);
    setShowToast(true);
    toastAnim.setValue(1);
    Animated.sequence([
      Animated.delay(2000),
      Animated.timing(toastAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setShowToast(false));
  }, []);

  // ─── Selected Card Glow ──────────────────────────────────────
  useEffect(() => {
    if (selectedPos) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(selectedAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(selectedAnim, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ]),
        { iterations: -1 }
      ).start();
    } else {
      selectedAnim.stopAnimation();
      selectedAnim.setValue(0);
    }
  }, [selectedPos]);

  // ─── Foul Shake Animation ────────────────────────────────────
  const triggerFoulShake = useCallback(() => {
    Animated.sequence([
      Animated.timing(foulShakeAnim, { toValue: 8,  duration: 60, useNativeDriver: true }),
      Animated.timing(foulShakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(foulShakeAnim, { toValue: 6,  duration: 60, useNativeDriver: true }),
      Animated.timing(foulShakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
      Animated.timing(foulShakeAnim, { toValue: 0,  duration: 60, useNativeDriver: true }),
    ]).start();
  }, []);

  // ─── Tap-to-Swap ─────────────────────────────────────────────
  // แตะไพ่ใบแรก → selected (glow) | แตะไพ่ใบสอง → swap ตำแหน่ง
  const handleCardTap = useCallback(
    (pile: 1 | 2 | 3, index: number) => {
      // ปิด Guide Overlay เมื่อผู้เล่น interact ครั้งแรก
      if (showGuide) dismissArrangementGuide();

      if (!selectedPos) {
        // ยังไม่มีไพ่ถูกเลือก → เลือกใบนี้
        setSelectedPos({ pile, index });
        return;
      }

      // มีไพ่ถูกเลือกอยู่แล้ว
      if (selectedPos.pile === pile && selectedPos.index === index) {
        // แตะใบเดิม → ยกเลิก selection
        setSelectedPos(null);
        return;
      }

      // Swap ไพ่สองตำแหน่ง
      setPiles((prev) => {
        const next = {
          pile1: [...prev.pile1],
          pile2: [...prev.pile2],
          pile3: [...prev.pile3],
        };
        const fromPile = `pile${selectedPos.pile}` as keyof typeof next;
        const toPile   = `pile${pile}` as keyof typeof next;

        const fromCard = next[fromPile][selectedPos.index];
        const toCard   = next[toPile][index];

        // ตรวจว่าขนาด Pile ถูกต้องหลัง Swap
        // Pile 1, 2 = 3 ใบ | Pile 3 = 5 ใบ (Beginner) หรือ 5→Discard (Pro+)
        next[fromPile][selectedPos.index] = toCard;
        next[toPile][index]               = fromCard;

        return next;
      });

      // ล้าง Foul highlight เมื่อผู้เล่นเริ่มแก้ไข
      setFoulResult(null);
      setSelectedPos(null);
    },
    [selectedPos, showGuide, dismissArrangementGuide]
  );

  // ─── READY Button ─────────────────────────────────────────────
  // 1. ตรวจ FoulChecker (Client) → ถ้า Foul → แสดง highlight + Toast + Haptic
  // 2. ถ้าผ่าน → emit arrangement_ready ไป Server
  const handleReady = useCallback(() => {
    // แสดง Guide Ready หากยังไม่เคยเห็น (Beginner เท่านั้น)
    if (isBeginner && !guideReadyShown) {
      setGuideReadyShown(true);
      // Guide จะแสดงอีก 1.5 วิ แล้วค่อย proceed
      setTimeout(proceedReady, 1500);
      return;
    }
    proceedReady();
  }, [isBeginner, guideReadyShown, piles]);

  const proceedReady = useCallback(() => {
    const result = clientFoulCheck(piles.pile1, piles.pile2, piles.pile3);
    setFoulResult(result);

    if (result.hasFoul) {
      // Haptic error สั้น
      if (Platform.OS === "ios") {
        Vibration.vibrate(100);
      } else {
        Vibration.vibrate([0, 100]);
      }
      // Shake + Toast
      triggerFoulShake();
      showToastMsg(result.message);
      return;
    }

    // ผ่าน FoulChecker → ส่งไป Server
    onReady(piles);
  }, [piles, triggerFoulShake, showToastMsg, onReady]);

  // ─── Auto-sort Label ─────────────────────────────────────────
  const autoSortCostLabel = autoSortFreeRoundsLeft > 0
    ? `Free  (${autoSortFreeRoundsLeft} left)`
    : `${tier === "beginner" ? 15 : tier === "pro" ? 40 : 80} T`;

  // ─── Ready Sub-label (แยกตาม Tier) ──────────────────────────
  const readySubLabel = isBeginner
    ? "All piles reveal at once!"
    : "Pile 1 reveals first";

  // ─── Pile Border Color ───────────────────────────────────────
  // แดงเมื่อมี Foul, ทองเมื่อปกติ
  const pileBorderColor = (pileNum: 1 | 2 | 3): string => {
    if (foulResult?.foulPiles.includes(pileNum)) return COLORS.foulRed;
    return "rgba(201,168,76,0.4)"; // gold dim
  };

  const pileBgColor = (pileNum: 1 | 2 | 3): string => {
    if (foulResult?.foulPiles.includes(pileNum)) return COLORS.foulRedLight;
    return "rgba(0,0,0,0.15)";
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <View style={styles.container}>

      {/* ── Pile Label Row ─────────────────────────────────── */}
      <View style={styles.pileLabelRow}>
        <Text style={styles.pileLabel}>Pile 1  (Weakest)</Text>
        <Text style={styles.pileLabel}>Pile 2</Text>
        <Text style={styles.pileLabel}>
          Pile 3  {isBeginner ? "(5 cards)" : "(Strongest)"}
        </Text>
      </View>

      {/* ════════════════════════════════════════════════════
          CARD PILES — Tap-to-Swap
      ════════════════════════════════════════════════════ */}
      <Animated.View style={[
        styles.pilesRow,
        { transform: [{ translateX: foulShakeAnim }] },
      ]}>

        {([1, 2, 3] as const).map((pileNum) => {
          const cards = piles[`pile${pileNum}`];
          return (
            <View
              key={pileNum}
              style={[
                styles.pile,
                {
                  borderColor: pileBorderColor(pileNum),
                  backgroundColor: pileBgColor(pileNum),
                  // Pile 3 กว้างกว่าเพราะมี 5 ใบ
                  flex: pileNum === 3 ? 1.5 : 1,
                },
              ]}
            >
              {/* Pile Header */}
              <Text style={styles.pileIndexText}>{pileNum}</Text>

              {/* ไพ่แต่ละใบ */}
              <View style={styles.cardRow}>
                {cards.map((card, idx) => {
                  const isSelected =
                    selectedPos?.pile === pileNum && selectedPos?.index === idx;
                  const isRed = card.suit === "hearts" || card.suit === "diamonds";

                  return (
                    <TouchableOpacity
                      key={card.id}
                      onPress={() => handleCardTap(pileNum, idx)}
                      activeOpacity={0.7}
                    >
                      <Animated.View style={[
                        styles.card,
                        isSelected && styles.cardSelected,
                        isSelected && {
                          opacity: selectedAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.7, 1],
                          }),
                          transform: [{
                            scale: selectedAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [1, 1.08],
                            }),
                          }],
                        },
                      ]}>
                        {/* Rank — Large Index สำหรับ Active Seniors */}
                        <Text style={[styles.cardRank, isRed && styles.redSuit]}>
                          {rankLabel(card.rank)}
                        </Text>
                        <Text style={[styles.cardSuit, isRed && styles.redSuit]}>
                          {suitSymbol(card.suit)}
                        </Text>
                        {/* Selected indicator */}
                        {isSelected && (
                          <View style={styles.selectedDot} />
                        )}
                      </Animated.View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Foul indicator ใต้ Pile */}
              {foulResult?.foulPiles.includes(pileNum) && (
                <Text style={styles.foulPileText}>⚠ Foul</Text>
              )}
            </View>
          );
        })}
      </Animated.View>

      {/* ════════════════════════════════════════════════════
          ACTION BAR — Auto-sort + READY
      ════════════════════════════════════════════════════ */}
      <View style={styles.actionBar}>

        {/* Auto-sort Button */}
        <TouchableOpacity style={styles.autoSortBtn} onPress={onAutoSort}>
          <Text style={styles.autoSortBtnTitle}>Auto-sort</Text>
          <Text style={styles.autoSortBtnSub}>{autoSortCostLabel}</Text>
        </TouchableOpacity>

        {/* READY Button */}
        <TouchableOpacity style={styles.readyBtn} onPress={handleReady}>
          <Text style={styles.readyBtnTitle}>READY</Text>
          {/* Sub-label แยกตาม Tier — NEW v1.1 */}
          <Text style={styles.readyBtnSub}>{readySubLabel}</Text>
        </TouchableOpacity>

      </View>

      {/* ════════════════════════════════════════════════════
          TOAST — Foul message
      ════════════════════════════════════════════════════ */}
      {showToast && (
        <Animated.View style={[styles.toast, { opacity: toastAnim }]}>
          <Text style={styles.toastText}>⚠ {toastMsg}</Text>
        </Animated.View>
      )}

      {/* ════════════════════════════════════════════════════
          GUIDE OVERLAY — NEW v1.1
          แสดงครั้งแรกที่ผู้เล่นเข้า Arrangement Phase
          ซ่อนทันทีเมื่อผู้เล่นแตะไพ่ครั้งแรก
      ════════════════════════════════════════════════════ */}
      {showGuide && (
        <Animated.View style={[styles.guideOverlay, { opacity: guideAnim }]}>
          <TouchableOpacity
            style={styles.guideCard}
            onPress={dismissArrangementGuide}
            activeOpacity={0.9}
          >
            {/* Icon */}
            <Text style={styles.guideIcon}>🃏</Text>

            {/* Message */}
            <Text style={styles.guideTitle}>Arrangement</Text>
            <Text style={styles.guideBody}>
              Sort your 11 cards into 3 piles —{"\n"}
              Left pile must be weakest,{"\n"}
              Right pile strongest!
            </Text>

            {/* Beginner extra hint */}
            {isBeginner && (
              <View style={styles.guideHintBox}>
                <Text style={styles.guideHint}>
                  🟢  Beginner Mode:{"\n"}
                  All piles reveal at once after everyone is Ready!
                </Text>
              </View>
            )}

            <Text style={styles.guideDismiss}>Tap anywhere to continue</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Ready Guide Bubble (Beginner — ครั้งแรก) ─────────── */}
      {isBeginner && guideReadyShown && (
        <View style={styles.readyGuideBubble}>
          <Text style={styles.readyGuideBubbleText}>
            ✓  Tap Ready when done — all piles reveal at once!
          </Text>
        </View>
      )}

    </View>
  );
};

// ============================================================
// Styles
// ============================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 8,
    paddingBottom: 8,
    justifyContent: "flex-end",
  },

  // ─── Pile Labels ──────────────────────────────────────────────
  pileLabelRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 4,
  },
  pileLabel: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 9,
    letterSpacing: 0.5,
    textAlign: "center",
    flex: 1,
  },

  // ─── Piles Row ────────────────────────────────────────────────
  pilesRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
  },
  pile: {
    borderRadius: 10,
    borderWidth: 1.5,
    padding: 6,
    alignItems: "center",
    minHeight: 110,
  },
  pileIndexText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 4,
  },
  cardRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 4,
  },

  // ─── Card ─────────────────────────────────────────────────────
  card: {
    width: 38,
    height: 54,
    borderRadius: 6,
    backgroundColor: COLORS.cardWhite,
    borderWidth: 1,
    borderColor: "#DDD",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  cardSelected: {
    borderWidth: 2,
    borderColor: COLORS.selectedBlue,
    shadowColor: COLORS.selectedBlue,
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 8,
  },
  // Large Index — รองรับ Active Seniors
  cardRank: {
    fontSize: 18,
    fontWeight: "900",
    color: COLORS.darkText,
    lineHeight: 20,
  },
  cardSuit: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.darkText,
    lineHeight: 16,
  },
  redSuit: { color: "#CC0000" },
  selectedDot: {
    position: "absolute",
    bottom: 3,
    right: 3,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.selectedBlue,
  },

  // ─── Foul Indicator ───────────────────────────────────────────
  foulPileText: {
    color: COLORS.foulRed,
    fontSize: 9,
    fontWeight: "700",
    marginTop: 4,
  },

  // ─── Action Bar ───────────────────────────────────────────────
  actionBar: {
    flexDirection: "row",
    gap: 10,
  },
  autoSortBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  autoSortBtnTitle: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "600",
  },
  autoSortBtnSub: {
    color: COLORS.gold,
    fontSize: 10,
    marginTop: 2,
  },
  readyBtn: {
    flex: 1.4,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: COLORS.gold,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  readyBtnTitle: {
    color: COLORS.darkText,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 3,
  },
  // Sub-label แยกตาม Tier — NEW v1.1
  readyBtnSub: {
    color: "rgba(30,20,0,0.6)",
    fontSize: 9,
    marginTop: 2,
    letterSpacing: 0.5,
  },

  // ─── Toast ────────────────────────────────────────────────────
  toast: {
    position: "absolute",
    bottom: 80,
    left: 20,
    right: 20,
    backgroundColor: COLORS.toastBg,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.foulRed,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  toastText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "600",
  },

  // ─── Guide Overlay — NEW v1.1 ─────────────────────────────────
  guideOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 50,
    paddingHorizontal: 24,
  },
  guideCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 24,
    width: "100%",
    alignItems: "center",
    borderWidth: 2,
    borderColor: COLORS.gold,
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  guideIcon: { fontSize: 40, marginBottom: 12 },
  guideTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.darkText,
    letterSpacing: 1,
    marginBottom: 10,
  },
  guideBody: {
    fontSize: 14,
    color: "#444",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 14,
  },
  guideHintBox: {
    backgroundColor: "#E8F5E9",
    borderRadius: 10,
    padding: 12,
    width: "100%",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#A5D6A7",
  },
  guideHint: {
    fontSize: 12,
    color: "#2E7D32",
    lineHeight: 18,
    textAlign: "center",
  },
  guideDismiss: {
    fontSize: 11,
    color: COLORS.dimText,
    letterSpacing: 0.5,
  },

  // ─── Ready Guide Bubble (Beginner) ────────────────────────────
  readyGuideBubble: {
    position: "absolute",
    bottom: 70,
    left: 16,
    right: 16,
    backgroundColor: COLORS.guideBlueBg,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.guideBlue,
    zIndex: 20,
  },
  readyGuideBubbleText: {
    color: COLORS.guideBlue,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
});

export default ArrangementPhase;
