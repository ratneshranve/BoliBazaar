import { X } from 'lucide-react';
import { Pressable, StyleSheet, View } from './primitives';
import { colors, radius, spacing, shadow } from '@theme/tokens';

/** Centred pop-up over the whole page (the phone uses Dialog.native.jsx, a native modal). */
export const Dialog = ({ onClose, children }) => (
  <View style={styles.overlay}>
    <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.dim} />
    <View style={styles.card}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.close}>
        <X size={20} color={colors.textMuted} />
      </Pressable>
      {children}
    </View>
  </View>
);

const styles = StyleSheet.create({
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay },
  card: { position: 'relative', width: '100%', maxWidth: 420, backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.xl, ...shadow.card },
  close: { position: 'absolute', top: spacing.md, right: spacing.md, zIndex: 10, padding: 6 },
});
