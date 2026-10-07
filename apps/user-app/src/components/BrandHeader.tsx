import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Bell, Settings as SettingsIcon } from 'lucide-react-native';
import { useAppSelector } from '../store';
import { AppText } from './ui';
import { colors, spacing } from '../theme/tokens';

type Props = {
  right?: 'bell' | 'bell+settings' | 'none';
  onBell?: () => void;
  onSettings?: () => void;
  hasUnread?: boolean;
  children?: React.ReactNode; // extra right-side content (location chip, language chip)
};

/**
 * App header. Logo, name and tagline come from Admin › Settings › Branding.
 * Nothing is rendered for fields the admin hasn't set (no hardcoded fallback brand).
 */
export const BrandHeader = ({ right = 'bell', onBell, onSettings, hasUnread, children }: Props) => {
  const branding = useAppSelector(s => s.app.bootstrap?.branding);

  return (
    <View style={styles.row}>
      <View style={styles.brand}>
        {branding?.logo?.url ? (
          <Image source={{ uri: branding.logo.url }} style={styles.logo} resizeMode="contain" accessibilityIgnoresInvertColors />
        ) : null}
        {(branding?.appName || branding?.tagline) && (
          <View style={{ flexShrink: 1 }}>
            {!!branding?.appName && (
              <AppText style={styles.name} color={colors.primary} numberOfLines={1}>
                {branding.appName}
              </AppText>
            )}
            {!!branding?.tagline && (
              <AppText variant="small" color={colors.textMuted} numberOfLines={1}>
                {branding.tagline}
              </AppText>
            )}
          </View>
        )}
      </View>

      <View style={styles.right}>
        {children}
        {right !== 'none' && (
          <Pressable accessibilityRole="button" accessibilityLabel="Notifications" onPress={onBell} hitSlop={8} style={styles.iconBtn}>
            <Bell size={24} color={colors.text} />
            {hasUnread && <View style={styles.dot} />}
          </Pressable>
        )}
        {right === 'bell+settings' && (
          <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={onSettings} hitSlop={8} style={styles.iconBtn}>
            <SettingsIcon size={24} color={colors.text} />
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, minHeight: 56 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  logo: { width: 44, height: 40 },
  name: { fontSize: 24, lineHeight: 28, fontWeight: '700', fontFamily: 'serif' },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconBtn: { padding: spacing.xs },
  dot: { position: 'absolute', top: 4, right: 4, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.live, borderWidth: 1.5, borderColor: colors.white },
});
