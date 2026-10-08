import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Globe, MapPin } from 'lucide-react-native';
import { AppText } from './ui';
import { useAppSelector } from '../store';
import { colors, spacing } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** The place the user is browsing from (opens the location picker). */
export const LocationChip = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const current = useAppSelector(s => s.location.current);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t('location.title')} onPress={() => nav.navigate('Location')} style={styles.chip}>
      <MapPin size={18} color={colors.primary} />
      <AppText variant="bodyStrong" numberOfLines={1} style={{ maxWidth: 110 }}>
        {current?.name ?? t('home.chooseLocation')}
      </AppText>
      <ChevronDown size={16} color={colors.textMuted} />
    </Pressable>
  );
};

/** Shown only when the admin has enabled more than one language. */
export const LanguageChip = () => {
  const nav = useNavigation<Nav>();
  const { i18n } = useTranslation();
  const count = useAppSelector(s => s.app.bootstrap?.languages?.items?.length ?? 0);
  if (count < 2) return null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Language" onPress={() => nav.navigate('Language')} style={styles.chip}>
      <Globe size={18} color={colors.text} />
      <AppText variant="bodyStrong">{i18n.language.toUpperCase()}</AppText>
    </Pressable>
  );
};

/** Round category icon with its name. Icon image is uploaded in Admin › Categories; falls back to the first letter. */
export const CategoryTile = ({ category, onPress, size = 64 }: { category: { name: string; icon: string | null }; onPress: () => void; size?: number }) => (
  <Pressable accessibilityRole="button" accessibilityLabel={category.name} onPress={onPress} style={{ width: size + 16, alignItems: 'center' }}>
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
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
  circle: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.divider },
});
