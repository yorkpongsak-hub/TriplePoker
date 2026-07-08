// ─────────────────────────────────────────────────────────────────────────────
// useTimer.ts — Countdown Timer Hook
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────
// รองรับ:
//   • นับถอยหลัง + callback เมื่อหมดเวลา
//   • color state: green → yellow (30%) → red + haptic (10%)
//   • extend เวลาได้ (item ต่อเวลา)

import { useState, useEffect, useRef, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { COLORS } from '../constants/gameConstants';

export type TimerColor = 'green' | 'yellow' | 'red';

interface UseTimerOptions {
  totalSec: number;
  onExpire?: () => void;
  autoStart?: boolean;
}

interface TimerState {
  remaining: number;       // วินาทีที่เหลือ
  progress: number;        // 0.0 – 1.0 (1.0 = เต็ม)
  color: TimerColor;
  isRunning: boolean;
  barColor: string;
}

export function useTimer({ totalSec, onExpire, autoStart = true }: UseTimerOptions) {
  const [remaining, setRemaining] = useState(totalSec);
  const [isRunning, setIsRunning] = useState(autoStart);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  // ── คำนวณ Color State ─────────────────────────────────────────────────────

  const getColor = (rem: number, total: number): TimerColor => {
    const ratio = rem / total;
    if (ratio > 0.3) return 'green';
    if (ratio > 0.1) return 'yellow';
    return 'red';
  };

  const getBarColor = (color: TimerColor): string => {
    switch (color) {
      case 'green':  return COLORS.winGreen;
      case 'yellow': return '#F59E0B';
      case 'red':    return COLORS.loseRed;
    }
  };

  const color = getColor(remaining, totalSec);

  // ── Timer Logic ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isRunning) return;

    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        const next = prev - 1;

        // Haptic เมื่อเข้า Red Zone
        if (getColor(next, totalSec) === 'red' && getColor(prev, totalSec) !== 'red') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
        }

        if (next <= 0) {
          clearInterval(intervalRef.current!);
          setIsRunning(false);
          onExpireRef.current?.();
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(intervalRef.current!);
  }, [isRunning, totalSec]);

  // ── Controls ──────────────────────────────────────────────────────────────

  const start = useCallback(() => setIsRunning(true), []);

  const pause = useCallback(() => {
    setIsRunning(false);
    clearInterval(intervalRef.current!);
  }, []);

  const reset = useCallback((newTotal?: number) => {
    clearInterval(intervalRef.current!);
    setRemaining(newTotal ?? totalSec);
    setIsRunning(autoStart);
  }, [totalSec, autoStart]);

  /** Extend เวลา (item ต่อเวลา) */
  const extend = useCallback((extraSec: number) => {
    setRemaining(prev => prev + extraSec);
  }, []);

  const state: TimerState = {
    remaining,
    progress: totalSec > 0 ? remaining / totalSec : 0,
    color,
    isRunning,
    barColor: getBarColor(color),
  };

  return { ...state, start, pause, reset, extend };
}
