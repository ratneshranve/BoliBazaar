import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, LayoutGrid, Plus, Gavel, User } from 'lucide-react';
import { Pressable, StyleSheet, View } from './primitives';
import { AppText } from './ui';
import { useAppSelector } from '../store';
import { colors, spacing } from '@theme/tokens';

const TABS = [
  { name: 'Home', path: '/', icon: Home, label: 'tabs.home' },
  { name: 'Explore', path: '/explore', icon: LayoutGrid, label: 'tabs.explore' },
  { name: 'Sell', path: '/sell', icon: Plus, label: 'tabs.sell' },
  { name: 'Auctions', path: '/auctions', icon: Gavel, label: 'tabs.auctions' },
  { name: 'Profile', path: '/profile', icon: User, label: 'tabs.profile' },
];

/** Same tab bar as the mobile mockups: Home · Explore · (+ Sell) · Auctions · Profile */
export const TabBar = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const loggedIn = useAppSelector((s) => s.session.status === 'authenticated');

  const go = (tab) => {
    // Selling needs an account: guests are sent to login.
    if (tab.name === 'Sell' && !loggedIn) return navigate('/login');
    navigate(tab.path);
  };

  return (
    <View style={styles.bar}>
      {TABS.map((tab) => {
        const focused = tab.path === '/' ? pathname === '/' : pathname.startsWith(tab.path);
        const Icon = tab.icon;
        if (tab.name === 'Sell') {
          return (
            <Pressable key={tab.name} accessibilityLabel={t(tab.label)} onPress={() => go(tab)} style={styles.item}>
              <View style={styles.fab}>
                <Icon size={30} color={colors.white} strokeWidth={2.5} />
              </View>
              <AppText variant="small" color={focused ? colors.primary : colors.textMuted} style={{ marginTop: 2 }}>
                {t(tab.label)}
              </AppText>
            </Pressable>
          );
        }
        const tint = focused ? colors.primary : colors.textMuted;
        return (
          <Pressable key={tab.name} accessibilityRole="tab" accessibilityState={{ selected: focused }} onPress={() => go(tab)} style={styles.item}>
            <Icon size={24} color={tint} />
            <AppText variant="small" color={tint} style={{ marginTop: 3, fontWeight: focused ? '700' : '500' }}>
              {t(tab.label)}
            </AppText>
            {focused && <View style={styles.underline} />}
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm, paddingBottom: spacing.sm, flexShrink: 0 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  fab: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    marginTop: -30, borderWidth: 4, borderColor: colors.white, shadowColor: colors.primary, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  underline: { position: 'absolute', bottom: -6, width: 44, height: 3, borderRadius: 2, backgroundColor: colors.primary },
});
