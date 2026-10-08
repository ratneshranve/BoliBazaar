import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, MapPin } from 'lucide-react';
import { Pressable, StyleSheet } from './primitives';
import { AppText } from './ui';
import { useAppSelector } from '../store';
import { scopeText } from '../utils/distance';
import { colors, spacing } from '@theme/tokens';

/** The place the user is browsing from and how far around it (opens the location picker). */
export const LocationChip = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const current = useAppSelector((s) => s.location.current);
  const unit = useAppSelector((s) => s.app.bootstrap?.location?.distanceUnit);
  return (
    <Pressable accessibilityLabel={t('location.title')} onPress={() => navigate('/location')} style={styles.chip}>
      <MapPin size={18} color={colors.primary} />
      <AppText variant="bodyStrong" numberOfLines={1} style={{ maxWidth: 150 }}>
        {current ? `${current.name || current.label.split(',')[0]} · ${scopeText(current.scope, unit, t)}` : t('home.chooseLocation')}
      </AppText>
      <ChevronDown size={16} color={colors.textMuted} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
});
