import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from './primitives';
import { AppText, Checkbox, Field } from './ui';
import { colors, radius, spacing } from '@theme/tokens';

const Chip = ({ label, active, onPress }) => (
  <Pressable onPress={onPress} style={[styles.chip, active && styles.chipOn]}>
    <AppText variant="bodyStrong" color={active ? colors.white : colors.text}>{label}</AppText>
  </Pressable>
);

/**
 * Renders a category's form fields (defined in Admin › Categories › Form fields).
 * `values` is { [key]: value }; `errors` is { [key]: message }.
 */
export const DynamicFields = ({ fields, values, errors, onChange }) => {
  const { t } = useTranslation();
  return (
    <View style={{ gap: spacing.lg }}>
      {fields.map((f) => {
        const err = errors?.[f.key];
        const label = `${f.label}${f.unit ? ` (${f.unit})` : ''}${f.required ? ' *' : ''}`;
        const v = values[f.key];

        if (f.type === 'select') {
          return (
            <View key={f.key}>
              <AppText variant="bodyStrong" style={{ marginBottom: spacing.sm }}>{label}</AppText>
              <View style={styles.chips}>
                {f.options.map((o) => (
                  <Chip key={o.value} label={o.label} active={v === o.value} onPress={() => onChange(f.key, v === o.value && !f.required ? undefined : o.value)} />
                ))}
              </View>
              {!!err && <AppText variant="caption" color={colors.danger} style={{ marginTop: spacing.xs }}>{err}</AppText>}
            </View>
          );
        }
        if (f.type === 'multiselect') {
          const set = new Set(v || []);
          return (
            <View key={f.key}>
              <AppText variant="bodyStrong" style={{ marginBottom: spacing.sm }}>{label}</AppText>
              <View style={styles.chips}>
                {f.options.map((o) => (
                  <Chip key={o.value} label={o.label} active={set.has(o.value)} onPress={() => { set.has(o.value) ? set.delete(o.value) : set.add(o.value); onChange(f.key, [...set]); }} />
                ))}
              </View>
              {!!err && <AppText variant="caption" color={colors.danger} style={{ marginTop: spacing.xs }}>{err}</AppText>}
            </View>
          );
        }
        if (f.type === 'boolean') {
          return <Checkbox key={f.key} checked={Boolean(v)} onChange={(x) => onChange(f.key, x)} label={f.label} />;
        }
        const numeric = f.type === 'number' || f.type === 'year';
        return (
          <View key={f.key}>
            <AppText variant="bodyStrong" style={{ marginBottom: spacing.sm }}>{label}</AppText>
            {f.type === 'date' ? (
              // eslint-disable-next-line jsx-a11y/no-static-element-interactions
              <input type="date" value={v || ''} onChange={(e) => onChange(f.key, e.target.value || undefined)} style={styles.date} />
            ) : (
              <Field
                value={v === undefined || v === null ? '' : String(v)}
                onChangeText={(x) => onChange(f.key, x === '' ? undefined : numeric ? x.replace(/[^\d.]/g, '') : x)}
                keyboardType={numeric ? 'number-pad' : undefined}
                multiline={f.type === 'textarea'}
                maxLength={f.maxLength}
                error={err}
              />
            )}
            {f.type === 'date' && !!err && <AppText variant="caption" color={colors.danger}>{err}</AppText>}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  date: { border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: 12, fontSize: 15, width: '100%', boxSizing: 'border-box' },
});
