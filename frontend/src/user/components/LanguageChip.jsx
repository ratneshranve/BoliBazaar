import { useNavigate } from 'react-router-dom';
import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from './primitives';
import { AppText } from './ui';
import { useAppSelector } from '../store';
import { colors, spacing } from '@theme/tokens';

/** Shown only when the admin has enabled more than one language. */
export const LanguageChip = () => {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const count = useAppSelector((s) => s.app.bootstrap?.languages?.items?.length ?? 0);
  if (count < 2) return null;
  return (
    <Pressable accessibilityLabel="Language" onPress={() => navigate('/language')} style={styles.chip}>
      <Globe size={18} color={colors.text} />
      <AppText variant="bodyStrong">{i18n.language.toUpperCase()}</AppText>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
