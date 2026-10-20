import { Image, Pressable, StyleSheet, View } from './primitives';
import { AppText } from './ui';
import { colors, spacing } from '@theme/tokens';
import viewAllIcon from '../assets/view-all.png';

/** Round category icon with its name. Icon image (transparent, square) is uploaded in Admin › Categories and drawn centred
 *  at the same size in every circle; falls back to the first letter. */
export const CategoryTile = ({ category, onPress, size = 72, style }) => (
  <Pressable
    accessibilityLabel={category.name}
    onPress={onPress}
    style={({ pressed }) => [styles.tile, { width: size + 16 }, style, pressed && { opacity: 0.85 }]}
  >
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      {category.icon ? (
        <Image
          source={{ uri: category.icon }}
          style={{ width: Math.round(size * 0.76), height: Math.round(size * 0.76) }}
          resizeMode="contain"
        />
      ) : (
        <AppText
          style={{ fontSize: Math.round(size * 0.34), fontWeight: '700' }}
          color={colors.brand}
        >
          {category.name ? category.name.charAt(0).toUpperCase() : ''}
        </AppText>
      )}
    </View>
    <AppText variant="small" style={styles.label} numberOfLines={2}>
      {category.name}
    </AppText>
  </Pressable>
);

/** "See all" / "View all" in a category grid: same circle, background and icon size as a category, with a 3D grid icon. */
export const ViewAllTile = ({ label, onPress, size = 72, style }) => (
  <Pressable
    accessibilityLabel={label}
    onPress={onPress}
    style={({ pressed }) => [styles.tile, { width: size + 16 }, style, pressed && { opacity: 0.85 }]}
  >
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      <Image source={{ uri: viewAllIcon }} style={{ width: Math.round(size * 0.76), height: Math.round(size * 0.76) }} resizeMode="contain" />
    </View>
    <AppText variant="small" style={[styles.label, { fontWeight: '600', color: colors.primary }]} numberOfLines={2}>
      {label}
    </AppText>
  </Pressable>
);

const styles = StyleSheet.create({
  tile: { alignItems: 'center' },
  circle: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.divider,
    overflow: 'hidden',
  },
  label: {
    textAlign: 'center',
    marginTop: spacing.xs,
    width: '100%',
    fontWeight: '500',
    color: colors.text,
  },
});

