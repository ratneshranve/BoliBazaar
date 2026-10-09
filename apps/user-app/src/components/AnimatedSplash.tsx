import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme/tokens';

/**
 * Launch screen: the B|b mark assembles (green divider grows, the two letters slide in), the
 * "Bolibazaar" wordmark rises, the tagline fades in. It stays until the app has finished starting
 * (`ready`) and the animation has played, then fades away to reveal the app underneath.
 * Pieces are cut from the brand logo at 1x/2x/3x (src/assets/splash).
 */

// Layout of the pieces, in dp, measured from the original logo (scale 0.537 dp per logo pixel).
const S = 0.537;
const MARK = { width: (624 - 335) * S, height: (515 - 258) * S };
const piece = (x0: number, y0: number, w: number, h: number) => ({ left: (x0 - 335) * S, top: (y0 - 258) * S, width: w * S, height: h * S });
const B_RED = piece(335, 319, 119, 149);
const DIVIDER = piece(466, 258, 25, 257);
const B_BLUE = piece(502, 310, 122, 161);
const WORDMARK = { width: 268, height: (268 * 125) / 724 };

const MIN_SHOW_MS = 1700;

type Props = { ready: boolean; onDone: () => void };

export const AnimatedSplash = ({ ready, onDone }: Props) => {
  const { t } = useTranslation();
  const divider = useRef(new Animated.Value(0)).current;
  const letters = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const word = useRef(new Animated.Value(0)).current;
  const tagline = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(1)).current;
  const [played, setPlayed] = useState(false);

  useEffect(() => {
    const started = Date.now();
    Animated.sequence([
      Animated.timing(divider, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(letters, { toValue: 1, duration: 480, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }),
        // fixed-length bounce (a spring would hold the sequence until it fully settles)
        Animated.timing(pop, { toValue: 1, duration: 480, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
      ]),
      Animated.timing(word, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(tagline, { toValue: 1, duration: 360, useNativeDriver: true }),
    ]).start(() => {
      const left = Math.max(0, MIN_SHOW_MS - (Date.now() - started));
      setTimeout(() => setPlayed(true), left);
    });
  }, [divider, letters, pop, word, tagline]);

  useEffect(() => {
    if (!ready || !played) return;
    Animated.timing(exit, { toValue: 0, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(({ finished }) => finished && onDone());
  }, [ready, played, exit, onDone]);

  const markScale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] });
  const fadeIn = (v: Animated.Value) => v.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const slide = (from: number) => letters.interpolate({ inputRange: [0, 1], outputRange: [from, 0] });

  return (
    <Animated.View
      style={[styles.fill, { opacity: exit, transform: [{ scale: exit.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1] }) }] }]}
      pointerEvents={played && ready ? 'none' : 'auto'}
      accessibilityLabel="Bolibazaar"
    >
      <Animated.View style={[styles.mark, { transform: [{ scale: markScale }] }]}>
        <Animated.Image
          source={require('../assets/splash/divider.png')}
          style={[styles.abs, DIVIDER, { opacity: fadeIn(divider), transform: [{ scaleY: divider }] }]}
          resizeMode="contain"
        />
        <Animated.Image
          source={require('../assets/splash/letter-b-red.png')}
          style={[styles.abs, B_RED, { opacity: fadeIn(letters), transform: [{ translateX: slide(-36) }] }]}
          resizeMode="contain"
        />
        <Animated.Image
          source={require('../assets/splash/letter-b-blue.png')}
          style={[styles.abs, B_BLUE, { opacity: fadeIn(letters), transform: [{ translateX: slide(36) }] }]}
          resizeMode="contain"
        />
      </Animated.View>

      <Animated.View style={{ opacity: word, transform: [{ translateY: word.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }}>
        <Image source={require('../assets/splash/wordmark.png')} style={WORDMARK} resizeMode="contain" />
      </Animated.View>

      <Animated.View style={{ opacity: tagline, marginTop: 14 }}>
        <Text style={styles.tagline}>{t('splash.tagline')}</Text>
      </Animated.View>

      <View style={styles.footer}>
        <Animated.View style={[styles.dotRow, { opacity: tagline }]}>
          {[0, 1, 2].map(i => (
            <Dot key={i} delay={i * 160} />
          ))}
        </Animated.View>
      </View>
    </Animated.View>
  );
};

/** Small pulsing dots under the logo while the app finishes starting. */
const Dot = ({ delay }: { delay: number }) => {
  const v = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 380, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.3, duration: 380, useNativeDriver: true }),
        Animated.delay(480 - delay),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, delay]);
  return <Animated.View style={[styles.dot, { opacity: v, transform: [{ scale: v }] }]} />;
};

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', zIndex: 100, elevation: 100 },
  mark: { width: MARK.width, height: MARK.height, marginBottom: 22 },
  abs: { position: 'absolute' },
  tagline: { color: colors.textMuted, fontSize: 15, letterSpacing: 0.4 },
  footer: { position: 'absolute', bottom: 56, alignItems: 'center' },
  dotRow: { flexDirection: 'row', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
});
