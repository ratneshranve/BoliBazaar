import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Home, LayoutGrid, Plus, Gavel, User } from 'lucide-react-native';
import { AppText } from './ui';
import { colors, spacing } from '../theme/tokens';

const ICONS = { Home, Explore: LayoutGrid, Sell: Plus, Auctions: Gavel, Profile: User } as const;
const LABELS = { Home: 'tabs.home', Explore: 'tabs.explore', Sell: 'tabs.sell', Auctions: 'tabs.auctions', Profile: 'tabs.profile' } as const;

/** Bottom tabs from the mockup: Home · Explore · (+ Sell) · Auctions · Profile, active = crimson with underline. */
export const TabBar = ({ state, navigation }: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const name = route.name as keyof typeof ICONS;
        const Icon = ICONS[name];
        const onPress = () => {
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
        };

        if (name === 'Sell') {
          return (
            <Pressable key={route.key} accessibilityRole="button" accessibilityLabel={t(LABELS.Sell)} onPress={onPress} style={styles.item}>
              <View style={styles.fab}>
                <Plus size={30} color={colors.white} strokeWidth={2.5} />
              </View>
              <AppText variant="small" color={focused ? colors.primary : colors.textMuted} style={{ marginTop: 2 }}>
                {t(LABELS.Sell)}
              </AppText>
            </Pressable>
          );
        }

        const tint = focused ? colors.primary : colors.textMuted;
        return (
          <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: focused }} onPress={onPress} style={styles.item}>
            <Icon size={24} color={tint} />
            <AppText variant="small" color={tint} style={{ marginTop: 3, fontWeight: focused ? '700' : '500' }}>
              {t(LABELS[name])}
            </AppText>
            {focused && <View style={styles.underline} />}
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.sm,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -30,
    borderWidth: 4,
    borderColor: colors.white,
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  underline: { position: 'absolute', bottom: -6, width: 44, height: 3, borderRadius: 2, backgroundColor: colors.primary },
});
