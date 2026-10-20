import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from './primitives';
import { colors, radius, spacing } from '@theme/tokens';

/** Full-width slides that snap one at a time, change every 4.5 s (paused while touched), with dots below. */
export const BannerCarousel = ({ items, keyOf, renderItem }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef(null);
  const isInteractingRef = useRef(false);

  useEffect(() => {
    if (items.length <= 1) return undefined;
    const timer = setInterval(() => {
      if (isInteractingRef.current) return;
      const el = scrollRef.current;
      if (!el || !el.clientWidth) return;
      const next = (activeIndex + 1) % items.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
      setActiveIndex(next);
    }, 4500);
    return () => clearInterval(timer);
  }, [items.length, activeIndex]);

  const handleScroll = (e) => {
    const el = e.currentTarget;
    if (!el || !el.clientWidth) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== activeIndex && idx >= 0 && idx < items.length) setActiveIndex(idx);
  };

  const goTo = (idx) => {
    const el = scrollRef.current;
    if (!el || !el.clientWidth) return;
    el.scrollTo({ left: idx * el.clientWidth, behavior: 'smooth' });
    setActiveIndex(idx);
  };

  return (
    <>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onTouchStart={() => { isInteractingRef.current = true; }}
        onTouchEnd={() => { setTimeout(() => { isInteractingRef.current = false; }, 3000); }}
        onMouseEnter={() => { isInteractingRef.current = true; }}
        onMouseLeave={() => { isInteractingRef.current = false; }}
        className="banner-scroll"
        style={{
          display: 'flex',
          flexDirection: 'row',
          width: '100%',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          scrollBehavior: 'smooth',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          borderRadius: radius.lg,
        }}
      >
        {items.map((b, idx) => (
          <div
            key={keyOf(b)}
            style={{
              flex: '0 0 100%',
              width: '100%',
              minWidth: '100%',
              maxWidth: '100%',
              scrollSnapAlign: 'start',
              scrollSnapStop: 'always',
              boxSizing: 'border-box',
            }}
          >
            {renderItem(b, idx)}
          </div>
        ))}
      </div>
      {items.length > 1 && (
        <View style={styles.dots}>
          {items.map((b, idx) => (
            <Pressable key={keyOf(b)} accessibilityLabel={`Banner ${idx + 1}`} onPress={() => goTo(idx)} style={[styles.dot, idx === activeIndex && styles.dotActive]} />
          ))}
        </View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { width: 18, backgroundColor: colors.primary },
});
