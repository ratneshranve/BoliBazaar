import { Children, isValidElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Settings as SettingsIcon } from 'lucide-react';
import { Pressable, StyleSheet, View } from './primitives';
import { LocationChip } from './LocationChip';
import { useAppSelector } from '../store';
import { colors, spacing } from '@theme/tokens';

/**
 * Header of the main pages in the app: no logo or name (the website keeps them) — the place the user
 * is browsing from sits where the brand was, with the language chip, bell and settings on the right.
 */
export const BrandHeader = ({ right = 'bell', onBell, onSettings, children }) => {
  const navigate = useNavigate();
  const authed = useAppSelector((s) => s.session.status === 'authenticated');
  const hasUnread = useAppSelector((s) => s.inbox.notifications > 0);
  // pages pass their own location chip for the website's layout; here it is always the one on the left
  const extras = Children.toArray(children).filter((c) => !(isValidElement(c) && c.type === LocationChip));
  return (
    <View style={styles.row}>
      <View style={{ flexShrink: 1 }}>
        <LocationChip />
      </View>
      <View style={styles.right}>
        {extras}
        {right !== 'none' && (
          <Pressable accessibilityLabel="Notifications" onPress={onBell ?? (() => navigate(authed ? '/notifications' : '/login'))} style={styles.iconBtn}>
            <Bell size={24} color={colors.text} />
            {hasUnread && <View style={styles.dot} />}
          </Pressable>
        )}
        {right === 'bell+settings' && (
          <Pressable accessibilityLabel="Settings" onPress={onSettings} style={styles.iconBtn}>
            <SettingsIcon size={24} color={colors.text} />
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, minHeight: 56 },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconBtn: { padding: spacing.xs },
  dot: { position: 'absolute', top: 4, right: 4, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.live, borderWidth: 1.5, borderColor: colors.white },
});
