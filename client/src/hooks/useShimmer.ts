import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
  interpolate,
  Extrapolation,
  cancelAnimation,
} from 'react-native-reanimated';
import { useCallback, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// ✨  REFLECTION SWEEP (Fake Shimmer)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * useReflectionSweep
 * แสงขาวโปร่งใสวิ่งผ่าน component จากซ้ายไปขวา — ฟีล "premium UI" ทันที
 * ใช้ gradient ขาวเฉียง 30° + translateX animation
 *
 * ใช้กับ:
 *   - ปุ่ม Call ใน Grand Finale (loop ช้าๆ ดึงตา)
 *   - ไพ่ใบที่เพิ่ง flip เปิด (1 ครั้ง)
 *   - Eye of the Demon icon (loop เมื่อ available)
 *   - Token balance เพิ่มขึ้น (1 ครั้ง)
 *   - LootBox เปิด (1 ครั้ง ก่อน reveal item)
 *
 * วิธีใช้:
 *   const { shimmerStyle, sweep, startLoopSweep, stopSweep } = useReflectionSweep({ width: 120 });
 *
 *   // ครอบ component ที่ต้องการ shimmer
 *   <View style={{ overflow: 'hidden', borderRadius: 8 }}>
 *     <YourComponent />
 *     <Animated.View style={[styles.shimmerOverlay, shimmerStyle]} pointerEvents="none" />
 *   </View>
 *
 * IMPORTANT: parent ต้อง overflow: 'hidden' เพื่อ clip shimmer ที่ขอบ
 */

export interface ReflectionSweepOptions {
  width: number;          // ความกว้างของ component (px) — ใช้คำนวณ travel distance
  shimmerWidth?: number;  // ความกว้างของแสง shimmer (px) — default 60
  duration?: number;      // ms ต่อ 1 sweep — default 700
  angle?: number;         // องศาเอียงของแสง — default 25 (ไม่ใช้จริงใน RN แต่ reference)
  opacity?: number;       // ความเข้มสูงสุดของแสง — default 0.35
}

export interface ReflectionSweepControls {
  shimmerStyle: ReturnType<typeof useAnimatedStyle>;
  sweep: (onComplete?: () => void) => void;         // sweep 1 ครั้ง
  startLoopSweep: (intervalMs?: number) => void;    // sweep วนซ้ำ (ปุ่ม Call)
  stopSweep: () => void;
}

export function useReflectionSweep(options: ReflectionSweepOptions): ReflectionSweepControls {
  const {
    width,
    shimmerWidth = 60,
    duration     = 700,
    opacity      = 0.35,
  } = options;

  // translateX: เริ่มซ้ายนอกขอบ → วิ่งผ่าน → หายขวา
  const translateX = useSharedValue<number>(-(shimmerWidth + 20));
  const shimmerOpacity = useSharedValue<number>(0);

  // loop interval ref
  const loopTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const sweep = useCallback((onComplete?: () => void) => {
    const travelDistance = width + shimmerWidth + 40; // +40 buffer ขอบ

    // fade in shimmer พร้อม sweep
    shimmerOpacity.value = withTiming(1, { duration: 80 });

    translateX.value = -(shimmerWidth + 20); // reset position
    translateX.value = withTiming(travelDistance, {
      duration,
      easing: Easing.inOut(Easing.quad),
    }, (finished) => {
      if (finished) {
        shimmerOpacity.value = withTiming(0, { duration: 80 });
      }
    });

    if (onComplete) {
      setTimeout(onComplete, duration + 100);
    }
  }, [width, shimmerWidth, duration]);

  const startLoopSweep = useCallback((intervalMs: number = 2500) => {
    // sweep ครั้งแรกทันที
    sweep();
    // แล้ว loop ตาม interval
    loopTimer.current = setInterval(() => {
      sweep();
    }, intervalMs);
  }, [sweep]);

  const stopSweep = useCallback(() => {
    if (loopTimer.current) {
      clearInterval(loopTimer.current);
      loopTimer.current = null;
    }
    cancelAnimation(translateX);
    shimmerOpacity.value = withTiming(0, { duration: 200 });
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: shimmerWidth,
    opacity: shimmerOpacity.value * opacity,
    transform: [{ translateX: translateX.value }],
    // gradient สีขาว fade in-out จากซ้ายไปขวา
    // ใช้ backgroundColor แทน LinearGradient เพื่อลด dependency
    // (ถ้าต้องการ gradient จริงๆ ให้ใช้ expo-linear-gradient ครอบแทน)
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    // skew เลียน gradient เฉียง
    transform: [
      { translateX: translateX.value },
      { skewX: '-20deg' },
    ],
  }));

  return { shimmerStyle, sweep, startLoopSweep, stopSweep };
}


// ─────────────────────────────────────────────────────────────────────────────
// 💨  TRAIL AFTERIMAGE
// ─────────────────────────────────────────────────────────────────────────────
/**
 * useTrailAfterimage
 * สร้าง "เงาตามหลัง" ให้ object ที่กำลังเคลื่อนที่ — ฟีล เร็ว / แรง
 * ใช้วิธี clone positions ที่ delay ออกไปเรื่อยๆ พร้อม opacity ลดลง
 *
 * ใช้กับ:
 *   - ไพ่บินออกจากกอง (Deal animation) — trail 3 เงา
 *   - Alliance of Fate ไพ่สลับข้าม seat — trail ยาวตาม path
 *   - Fortune's Spin รูเล็ตหมุน — trail วงกลม
 *   - Hourglass Shatter พุ่งใส่ timer — trail ตามทิศทาง
 *
 * วิธีใช้:
 *   const { trails, recordPosition, clearTrails } = useTrailAfterimage({ count: 3 });
 *
 *   // render trails ก่อน object จริง (ให้ object จริงอยู่บนสุด)
 *   {trails.map((trail, i) => (
 *     <Animated.View key={i} style={[styles.card, trail.style]} />
 *   ))}
 *   <Animated.View style={[styles.card, mainStyle]} />  ← object จริง
 *
 *   // เรียก recordPosition ทุก frame ใน animation callback
 *   // หรือใช้ trailStyle ที่ auto-calculate จาก mainX/mainY
 */

export interface TrailConfig {
  count?: number;          // จำนวน trail ghost — default 3
  delayPerTrail?: number;  // ms delay ระหว่าง trail แต่ละอัน — default 40
  opacityDecay?: number;   // opacity ลดลงต่อ trail (0-1) — default 0.25
  scaleDecay?: number;     // scale ลดลงต่อ trail — default 0.05
}

export interface TrailItem {
  translateX: ReturnType<typeof useSharedValue<number>>;
  translateY: ReturnType<typeof useSharedValue<number>>;
  opacity: ReturnType<typeof useSharedValue<number>>;
  scale: ReturnType<typeof useSharedValue<number>>;
  style: ReturnType<typeof useAnimatedStyle>;
}

export interface TrailAfterimageControls {
  trails: TrailItem[];
  // ใช้ร่วมกับ card deal animation
  // เรียก startTrail เมื่อ deal เริ่ม → trails จะ follow อัตโนมัติ
  startTrail: (
    fromX: number, fromY: number,
    toX: number, toY: number,
    duration: number,
  ) => void;
  clearTrails: () => void;
}

export function useTrailAfterimage(config: TrailConfig = {}): TrailAfterimageControls {
  const {
    count        = 3,
    delayPerTrail = 50,
    opacityDecay  = 0.25,
    scaleDecay    = 0.04,
  } = config;

  // สร้าง shared values สำหรับ trail แต่ละอัน
  const trails: TrailItem[] = Array.from({ length: count }, (_, i) => {
    const translateX = useSharedValue<number>(0);
    const translateY = useSharedValue<number>(0);
    const opacity    = useSharedValue<number>(0);
    const scale      = useSharedValue<number>(1 - i * scaleDecay);

    const trailOpacity    = (1 - i * opacityDecay) * 0.6; // trail แรกชัดสุด
    const trailScaleDecay = scaleDecay;
    const idx = i;

    const style = useAnimatedStyle(() => ({
      position: 'absolute',
      opacity: opacity.value,
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    }));

    return { translateX, translateY, opacity, scale, style };
  });

  const startTrail = useCallback((
    fromX: number, fromY: number,
    toX: number, toY: number,
    duration: number,
  ) => {
    const dx = toX - fromX;
    const dy = toY - fromY;

    trails.forEach((trail, i) => {
      const delay       = i * delayPerTrail;
      const maxOpacity  = Math.max(0, (1 - i * opacityDecay) * 0.55);
      const trailDuration = duration + delay;

      // trail เริ่มที่ fromX/Y แล้วตามไปหา to แต่ไม่ถึง (หยุดก่อน)
      // ยิ่ง trail ไกล ยิ่งตามช้า และหยุดเร็วกว่า
      const arrivalRatio = 1 - (i + 1) * 0.2; // trail 0 ไปถึง 80%, trail 2 ไปถึง 40%

      trail.translateX.value = fromX;
      trail.translateY.value = fromY;

      // fade in พร้อม start
      trail.opacity.value = withDelay(
        delay,
        withSequence(
          withTiming(maxOpacity, { duration: 60 }),
          withDelay(
            trailDuration * 0.6,
            withTiming(0, { duration: trailDuration * 0.4, easing: Easing.in(Easing.quad) }),
          ),
        ),
      );

      // เคลื่อนที่ตาม main object แต่ช้ากว่า
      trail.translateX.value = withDelay(
        delay,
        withTiming(fromX + dx * arrivalRatio, {
          duration: trailDuration,
          easing: Easing.out(Easing.cubic),
        }),
      );
      trail.translateY.value = withDelay(
        delay,
        withTiming(fromY + dy * arrivalRatio, {
          duration: trailDuration,
          easing: Easing.out(Easing.cubic),
        }),
      );
    });
  }, [trails, delayPerTrail, opacityDecay]);

  const clearTrails = useCallback(() => {
    trails.forEach((trail) => {
      cancelAnimation(trail.opacity);
      cancelAnimation(trail.translateX);
      cancelAnimation(trail.translateY);
      trail.opacity.value = withTiming(0, { duration: 150 });
    });
  }, [trails]);

  return { trails, startTrail, clearTrails };
}


// ─────────────────────────────────────────────────────────────────────────────
// 📖 Combined Export + Usage Guide
// ─────────────────────────────────────────────────────────────────────────────
/*
  TriplePoker — useShimmer Integration Map
  =========================================

  ✨ useReflectionSweep
  ─────────────────────
  GrandFinale.tsx — ปุ่ม Call:
    const shimmer = useReflectionSweep({ width: callButtonWidth });
    useEffect(() => { shimmer.startLoopSweep(2500); }, []);
    // ครอบปุ่ม Call ด้วย overflow:'hidden' แล้วใส่ shimmerStyle overlay

  Card.tsx — หลัง flip เปิด:
    onFlipComplete={() => shimmer.sweep()}

  hud/FunItems.tsx — Eye of the Demon available:
    itemAvailable && shimmer.startLoopSweep(3000);
    !itemAvailable && shimmer.stopSweep();

  shop/LootBoxReveal.tsx — ก่อน reveal item:
    shimmer.sweep(() => triggerItemReveal());

  retention/StreakUI.tsx — Token balance เพิ่ม:
    socket.on('token_updated', ({ delta }) => {
      if (delta > 0) shimmer.sweep();
    });

  💨 useTrailAfterimage
  ─────────────────────
  Card.tsx — Deal animation:
    const trail = useTrailAfterimage({ count: 3, delayPerTrail: 45 });
    // เรียกใน animateDeal:
    trail.startTrail(deckX, deckY, seatX, seatY, DURATION.DEAL);
    // render trails ก่อน Card component

  items/allianceOfFate — ไพ่สลับ seat:
    trail.startTrail(seatAX, seatAY, seatBX, seatBY, 600);

  hud/FunItems.tsx — Hourglass Shatter icon พุ่ง:
    trail.startTrail(hudX, hudY, timerX, timerY, 400);

  shop/LootBoxReveal.tsx — Fortune's Spin:
    // trail บน spin indicator (circular path)
    trail.startTrail(spinCenterX, spinCenterY - r, spinCenterX, spinCenterY + r, 800);
*/
