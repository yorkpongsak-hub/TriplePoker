import React, { useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useAnimatedReaction,
} from 'react-native-reanimated';
import {
  useFloatingText,
  FloatingTextItem,
  SpawnOptions,
  UseFloatingTextReturn,
  PopupPresetKey,
} from '../../hooks/useFloatingText';

// ─────────────────────────────────────────────────────────────────────────────
// FloatingTextLayer Ref Interface
// ─────────────────────────────────────────────────────────────────────────────
// ให้ parent (GameTable, GrandFinale ฯลฯ) สั่ง spawn ได้โดยตรงผ่าน ref
export interface FloatingTextLayerRef {
  spawn: UseFloatingTextReturn['spawn'];
  spawnXP: UseFloatingTextReturn['spawnXP'];
  spawnToken: UseFloatingTextReturn['spawnToken'];
  spawnFoul: UseFloatingTextReturn['spawnFoul'];
  spawnJackpot: UseFloatingTextReturn['spawnJackpot'];
  spawnPerfect: UseFloatingTextReturn['spawnPerfect'];
  spawnStreak: UseFloatingTextReturn['spawnStreak'];
}

// ─────────────────────────────────────────────────────────────────────────────
// Single Floating Text Item Component
// ─────────────────────────────────────────────────────────────────────────────
// แยก component เพื่อให้แต่ละ item animate อิสระจากกัน
const FloatingItem: React.FC<{ item: FloatingTextItem }> = ({ item }) => {
  const { config, text, x, y, opacity, translateY, scale } = item;

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.itemContainer,
        {
          left: x,
          top: y,
        },
        animStyle,
      ]}
      pointerEvents="none"
    >
      <Text
        style={[
          styles.itemText,
          {
            color: config.color,
            fontSize: config.fontSize,
            fontWeight: config.fontWeight,
            // drop shadow สีเดียวกับ text — glow ราคาถูก
            textShadowColor: config.shadowColor,
            textShadowOffset: { width: 0, height: 0 },
            textShadowRadius: 10,
          },
        ]}
      >
        {text}
      </Text>
    </Animated.View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// FloatingTextLayer
// ─────────────────────────────────────────────────────────────────────────────
/**
 * FloatingTextLayer
 * วางเป็น absolute overlay บน GameTable — รับ event จาก socket/store แล้ว spawn
 *
 * วิธีใช้ใน GameTable.tsx:
 *
 *   const floatRef = useRef<FloatingTextLayerRef>(null);
 *
 *   // เมื่อได้รับ socket event
 *   socket.on('foul_detected', ({ x, y }) => {
 *     floatRef.current?.spawnFoul(x, y);
 *   });
 *
 *   socket.on('pile_won', ({ amount, seatX, seatY }) => {
 *     floatRef.current?.spawnToken(amount, seatX, seatY);
 *   });
 *
 *   // วาง layer บน component tree
 *   <View style={styles.tableContainer}>
 *     <GameTable ... />
 *     <FloatingTextLayer ref={floatRef} />
 *   </View>
 *
 * Architecture:
 *   - Layer นี้ pointerEvents="none" ตลอด — ไม่บล็อก touch ด้านล่าง
 *   - subscribe `version` shared value เพื่อ sync items ลง React state
 *   - แต่ละ item animate อิสระบน UI thread — ไม่มี re-render ระหว่าง animate
 */
const FloatingTextLayer = forwardRef<FloatingTextLayerRef>((_, ref) => {
  const vfx = useFloatingText();
  const [renderItems, setRenderItems] = useState<FloatingTextItem[]>([]);

  // subscribe version → sync items list ลง React state เพื่อ render
  // ใช้ useAnimatedReaction แทน useEffect เพราะ version เป็น shared value
  useAnimatedReaction(
    () => vfx.version.value,
    () => {
      // copy items array ลง state เพื่อ trigger re-render
      // (ref array ตัวจริงไม่ trigger render โดยตรง)
      setRenderItems([...vfx.items.current]);
    },
  );

  // expose spawner methods ให้ parent ผ่าน ref
  useImperativeHandle(ref, () => ({
    spawn:        vfx.spawn,
    spawnXP:      vfx.spawnXP,
    spawnToken:   vfx.spawnToken,
    spawnFoul:    vfx.spawnFoul,
    spawnJackpot: vfx.spawnJackpot,
    spawnPerfect: vfx.spawnPerfect,
    spawnStreak:  vfx.spawnStreak,
  }));

  return (
    // pointerEvents="none" — layer โปร่งใสต่อ touch ทุกกรณี
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {renderItems.map((item) => (
        <FloatingItem key={item.id} item={item} />
      ))}
    </View>
  );
});

FloatingTextLayer.displayName = 'FloatingTextLayer';
export default FloatingTextLayer;

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  itemContainer: {
    position: 'absolute',
    // center text ที่ x coordinate
    transform: [{ translateX: -60 }], // offset ครึ่งหนึ่งของ width สมมติ
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  itemText: {
    textAlign: 'center',
    // ป้องกัน text ถูกตัด
    includeFontPadding: false,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 📖 Integration Guide
// ─────────────────────────────────────────────────────────────────────────────
/*
  TRIGGER MAP — TriplePoker Socket Events → FloatingTextLayer
  ============================================================

  socket.on('foul_detected')
    → floatRef.current?.spawnFoul(screenCenterX, screenCenterY)

  socket.on('pile_resolved', { winnerId, tokenDelta, pileIndex })
    → floatRef.current?.spawnToken(tokenDelta, seatX, seatY - 40)

  socket.on('xp_earned', { amount })
    → floatRef.current?.spawnXP(amount, screenCenterX, xpBarY - 20)

  socket.on('fortune_spin_result', { amount })
    → amount >= 150
        ? floatRef.current?.spawnJackpot(hudX, hudY)
        : floatRef.current?.spawnToken(amount, hudX, hudY)

  socket.on('grand_finale_win_all')
    → floatRef.current?.spawnPerfect(screenCenterX, screenCenterY)

  socket.on('streak_updated', { count })
    → count > 1 && floatRef.current?.spawnStreak(count, screenCenterX, 200)

  socket.on('all_in_win')
    → floatRef.current?.spawnJackpot(screenCenterX, screenCenterY - 50)

  // Custom spawn (ใช้กับ item effects อื่นๆ)
  floatRef.current?.spawn({
    preset: 'custom',
    text: 'AEGIS!',
    x: shieldIconX,
    y: shieldIconY,
    customConfig: { color: '#90CAF9', fontSize: 20 },
  })

  SEAT COORDINATE HELPER:
  ─────────────────────────
  // ใน GameTable.tsx หา x,y ของแต่ละ seat ด้วย onLayout
  const [seatCoords, setSeatCoords] = useState<Record<string, {x:number,y:number}>>({});

  <View onLayout={e => {
    const { x, y } = e.nativeEvent.layout;
    setSeatCoords(prev => ({ ...prev, [playerId]: { x, y } }));
  }}>
    <PlayerSeat ... />
  </View>

  // แล้วใช้
  floatRef.current?.spawnToken(amount, seatCoords[winnerId].x, seatCoords[winnerId].y);
*/
