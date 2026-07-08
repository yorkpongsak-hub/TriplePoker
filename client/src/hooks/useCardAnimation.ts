import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useCallback } from 'react';

// ─── ค่า duration พื้นฐาน (milliseconds) ────────────────────────────────────
const DURATION = {
  DEAL: 350,             // ไพ่บินออกจากกองมาที่ seat
  FLIP: 400,             // พลิกไพ่ (front ↔ back) รวม 2 phase
  FOLD: 300,             // ไพ่หายไปเมื่อ fold
  GLOW_IN: 300,          // Grand Finale: glow fade in
  GLOW_HOLD: 1200,       // Grand Finale: glow ค้างก่อน fade out
  GLOW_OUT: 500,         // Grand Finale: glow fade out
  SLOW_REVEAL_BASE: 500, // Grand Finale ใบแรก — duration เริ่มต้น
  SLOW_REVEAL_STEP: 200, // เพิ่มขึ้นทีละใบ (ยิ่งใบหลังยิ่งช้า สร้าง tension)
} as const;

// ─── Types ───────────────────────────────────────────────────────────────────
export type CardSide = 'front' | 'back';

export interface UseCardAnimationOptions {
  onFlipComplete?: (side: CardSide) => void;
  onDealComplete?: () => void;
  onFoldComplete?: () => void;
}

export interface CardAnimationControls {
  // animation triggers
  animateDeal: (delayMs?: number) => void;
  animateFlip: (toSide: CardSide, durationOverride?: number) => void;
  animateFold: () => void;
  animateSlowReveal: (cardIndex: number, isLast?: boolean) => void;
  // animated styles
  frontStyle: ReturnType<typeof useAnimatedStyle>;
  backStyle: ReturnType<typeof useAnimatedStyle>;
  dealStyle: ReturnType<typeof useAnimatedStyle>;
  foldStyle: ReturnType<typeof useAnimatedStyle>;
  glowStyle: ReturnType<typeof useAnimatedStyle>;
  // shared values — ให้ component อื่นอ่าน state ได้
  flipProgress: ReturnType<typeof useSharedValue<number>>;
  dealProgress: ReturnType<typeof useSharedValue<number>>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────
/**
 * useCardAnimation
 * Hook กลางสำหรับ animation ไพ่ทั้งหมด — ใช้ Reanimated 3
 * ใช้ได้กับ: Card.tsx · FogOfWar.tsx · GrandFinale.tsx
 *
 * Performance target: 60fps บน iOS 14+ / Android 10+
 */
export function useCardAnimation(
  options: UseCardAnimationOptions = {},
): CardAnimationControls {
  // flipProgress: 0 = หน้าไพ่ (front visible), 1 = หลังไพ่ (back visible)
  const flipProgress = useSharedValue<number>(0);

  // dealProgress: 0 = จุดเริ่ม (deck center), 1 = ตำแหน่งมือผู้เล่น
  const dealProgress = useSharedValue<number>(1); // เริ่มที่ 1 (แสดงอยู่แล้ว) จนกว่าจะ trigger deal

  // fold values — ควบคุม opacity + position + scale เมื่อ fold
  const foldOpacity = useSharedValue<number>(1);
  const foldTranslateY = useSharedValue<number>(0);
  const foldScale = useSharedValue<number>(1);

  // Grand Finale glow — แสงทองรอบไพ่ใบสุดท้าย
  const glowOpacity = useSharedValue<number>(0);

  // ─── DEAL ───────────────────────────────────────────────────────────────
  // ไพ่บินออกจากกองกลางโต๊ะมาที่ตำแหน่ง seat
  // delayMs — ใช้สำหรับ stagger ไพ่หลายใบพร้อมกัน
  const animateDeal = useCallback(
    (delayMs: number = 0) => {
      dealProgress.value = 0; // reset กลับไปที่ deck position
      dealProgress.value = withDelay(
        delayMs,
        withTiming(1, {
          duration: DURATION.DEAL,
          easing: Easing.out(Easing.cubic), // ออกเร็ว หยุดนุ่ม
        }, (finished) => {
          if (finished && options.onDealComplete) {
            runOnJS(options.onDealComplete)();
          }
        }),
      );
    },
    [options.onDealComplete],
  );

  // ─── FLIP ────────────────────────────────────────────────────────────────
  // พลิกไพ่ front ↔ back
  // Phase 1: หมุนถึง 90° (edge-on — ซ่อนทั้ง 2 ด้าน)
  // Phase 2: หมุนต่อจาก 90° → ปลายทาง (เปิดด้านใหม่)
  const animateFlip = useCallback(
    (toSide: CardSide, durationOverride?: number) => {
      const targetValue = toSide === 'back' ? 1 : 0;
      const halfDuration = (durationOverride ?? DURATION.FLIP) / 2;

      flipProgress.value = withSequence(
        // Phase 1: accelerate เข้าหา edge
        withTiming(0.5, {
          duration: halfDuration,
          easing: Easing.in(Easing.quad),
        }),
        // Phase 2: decelerate ออกจาก edge
        withTiming(targetValue, {
          duration: halfDuration,
          easing: Easing.out(Easing.quad),
        }, (finished) => {
          if (finished && options.onFlipComplete) {
            runOnJS(options.onFlipComplete)(toSide);
          }
        }),
      );
    },
    [options.onFlipComplete],
  );

  // ─── FOLD ────────────────────────────────────────────────────────────────
  // ไพ่เลื่อนลง + หดตัว + จางหาย เมื่อผู้เล่น fold
  const animateFold = useCallback(() => {
    // เลื่อนลงพร้อมกับหดและจางหาย (parallel animations)
    foldTranslateY.value = withTiming(40, {
      duration: DURATION.FOLD,
      easing: Easing.in(Easing.quad), // เร่งขึ้นตอนสิ้นสุด — รู้สึกหนัก
    });
    foldOpacity.value = withTiming(0, {
      duration: DURATION.FOLD,
    });
    foldScale.value = withTiming(0.8, {
      duration: DURATION.FOLD,
    }, (finished) => {
      if (finished && options.onFoldComplete) {
        runOnJS(options.onFoldComplete)();
      }
    });
  }, [options.onFoldComplete]);

  // ─── SLOW REVEAL ─────────────────────────────────────────────────────────
  // Grand Finale — flip ช้าลงทีละใบ สร้าง tension
  // cardIndex: 0-based ตำแหน่งใบที่กำลัง reveal
  // isLast: ใบสุดท้าย → trigger glow effect หลัง flip เสร็จ
  const animateSlowReveal = useCallback(
    (cardIndex: number, isLast: boolean = false) => {
      // ยิ่งใบหลังยิ่งช้า — สร้าง dramatic moment ก่อนใบสุดท้าย
      const duration =
        DURATION.SLOW_REVEAL_BASE + cardIndex * DURATION.SLOW_REVEAL_STEP;
      const halfDuration = duration / 2;

      // เริ่มจาก back (หลังไพ่คว่ำ) → flip ไปหา front (หน้าไพ่เปิด)
      flipProgress.value = 1; // เริ่มที่หลังไพ่
      flipProgress.value = withSequence(
        withTiming(0.5, {
          duration: halfDuration,
          easing: Easing.in(Easing.sine), // sine — นุ่มกว่า quad สำหรับ dramatic reveal
        }),
        withTiming(0, {
          duration: halfDuration,
          easing: Easing.out(Easing.sine),
        }, (finished) => {
          // ใบสุดท้าย: เปิด glow effect หลัง flip เสร็จสมบูรณ์
          if (finished && isLast) {
            glowOpacity.value = withSequence(
              withTiming(1, { duration: DURATION.GLOW_IN }),
              withDelay(
                DURATION.GLOW_HOLD,
                withTiming(0, { duration: DURATION.GLOW_OUT }),
              ),
            );
          }
        }),
      );
    },
    [],
  );

  // ─── ANIMATED STYLES ─────────────────────────────────────────────────────

  // หน้าไพ่ (Front Face) — มองเห็นเมื่อ flipProgress < 0.5
  // rotateY: 0deg (ตรงหน้า) → 90deg (edge-on)
  const frontStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1200 },
      {
        rotateY: `${interpolate(
          flipProgress.value,
          [0, 0.5],
          [0, 90],
          Extrapolation.CLAMP,
        )}deg`,
      },
    ],
    // opacity ตัดชัดที่จุด edge-on (0.5) — ไม่ fade เพราะ backfaceVisibility ดูแลแล้ว
    opacity: interpolate(
      flipProgress.value,
      [0, 0.49, 0.5, 1],
      [1, 1, 0, 0],
      Extrapolation.CLAMP,
    ),
    backfaceVisibility: 'hidden',
    position: 'absolute',
    top: 0,
    left: 0,
  }));

  // หลังไพ่ (Card Back) — มองเห็นเมื่อ flipProgress >= 0.5
  // rotateY: -90deg (edge-on) → 0deg (ตรงหน้า)
  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1200 },
      {
        rotateY: `${interpolate(
          flipProgress.value,
          [0.5, 1],
          [-90, 0],
          Extrapolation.CLAMP,
        )}deg`,
      },
    ],
    opacity: interpolate(
      flipProgress.value,
      [0, 0.5, 0.51, 1],
      [0, 0, 1, 1],
      Extrapolation.CLAMP,
    ),
    backfaceVisibility: 'hidden',
    position: 'absolute',
    top: 0,
    left: 0,
  }));

  // deal animation — scale + translateY จาก deck position
  const dealStyle = useAnimatedStyle(() => ({
    opacity: dealProgress.value,
    transform: [
      {
        scale: interpolate(
          dealProgress.value,
          [0, 1],
          [0.5, 1],
          Extrapolation.CLAMP,
        ),
      },
      {
        translateY: interpolate(
          dealProgress.value,
          [0, 1],
          [-100, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  // fold animation — translateY + scale + opacity
  const foldStyle = useAnimatedStyle(() => ({
    opacity: foldOpacity.value,
    transform: [
      { translateY: foldTranslateY.value },
      { scale: foldScale.value },
    ],
  }));

  // Grand Finale glow overlay — แสงทองรอบไพ่
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return {
    animateDeal,
    animateFlip,
    animateFold,
    animateSlowReveal,
    frontStyle,
    backStyle,
    dealStyle,
    foldStyle,
    glowStyle,
    flipProgress,
    dealProgress,
  };
}
