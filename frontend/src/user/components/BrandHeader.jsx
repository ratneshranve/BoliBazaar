import { useNavigate } from 'react-router-dom';
import { Bell, Settings as SettingsIcon } from 'lucide-react';
import { Pressable, StyleSheet, View } from './primitives';
import { AppText } from './ui';
import { useAppSelector } from '../store';
import { colors, spacing } from '@theme/tokens';

const splitBrandName = (appName) => {
  const name = (appName || 'Bolibazaar').trim();
  const bbMatch = name.match(/^(boli)(\s*bazaar)$/i);
  if (bbMatch) {
    return [bbMatch[1], bbMatch[2]];
  }
  const spaceIdx = name.indexOf(' ');
  if (spaceIdx > 0) {
    return [name.slice(0, spaceIdx), name.slice(spaceIdx)];
  }
  const camelMatch = name.match(/^([A-Z][a-z0-9]+)([A-Z][a-z0-9]+)$/);
  if (camelMatch) {
    return [camelMatch[1], camelMatch[2]];
  }
  const mid = Math.ceil(name.length / 2);
  return [name.slice(0, mid), name.slice(mid)];
};

/** Brand name in two colors, with actions (location, language, notifications) on the right. */
export const BrandHeader = ({ right = 'bell', onBell, onSettings, children }) => {
  const navigate = useNavigate();
  const branding = useAppSelector((s) => s.app.bootstrap?.branding);
  const authed = useAppSelector((s) => s.session.status === 'authenticated');
  const hasUnread = useAppSelector((s) => s.inbox.notifications > 0);

  const boliColor = '#A41030';
  const brandColor = colors.brand || '#00509A';
  const [part1, part2] = splitBrandName(branding?.appName);

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => navigate('/')}
        accessibilityLabel={branding?.appName || 'Bolibazaar'}
        style={styles.brand}
      >
        <AppText style={styles.name} numberOfLines={1}>
          <AppText style={[styles.name, { color: boliColor }]}>{part1}</AppText>
          <AppText style={[styles.name, { color: brandColor }]}>{part2}</AppText>
        </AppText>
      </Pressable>

      <View style={styles.right}>
        {children}
        {right !== 'none' && (
          <Pressable
            accessibilityLabel="Notifications"
            onPress={onBell ?? (() => navigate(authed ? '/notifications' : '/login'))}
            style={styles.iconBtn}
          >
            <Bell size={22} color={colors.text} />
            {hasUnread && <View style={styles.dot} />}
          </Pressable>
        )}
        {right === 'bell+settings' && (
          <Pressable accessibilityLabel="Settings" onPress={onSettings} style={styles.iconBtn}>
            <SettingsIcon size={22} color={colors.text} />
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 56,
    backgroundColor: colors.bg,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  name: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    fontFamily: 'Georgia, serif',
    letterSpacing: -0.2,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
    justifyContent: 'flex-end',
  },
  iconBtn: {
    padding: spacing.xs,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.live,
    borderWidth: 1.5,
    borderColor: colors.white,
  },
});
