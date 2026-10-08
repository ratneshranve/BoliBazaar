import { X } from 'lucide-react';
import { Pressable, StyleSheet, View } from './primitives';
import { AppText } from './ui';
import { colors, radius, spacing } from '@theme/tokens';

/** Bottom sheet that covers the phone screen's lower part. Tapping the dim area closes it. */
export const Sheet = ({ title, onClose, children, footer, tall }) => (
  <View style={styles.overlay}>
    <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.dim} />
    <View style={[styles.sheet, tall && { maxHeight: '92%' }]}>
      <View style={styles.head}>
        <AppText variant="h3">{title}</AppText>
        <Pressable accessibilityLabel="Close" onPress={onClose}>
          <X size={22} color={colors.text} />
        </Pressable>
      </View>
      <View style={{ overflowY: 'auto', flexShrink: 1, padding: spacing.lg, gap: spacing.lg }}>{children}</View>
      {footer && <View style={styles.foot}>{footer}</View>}
    </View>
  </View>
);

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 30, justifyContent: 'flex-end' },
  dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '80%', display: 'flex' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  foot: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider },
});
