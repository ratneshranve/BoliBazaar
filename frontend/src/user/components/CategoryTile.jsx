import { Image, Pressable, StyleSheet, View } from './primitives';
import { AppText } from './ui';
import { colors, spacing } from '@theme/tokens';

/** Round category icon with its name. Icon image is uploaded in Admin › Categories; falls back to the first letter. */
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
          style={styles.image}
          resizeMode="cover"
        />
      ) : (
        <AppText
          style={{ fontSize: Math.round(size * 0.34), fontWeight: '700' }}
          color={colors.primary}
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
  image: {
    width: '100%',
    height: '100%',
  },
  label: {
    textAlign: 'center',
    marginTop: spacing.xs,
    width: '100%',
    fontWeight: '500',
    color: colors.text,
  },
});

