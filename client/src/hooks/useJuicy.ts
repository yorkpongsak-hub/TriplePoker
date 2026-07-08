import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withSpring,
  withDelay,
  Easing,
  interpolate,
  Extrapolation,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import { useCallback, useRef, useEffect } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// 🫁  BREATHING UI
// ─────────────────────────────────────────────────────────────────────────────
/**
 * useBreathing
 * scale ขยาย-หดเบาๆ ต่อเนื่อง — ให้ UI รู้สึก "มีชีวิต" ไม่แข็ง
 *
 * ใช้กับ:
 *   - ปุ่ม Ready (ArrangementPhase) — ดึงให้กด
 *   - Chrono Shard icon เมื่อ active
 *   - Alliance of Fate รอรับสัญญาณ (breath เร็วขึ้นตาม countdown)
 *   - Avatar ผู้เล่นที่กำลังคิด — ลด tension
 *
 * วิธีใช้:
 *   const { breathStyle, startBreathing, stopBreathing, setBreathSpeed } = useBreathing();
 *   <Animated.View style={[styles.readyBtn, breathStyle]}>...</Animated.View>
 */

export type BreathSpeed = 'slow' | 'normal' | 'fast' | 'panic';

const BREATH_DURATION: Record<BreathSpeed, number> = {
  slow:   2400,  // avatar คิด — ผ่อนคลาย
  normal: 1800,  // ปุ่ม Ready ปกติ
  fast:   1000,  // Alliance of Fate รอรับ — ใกล้หมดเวลา
  panic:  500,   // timer < 3 วิ — เร่งด่วน
};

const BREATH_SCALE: Record<BreathSpeed, number> = {
  slow:   1.03,
  normal: 1.05,
  fast:   1.07,
  panic:  1.09,
};

export interface BreathingControls {
  breathStyle: ReturnType<typeof useAnimatedStyle>;
  startBreathing: (speed?: BreathSpeed) => void;
  stopBreathing: (snapToScale?: number) => void;
  setBreathSpeed: (speed: BreathSpeed) => void;  // เปลี่ยน speed โดยไม่หยุด
}

export function useBreathing(): BreathingControls {
  const scale        = useSharedValue<number>(1);
  const currentSpeed = useRef<BreathSpeed>('normal');

  const startBreathing = useCallback((speed: BreathSpeed = 'normal') => {
    currentSpeed.current = speed;
    const duration = BREATH_DURATION[speed];
    const peak     = BREATH_SCALE[speed];

    scale.value = withRepeat(
      withSequence(
        withTiming(peak,  { duration: duration / 2, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.0,   { duration: duration / 2, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,   // repeat ตลอด
      false,
    );
  }, []);

  const stopBreathing = useCallback((snapToScale: number = 1) => {
    cancelAnimation(scale);
    scale.value = withSpring(snapToScale, { damping: 15, stiffness: 200 });
  }, []);

  const setBreathSpeed = useCallback((speed: BreathSpeed) => {
    // หยุด animation เดิม แล้วเริ่มใหม่ที่ speed ใหม่ทันที
    cancelAnimation(scale);
    currentSpeed.current = speed;
    const duration = BREATH_DURATION[speed];
    const peak     = BREATH_SCALE[speed];

    scale.value = withRepeat(
      withSequence(
        withTiming(peak, { duration: duration / 2, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.0,  { duration: duration / 2, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, []);

  const breathStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return { breathStyle, startBreathing, stopBreathing, setBreathSpeed };
}


// ─────────────────────────────────────────────────────────────────────────────
// 🎮  WIGGLE / ELASTIC BOUNCE
// ─────────────────────────────────────────────────────────────────────────────
/**
 * useWiggle
 * scale overshoot + rotate นิดๆ — ฟีล "juicy game" มาก
 *
 * ใช้กับ:
 *   - ได้รับ item จาก LootBox (item icon เด้งออกมา)
 *   - กดปุ่ม Call / Fold (ปุ่มสะดุ้ง feedback)
 *   - ไพ่ swap ใน ArrangementPhase (ไพ่ 2 ใบ wiggle เข้าหากัน)
 *   - Streak Shield ป้องกันสำเร็จ (shield icon เด้ง)
 *   - Hourglass Shatter โดน (timer bar กระตุก)
 *
 * วิธีใช้:
 *   const { wiggleStyle, wiggle, bounce } = useWiggle();
 *   <Animated.View style={[styles.itemIcon, wiggleStyle]}>...</Animated.View>
 *   <Pressable onPress={() => { wiggle(); handlePress(); }}>
 */

export type WiggleIntensity = 'light' | 'medium' | 'heavy';

const WIGGLE_CONFIG: Record<WiggleIntensity, {
  scalePeak: number;
  rotateDeg: number;
  duration: number;
}> = {
  light:  { scalePeak: 1.15, rotateDeg: 5,  duration: 350 },  // กดปุ่ม
  medium: { scalePeak: 1.25, rotateDeg: 8,  duration: 450 },  // ได้ item
  heavy:  { scalePeak: 1.40, rotateDeg: 12, duration: 550 },  // jackpot / shield
};

export interface WiggleControls {
  wiggleStyle: ReturnType<typeof useAnimatedStyle>;
  wiggle: (intensity?: WiggleIntensity, onComplete?: () => void) => void;
  bounce: (onComplete?: () => void) => void;    // pure scale bounce ไม่ rotate
  press: () => void;                            // quick press feedback (scale down → up)
}

export function useWiggle(): WiggleControls {
  const scale  = useSharedValue<number>(1);
  const rotate = useSharedValue<number>(0); // degrees

  const wiggle = useCallback((
    intensity: WiggleIntensity = 'medium',
    onComplete?: () => void,
  ) => {
    const { scalePeak, rotateDeg, duration } = WIGGLE_CONFIG[intensity];
    const step = duration / 6; // แบ่ง 6 phase

    // Scale: 1 → peak → undershoot → 1.05 → 0.98 → 1
    scale.value = withSequence(
      withSpring(scalePeak,  { damping: 5,  stiffness: 400 }),
      withSpring(0.92,       { damping: 8,  stiffness: 300 }),
      withSpring(1.05,       { damping: 10, stiffness: 250 }),
      withSpring(1.0,        { damping: 12, stiffness: 200 }, (finished) => {
        if (finished && onComplete) runOnJS(onComplete)();
      }),
    );

    // Rotate: 0 → +deg → -deg → +deg/2 → 0 (elastic wiggle)
    rotate.value = withSequence(
      withTiming( rotateDeg,      { duration: step, easing: Easing.out(Easing.quad) }),
      withTiming(-rotateDeg,      { duration: step * 1.2 }),
      withTiming( rotateDeg * 0.5,{ duration: step }),
      withTiming(-rotateDeg * 0.3,{ duration: step }),
      withTiming(0,               { duration: step, easing: Easing.out(Easing.quad) }),
    );
  }, []);

  // Bounce — pure scale ไม่มี rotate (ใช้กับ token / XP number)
  const bounce = useCallback((onComplete?: () => void) => {
    scale.value = withSequence(
      withSpring(1.3,  { damping: 4,  stiffness: 500 }),
      withSpring(0.9,  { damping: 8,  stiffness: 300 }),
      withSpring(1.05, { damping: 10, stiffness: 250 }),
      withSpring(1.0,  { damping: 15, stiffness: 200 }, (finished) => {
        if (finished && onComplete) runOnJS(onComplete)();
      }),
    );
  }, []);

  // Press — tap feedback: scale down แล้วกลับ (เร็วมาก)
  const press = useCallback(() => {
    scale.value = withSequence(
      withTiming(0.92, { duration: 80,  easing: Easing.in(Easing.quad) }),
      withSpring(1.0,  { damping: 10, stiffness: 400 }),
    );
  }, []);

  const wiggleStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { rotate: `${rotate.value}deg` },
    ],
  }));

  return { wiggleStyle, wiggle, bounce, press };
}


// ─────────────────────────────────────────────────────────────────────────────
// 🎰  SLOT MACHINE TICK
// ─────────────────────────────────────────────────────────────────────────────
/**
 * useSlotTick
 * นับตัวเลขทีละ step พร้อม easing — เร่งตอนกลาง ช้าตอนหยุด
 * สมองคนชอบมาก — dopamine จาก anticipation
 *
 * ใช้กับ:
 *   - Fortune's Spin สุ่ม Token 50–200 (spin แล้วหยุดที่ผล)
 *   - XP bar fill เมื่อ Level Up (นับ XP ทีละ tick เร็วขึ้น)
 *   - Token counter หลังจบ match (นับ +/- แบบ tick)
 *   - LootBox reveal (slot หมุนก่อน reveal item)
 *
 * วิธีใช้:
 *   const { displayValue, isRunning, startTick, stopTick } = useSlotTick();
 *
 *   // Token counter
 *   startTick({ from: 1000, to: 1350, duration: 1200 });
 *   <Text>{displayValue.toLocaleString()}</Text>
 *
 *   // Fortune's Spin — สุ่มแสดงค่าก่อนหยุด
 *   startTick({ from: 0, to: result, duration: 2000, mode: 'slot' });
 */

export type SlotTickMode =
  | 'counter'   // นับตรงๆ from → to
  | 'slot'      // สุ่มค่าระหว่างทางก่อนหยุดที่ผล (Fortune's Spin)
  | 'xp';       // เร่งขึ้นเรื่อยๆ แล้วค่อยชะลอ

export interface SlotTickOptions {
  from: number;
  to: number;
  duration?: number;       // ms รวม — default 1200
  mode?: SlotTickMode;
  stepSize?: number;       // กระโดดทีละเท่าไหร่ — default auto
  onComplete?: (finalValue: number) => void;
  onTick?: (currentValue: number) => void;  // callback ทุก tick (เล่นเสียง)
}

export interface SlotTickControls {
  displayValue: number;               // ค่าที่ควรแสดงบนหน้าจอ (update ทุก tick)
  isRunning: boolean;
  startTick: (options: SlotTickOptions) => void;
  stopTick: () => void;
  // shared value สำหรับ animate ตัวเลขด้วย (ใช้คู่กับ useAnimatedStyle ถ้าต้องการ)
  tickProgress: ReturnType<typeof useSharedValue<number>>;
}

export function useSlotTick(): SlotTickControls {
  const tickProgress = useSharedValue<number>(0);
  const displayValueRef = useRef<number>(0);
  const isRunningRef    = useRef<boolean>(false);
  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameRef        = useRef<number>(0);

  // ใช้ ref แทน state เพื่อ performance — component อื่นอ่านผ่าน displayValue getter
  const getDisplayValue = useCallback(() => displayValueRef.current, []);
  const getIsRunning    = useCallback(() => isRunningRef.current, []);

  const stopTick = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    isRunningRef.current = false;
  }, []);

  const startTick = useCallback((options: SlotTickOptions) => {
    const {
      from,
      to,
      duration   = 1200,
      mode       = 'counter',
      onComplete,
      onTick,
    } = options;

    stopTick(); // ยกเลิก tick เดิมก่อน

    const range     = to - from;
    const isIncrease = range > 0;
    const absRange  = Math.abs(range);

    // คำนวณ step size — auto ให้ประมาณ 30–60 steps
    const targetSteps = Math.min(60, Math.max(20, Math.floor(absRange / 5)));
    const stepSize    = options.stepSize ?? Math.ceil(absRange / targetSteps);
    const intervalMs  = Math.floor(duration / targetSteps);

    isRunningRef.current  = true;
    displayValueRef.current = from;
    frameRef.current      = 0;

    // tickProgress animation — ใช้สำหรับ animated style ถ้าต้องการ
    tickProgress.value = 0;
    tickProgress.value = withTiming(1, {
      duration,
      easing: mode === 'xp'
        ? Easing.in(Easing.quad)      // XP: เร่งขึ้น
        : Easing.out(Easing.cubic),   // Counter/Slot: ชะลอตอนจบ
    });

    timerRef.current = setInterval(() => {
      frameRef.current += 1;
      const progress = frameRef.current / targetSteps;

      let currentValue: number;

      if (mode === 'slot') {
        // Fortune's Spin mode — สุ่มค่าในช่วงก่อนหยุดที่ผล
        if (progress < 0.75) {
          // สุ่มในช่วง 50% รอบๆ ค่าจริง
          const jitter = (Math.random() - 0.5) * absRange * 0.8;
          currentValue = Math.round(from + jitter);
          // clamp ให้อยู่ใน valid range
          currentValue = Math.max(
            Math.min(from, to),
            Math.min(Math.max(from, to), currentValue),
          );
        } else {
          // 25% สุดท้าย — เข้าหาค่าจริง
          const ease = (progress - 0.75) / 0.25; // 0→1
          currentValue = Math.round(from + range * ease);
        }
      } else if (mode === 'xp') {
        // XP mode — tick เร่งขึ้นด้วย ease-in
        const ease = Math.pow(progress, 2);
        currentValue = Math.round(from + range * ease);
      } else {
        // Counter mode — linear แต่ชะลอตอนจบ
        const ease = 1 - Math.pow(1 - progress, 2);
        currentValue = Math.round(from + range * ease);
      }

      displayValueRef.current = currentValue;
      onTick?.(currentValue);

      // หยุดเมื่อถึงจุดสิ้นสุด
      if (frameRef.current >= targetSteps) {
        displayValueRef.current = to;
        stopTick();
        onComplete?.(to);
      }
    }, intervalMs);
  }, [stopTick]);

  return {
    get displayValue() { return displayValueRef.current; },
    get isRunning()    { return isRunningRef.current; },
    startTick,
    stopTick,
    tickProgress,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// 🎮  COMBINED HOOK — useJuicy
// ─────────────────────────────────────────────────────────────────────────────
/**
 * useJuicy
 * รวม Breathing + Wiggle + SlotTick ไว้ด้วยกัน
 * สำหรับ component ที่ต้องการทุก effect (เช่น Fortune's Spin screen)
 *
 * วิธีใช้:
 *   const juicy = useJuicy();
 *
 *   // ปุ่ม Ready
 *   juicy.breathing.startBreathing('normal');
 *   <Animated.View style={juicy.breathing.breathStyle}>
 *     <ReadyButton />
 *   </Animated.View>
 *
 *   // กดรับ item
 *   juicy.wiggle.wiggle('heavy');
 *   <Animated.View style={juicy.wiggle.wiggleStyle}>
 *     <ItemIcon />
 *   </Animated.View>
 *
 *   // Token counter
 *   juicy.slot.startTick({ from: 1000, to: 1500, duration: 1500 });
 *   <Text>{juicy.slot.displayValue.toLocaleString()}</Text>
 */
export interface JuicyControls {
  breathing: BreathingControls;
  wiggle:    WiggleControls;
  slot:      SlotTickControls;
}

export function useJuicy(): JuicyControls {
  const breathing = useBreathing();
  const wiggle    = useWiggle();
  const slot      = useSlotTick();
  return { breathing, wiggle, slot };
}

// ─────────────────────────────────────────────────────────────────────────────
// 📖 Integration Guide
// ─────────────────────────────────────────────────────────────────────────────
/*
  TriplePoker — useJuicy Integration Map
  =======================================

  🫁 Breathing
  ─────────────
  ArrangementPhase.tsx — ปุ่ม Ready:
    useEffect(() => { breathing.startBreathing('normal'); }, []);
    // หยุดเมื่อกด Ready
    onPress={() => { breathing.stopBreathing(); handleReady(); }}

  hud/CompetitiveItems.tsx — Chrono Shard active:
    chronoActive && breathing.startBreathing('fast');
    !chronoActive && breathing.stopBreathing();

  items/allianceOfFate — รอรับสัญญาณ (countdown 3 วิ):
    // เร่ง breath ตาม countdown
    if (countdown <= 1) breathing.setBreathSpeed('panic');
    else if (countdown <= 2) breathing.setBreathSpeed('fast');

  🎮 Wiggle / Bounce
  ───────────────────
  shop/LootBoxReveal.tsx — item reveal:
    onItemRevealed={() => wiggle.wiggle('heavy')}

  GrandFinale.tsx — ปุ่ม Call กด:
    onPress={() => { wiggle.press(); handleCall(); }}

  ArrangementPhase.tsx — swap ไพ่:
    onSwap={() => { wiggleCardA.wiggle('light'); wiggleCardB.wiggle('light'); }}

  hud/FunItems.tsx — Streak Shield สกัดสำเร็จ:
    onShieldActivated={() => wiggle.wiggle('heavy')}

  hud/FunItems.tsx — Hourglass Shatter โดน:
    onHourglassHit={() => wiggle.bounce()}

  🎰 Slot Tick
  ─────────────
  shop/LootBoxReveal.tsx — Fortune's Spin:
    slot.startTick({
      from: 50, to: result, duration: 2000, mode: 'slot',
      onTick: (v) => Sound.play('tick'),           // เสียง tick ทุก step
      onComplete: (v) => Sound.play('slot_stop'),  // เสียงหยุด
    });
    <Text style={styles.spinResult}>{slot.displayValue}</Text>

  progression/XPBar.tsx — Level Up:
    slot.startTick({
      from: currentXP, to: newXP, duration: 1800, mode: 'xp',
      onComplete: () => { if (leveledUp) triggerLevelUpVFX(); }
    });

  EndOfMatch.tsx — Token counter หลังจบ:
    slot.startTick({
      from: tokenBefore, to: tokenAfter, duration: 1500, mode: 'counter',
      onTick: (v) => floatRef.current?.spawnToken(v - tokenBefore, x, y),
    });
*/
