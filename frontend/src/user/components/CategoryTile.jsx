import { Image, Pressable, StyleSheet, View } from './primitives';
import { AppText } from './ui';
import { colors, radius, spacing } from '@theme/tokens';

/** Round category icon with its name. Icon image is uploaded in Admin › Categories; falls back to the first letter. */
export const CategoryTile = ({ category, onPress, size = 64 }) => (
  <Pressable accessibilityLabel={category.name} onPress={onPress} style={[styles.tile, { width: size + 16 }]}>
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      {category.icon ? (
        <Image source={{ uri: category.icon }} style={{ width: size * 0.6, height: size * 0.6 }} resizeMode="contain" />
      ) : (
        <AppText variant="h2" color={colors.primary}>
          {category.name.charAt(0).toUpperCase()}
        </AppText>
      )}
    </View>
    <AppText variant="small" style={{ textAlign: 'center', marginTop: spacing.xs }} numberOfLines={2}>
      {category.name}
    </AppText>
  </Pressable>
);

const styles = StyleSheet.create({
  tile: { alignItems: 'center' },
  circle: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.divider },
});
