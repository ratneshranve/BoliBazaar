import { X } from 'lucide-react-native';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './ui';
import { colors, radius, spacing } from '@theme/tokens';

/** Bottom sheet over the screen (phone): same look as Sheet.jsx, as a native modal. */
export const Sheet = ({ title, onClose, children, footer, tall }) => {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="height" style={styles.overlay}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.dim} />
        <View style={[styles.sheet, tall && { maxHeight: '92%' }, { paddingBottom: insets.bottom }]}>
          <View style={styles.head}>
            <AppText variant="h3">{title}</AppText>
            <Pressable accessibilityLabel="Close" onPress={onClose} hitSlop={10}>
              <X size={22} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer && <View style={styles.foot}>{footer}</View>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '80%' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  foot: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider },
});
