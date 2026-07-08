import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  SafeAreaView,
  Animated,
  Dimensions,
} from 'react-native';

const { width: SW, height: SH } = Dimensions.get('window');

const CARD_W = 58;
const CARD_H = 82;

// ─── Card Component (RN Animated — ไม่ใช้ Reanimated) ───────────────────────
const TestCard: React.FC<{
  suit: string;
  rank: string;
  animRef: React.MutableRefObject<{
    deal: () => void;
    flip: () => void;
    fold: () => void;
    slowReveal: () => void;
  }>;
}> = ({ suit, rank, animRef }) => {
  const dealAnim    = useRef(new Animated.Value(0)).current;
  const flipAnim    = useRef(new Animated.Value(0)).current;
  const foldOpacity = useRef(new Animated.Value(1)).current;
  const foldScale   = useRef(new Animated.Value(1)).current;
  const foldTransY  = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const isFront     = useRef(false);

  // Deal — ไพ่บินออกจากกองมา
  const deal = () => {
    dealAnim.setValue(0);
    Animated.timing(dealAnim, {
      toValue: 1,
      duration: 350,
      useNativeDriver: true,
    }).start();
  };

  // Flip — พลิกหน้า ↔ หลัง
  const flip = () => {
    const toValue = isFront.current ? 0 : 1;
    isFront.current = !isFront.current;
    Animated.sequence([
      Animated.timing(flipAnim, {
        toValue: 0.5,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(flipAnim, {
        toValue,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // Fold — ไพ่หายไป
  const fold = () => {
    Animated.parallel([
      Animated.timing(foldOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      Animated.timing(foldScale,   { toValue: 0.8, duration: 300, useNativeDriver: true }),
      Animated.timing(foldTransY,  { toValue: 40, duration: 300, useNativeDriver: true }),
    ]).start(() => {
      // reset หลัง fold
      setTimeout(() => {
        foldOpacity.setValue(1);
        foldScale.setValue(1);
        foldTransY.setValue(0);
        isFront.current = false;
        flipAnim.setValue(0);
        dealAnim.setValue(0);
      }, 400);
    });
  };

  // Slow Reveal — Grand Finale style
  const slowReveal = () => {
    flipAnim.setValue(1); // เริ่มที่หลังไพ่
    isFront.current = false;
    Animated.sequence([
      Animated.timing(flipAnim, {
        toValue: 0.5,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(flipAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start(() => {
      isFront.current = true;
      // glow effect หลัง reveal
      Animated.sequence([
        Animated.timing(glowOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.delay(800),
        Animated.timing(glowOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start();
    });
  };

  // expose methods ผ่าน ref
  animRef.current = { deal, flip, fold, slowReveal };

  // Interpolations
  const dealTranslateY = dealAnim.interpolate({
    inputRange: [0, 1], outputRange: [-80, 0],
  });
  const dealScale = dealAnim.interpolate({
    inputRange: [0, 1], outputRange: [0.5, 1],
  });
  const dealOpacity = dealAnim;

  const frontRotateY = flipAnim.interpolate({
    inputRange: [0, 0.5, 1], outputRange: ['0deg', '90deg', '90deg'],
  });
  const backRotateY = flipAnim.interpolate({
    inputRange: [0, 0.5, 1], outputRange: ['90deg', '90deg', '0deg'],
  });
  const frontOpacity = flipAnim.interpolate({
    inputRange: [0, 0.49, 0.5, 1], outputRange: [1, 1, 0, 0],
  });
  const backOpacity = flipAnim.interpolate({
    inputRange: [0, 0.5, 0.51, 1], outputRange: [0, 0, 1, 1],
  });

  const suitColor = suit === 'hearts' || suit === 'diamonds' ? '#D32F2F' : '#1A1A2E';
  const suitSymbol = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }[suit] || '♠';

  return (
    <Animated.View style={{
      opacity: foldOpacity,
      transform: [{ scale: foldScale }, { translateY: foldTransY }],
    }}>
      <Animated.View style={{
        opacity: dealOpacity,
        transform: [{ translateY: dealTranslateY }, { scale: dealScale }],
        width: CARD_W, height: CARD_H, position: 'relative',
      }}>
        {/* Front Face */}
        <Animated.View style={[
          styles.card, styles.frontFace,
          { opacity: frontOpacity, transform: [{ perspective: 1200 }, { rotateY: frontRotateY }] }
        ]}>
          <Text style={[styles.rankText, { color: suitColor }]}>{rank}</Text>
          <Text style={[styles.centerSymbol, { color: suitColor }]}>{suitSymbol}</Text>
          <Text style={[styles.rankText, { color: suitColor, transform: [{ rotate: '180deg' }] }]}>{rank}</Text>
          {/* Glow overlay */}
          <Animated.View style={[styles.glowOverlay, { opacity: glowOpacity }]} />
        </Animated.View>

        {/* Card Back */}
        <Animated.View style={[
          styles.card, styles.backFace,
          { opacity: backOpacity, transform: [{ perspective: 1200 }, { rotateY: backRotateY }] }
        ]}>
          <View style={styles.backOuter}>
            <View style={styles.backInner}>
              <View style={styles.backDiamond} />
            </View>
          </View>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
};

// ─── VFXTestScreen ───────────────────────────────────────────────────────────
const VFXTestScreen: React.FC = () => {
  const animRef = useRef<{
    deal: () => void;
    flip: () => void;
    fold: () => void;
    slowReveal: () => void;
  }>({ deal: () => {}, flip: () => {}, fold: () => {}, slowReveal: () => {} });

  const [status, setStatus] = useState('Ready');

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>VFX Test — Card Animation</Text>
      <Text style={styles.subtitle}>Deal · Flip · Fold · Slow Reveal</Text>
      <Text style={styles.note}>⚡ RN Animated (Reanimated ใช้ตอน dev build)</Text>

      {/* Card Area */}
      <View style={styles.cardArea}>
        <TestCard suit="spades" rank="A" animRef={animRef} />
      </View>

      {/* Buttons */}
      <View style={styles.buttonGrid}>
        <Pressable
          style={({ pressed }) => [styles.btn, styles.btnDeal, pressed && styles.btnPressed]}
          onPress={() => { animRef.current.deal(); setStatus('Deal ✅'); }}
        >
          <Text style={styles.btnIcon}>🃏</Text>
          <Text style={styles.btnLabel}>Deal</Text>
          <Text style={styles.btnDesc}>ไพ่บินออกจากกอง</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.btn, styles.btnFlip, pressed && styles.btnPressed]}
          onPress={() => { animRef.current.flip(); setStatus('Flip ✅'); }}
        >
          <Text style={styles.btnIcon}>🔄</Text>
          <Text style={styles.btnLabel}>Flip</Text>
          <Text style={styles.btnDesc}>พลิกหน้า ↔ หลัง</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.btn, styles.btnFold, pressed && styles.btnPressed]}
          onPress={() => { animRef.current.fold(); setStatus('Fold ✅'); }}
        >
          <Text style={styles.btnIcon}>❌</Text>
          <Text style={styles.btnLabel}>Fold</Text>
          <Text style={styles.btnDesc}>ไพ่หายไป</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.btn, styles.btnReveal, pressed && styles.btnPressed]}
          onPress={() => { animRef.current.slowReveal(); setStatus('Slow Reveal ✅'); }}
        >
          <Text style={styles.btnIcon}>✨</Text>
          <Text style={styles.btnLabel}>Slow Reveal</Text>
          <Text style={styles.btnDesc}>Grand Finale + Glow</Text>
        </Pressable>
      </View>

      {/* Status */}
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>Status: {status}</Text>
      </View>
    </SafeAreaView>
  );
};

export default VFXTestScreen;

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E1A',
    alignItems: 'center',
    paddingTop: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFD700',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 11,
    color: '#9E9E9E',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  note: {
    fontSize: 10,
    color: '#ff6400',
    marginTop: 4,
    marginBottom: 24,
  },
  cardArea: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 12,
    borderStyle: 'dashed',
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 8,
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
  frontFace: {
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingHorizontal: 5,
    paddingVertical: 4,
    justifyContent: 'space-between',
    alignItems: 'center',
    overflow: 'hidden',
  },
  backFace: {
    backgroundColor: '#1A237E',
    padding: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 14,
    fontWeight: '800',
  },
  centerSymbol: {
    fontSize: 26,
    textAlign: 'center',
  },
  backOuter: {
    flex: 1,
    width: '100%',
    borderRadius: 4,
    backgroundColor: '#283593',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3949AB',
  },
  backInner: {
    width: '80%',
    height: '80%',
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: '#7986CB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backDiamond: {
    width: 14,
    height: 14,
    backgroundColor: '#5C6BC0',
    transform: [{ rotate: '45deg' }],
    opacity: 0.7,
  },
  glowOverlay: {
    position: 'absolute',
    top: -4, left: -4, right: -4, bottom: -4,
    borderRadius: 12,
    backgroundColor: 'rgba(255,215,0,0.3)',
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  buttonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  btn: {
    width: 140,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
    gap: 4,
  },
  btnPressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },
  btnDeal:   { backgroundColor: '#1B5E20', borderWidth: 1, borderColor: '#4CAF50' },
  btnFlip:   { backgroundColor: '#0D47A1', borderWidth: 1, borderColor: '#2196F3' },
  btnFold:   { backgroundColor: '#B71C1C', borderWidth: 1, borderColor: '#EF5350' },
  btnReveal: { backgroundColor: '#4A148C', borderWidth: 1, borderColor: '#CE93D8' },
  btnIcon:  { fontSize: 22 },
  btnLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  btnDesc:  { color: 'rgba(255,255,255,0.6)', fontSize: 10, textAlign: 'center' },
  statusBar: {
    position: 'absolute',
    bottom: 40,
    alignItems: 'center',
  },
  statusText: {
    color: '#E0E0E0',
    fontSize: 13,
    fontWeight: '600',
  },
});
