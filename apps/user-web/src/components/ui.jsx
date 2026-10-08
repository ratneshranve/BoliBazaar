import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from './primitives';
import { colors, radius, spacing, typography } from '@theme/tokens';

export const AppText = ({ variant = 'body', color, style, ...rest }) => (
  <Text {...rest} style={[typography[variant], { color: color ?? colors.text }, style]} />
);

const buttonBg = { primary: colors.primary, auction: colors.primary, sell: colors.sell, outline: colors.white, ghost: 'transparent' };

export const Button = ({ title, onPress, variant = 'primary', loading, disabled, icon, style, size = 'lg' }) => {
  const filled = variant === 'primary' || variant === 'auction' || variant === 'sell';
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.btn,
        size === 'md' && styles.btnMd,
        { backgroundColor: buttonBg[variant] },
        variant === 'outline' && styles.btnOutline,
        pressed && { opacity: 0.85 },
        inactive && { opacity: 0.5 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={filled ? colors.white : colors.primary} />
      ) : (
        <View style={styles.btnRow}>
          {icon}
          <AppText variant="bodyStrong" color={filled ? colors.white : colors.primary}>
            {title}
          </AppText>
        </View>
      )}
    </Pressable>
  );
};

export const Field = ({ error, left, style, ...rest }) => (
  <View>
    <View style={[styles.field, !!error && { borderColor: colors.danger }]}>
      {left}
      <TextInput placeholderTextColor={colors.textSubtle} style={[styles.fieldInput, style]} {...rest} />
    </View>
    {!!error && (
      <AppText variant="caption" color={colors.danger} style={{ marginTop: spacing.xs }}>
        {error}
      </AppText>
    )}
  </View>
);

export const Card = ({ style, children }) => <View style={[styles.card, style]}>{children}</View>;

export const EmptyState = ({ icon, title, body, action }) => (
  <View style={styles.empty}>
    {icon}
    <AppText variant="h3" style={{ textAlign: 'center', marginTop: spacing.md }}>
      {title}
    </AppText>
    {!!body && (
      <AppText color={colors.textMuted} style={{ textAlign: 'center', marginTop: spacing.xs }}>
        {body}
      </AppText>
    )}
    {action && <View style={{ marginTop: spacing.lg, alignSelf: 'stretch' }}>{action}</View>}
  </View>
);

export const Checkbox = ({ checked, onChange, label }) => (
  <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onChange(!checked)} style={styles.checkRow}>
    <View style={[styles.checkBox, checked && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
      {checked && <AppText color={colors.white} variant="small">✓</AppText>}
    </View>
    <View style={{ flex: 1 }}>{typeof label === 'string' ? <AppText>{label}</AppText> : label}</View>
  </Pressable>
);

const styles = StyleSheet.create({
  btn: { minHeight: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  btnMd: { minHeight: 42 },
  btnOutline: { borderWidth: 1, borderColor: colors.border },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  fieldInput: { flex: 1, ...typography.body, color: colors.text, paddingVertical: spacing.sm },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.divider, padding: spacing.lg },
  empty: { alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.sm },
  checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.textSubtle, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
});
