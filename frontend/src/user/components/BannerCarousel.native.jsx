import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '@theme/tokens';

/** Phone version of BannerCarousel.jsx: paged horizontal slides, 4.5 s auto-advance (paused while touched), dots below. */
export const BannerCarousel = ({ items, keyOf, renderItem }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [width, setWidth] = useState(0);
  const scrollRef = useRef(null);
  const isInteractingRef = useRef(false);
  const resume = useRef(null);

  useEffect(() => {
    if (items.length <= 1 || !width) return undefined;
    const timer = setInterval(() => {
      if (isInteractingRef.current) return;
      const next = (activeIndex + 1) % items.length;
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
      setActiveIndex(next);
    }, 4500);
    return () => clearInterval(timer);
  }, [items.length, activeIndex, width]);

  useEffect(() => () => clearTimeout(resume.current), []);

  const onSettled = (e) => {
    if (!width) return;
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    if (idx >= 0 && idx < items.length) setActiveIndex(idx);
  };

  const goTo = (idx) => {
    scrollRef.current?.scrollTo({ x: idx * width, animated: true });
    setActiveIndex(idx);
  };

  return (
    <>
      <View style={styles.frame} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
        {width > 0 && (
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            onMomentumScrollEnd={onSettled}
            onTouchStart={() => {
              clearTimeout(resume.current);
              isInteractingRef.current = true;
            }}
            onTouchEnd={() => {
              resume.current = setTimeout(() => { isInteractingRef.current = false; }, 3000);
            }}
          >
            {items.map((b, idx) => (
              <View key={keyOf(b)} style={{ width }}>
                {renderItem(b, idx)}
              </View>
            ))}
          </ScrollView>
        )}
      </View>
      {items.length > 1 && (
        <View style={styles.dots}>
          {items.map((b, idx) => (
            <Pressable key={keyOf(b)} accessibilityLabel={`Banner ${idx + 1}`} onPress={() => goTo(idx)} hitSlop={6} style={[styles.dot, idx === activeIndex && styles.dotActive]} />
          ))}
        </View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  frame: { width: '100%', borderRadius: radius.lg, overflow: 'hidden' },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { width: 18, backgroundColor: colors.primary },
});
