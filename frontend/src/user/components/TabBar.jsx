import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, MessageSquare, Plus, Gavel, User } from 'lucide-react';
import { Pressable, StyleSheet, View } from './primitives';
import { AppText } from './ui';
import { useAppSelector } from '../store';
import { colors, spacing } from '@theme/tokens';

const TABS = [
  { name: 'Home', path: '/', icon: Home, label: 'tabs.home' },
  { name: 'Chats', path: '/chats', icon: MessageSquare, label: 'tabs.chats' },
  { name: 'Sell', path: '/sell', icon: Plus, label: 'tabs.sell' },
  { name: 'Auctions', path: '/auctions', icon: Gavel, label: 'tabs.auctions' },
  { name: 'Profile', path: '/profile', icon: User, label: 'tabs.profile' },
];

/** One line, shrinks to fit: a long word in another language must never make the bar taller or push the icons out of line. */
const fit = { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.7, ellipsizeMode: 'tail' };

/** Same tab bar as the mobile mockups: Home · Chats · (+ Sell) · Auctions · Profile */
export const TabBar = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const loggedIn = useAppSelector((s) => s.session.status === 'authenticated');
  const unreadChats = useAppSelector((s) => s.inbox?.chats ?? 0);

  const go = (tab) => {
    // Selling & chats need an account: guests are sent to login.
    if ((tab.name === 'Sell' || tab.name === 'Chats') && !loggedIn) return navigate('/login');
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
              <AppText variant="small" color={focused ? colors.brand : colors.textMuted} {...fit} style={[styles.label, { marginTop: 2, fontWeight: focused ? '700' : '500' }]}>
                {t(tab.label)}
              </AppText>
            </Pressable>
          );
        }
        const tint = focused ? colors.primary : colors.textMuted;
        return (
          <Pressable key={tab.name} accessibilityRole="tab" accessibilityState={{ selected: focused }} onPress={() => go(tab)} style={styles.item}>
            <View style={styles.iconWrap}>
              <Icon size={24} color={tint} />
              {tab.name === 'Chats' && unreadChats > 0 && (
                <View style={styles.chatBadge}>
                  <AppText style={styles.chatBadgeText}>
                    {unreadChats > 99 ? '99+' : unreadChats}
                  </AppText>
                </View>
              )}
            </View>
            <AppText variant="small" color={tint} {...fit} style={[styles.label, { marginTop: 3, fontWeight: focused ? '700' : '500' }]}>
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
  item: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'flex-end' },
  label: { maxWidth: '100%', paddingHorizontal: 2, textAlign: 'center' },
  iconWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  chatBadge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.danger,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  fab: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center',
    marginTop: -30, borderWidth: 4, borderColor: colors.white, shadowColor: colors.brand, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  underline: { position: 'absolute', bottom: -6, width: 44, height: 3, borderRadius: 2, backgroundColor: colors.primary },
});
