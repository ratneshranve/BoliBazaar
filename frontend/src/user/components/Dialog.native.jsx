import { X } from 'lucide-react-native';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, spacing, shadow } from '@theme/tokens';

/** Centred pop-up over the whole screen (phone): same look as Dialog.jsx, as a native modal (back button closes it). */
export const Dialog = ({ onClose, children }) => (
  <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <View style={styles.overlay}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.dim} />
      <View style={styles.card}>
        <Pressable accessibilityLabel="Close" onPress={onClose} hitSlop={10} style={styles.close}>
          <X size={20} color={colors.textMuted} />
        </Pressable>
        {children}
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  card: { width: '100%', maxWidth: 420, backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.xl, ...shadow.card },
  close: { position: 'absolute', top: spacing.md, right: spacing.md, zIndex: 10, padding: 6 },
});
