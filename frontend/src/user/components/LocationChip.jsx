import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, MapPin } from 'lucide-react';
import { Pressable, StyleSheet } from './primitives';
import { AppText } from './ui';
import { useAppSelector } from '../store';
import { scopeText } from '../utils/distance';
import { colors, radius, spacing } from '@theme/tokens';

/** The place the user is browsing from and how far around it (opens the location picker). */
export const LocationChip = ({ maxWidth = 120, style, textStyle }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const current = useAppSelector((s) => s.location.current);
  const unit = useAppSelector((s) => s.app.bootstrap?.location?.distanceUnit);
  return (
    <Pressable
      accessibilityLabel={t('location.title')}
      onPress={() => navigate('/location')}
      style={({ pressed }) => [styles.chip, style, pressed && { opacity: 0.75 }]}
    >
      <MapPin size={15} color={colors.primary} />
      <AppText
        variant="caption"
        numberOfLines={1}
        style={[styles.text, { maxWidth }, textStyle]}
      >
        {current ? `${current.name || current.label.split(',')[0]} · ${scopeText(current.scope, unit, t)}` : t('home.chooseLocation')}
      </AppText>
      <ChevronDown size={14} color={colors.textMuted} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    flexShrink: 1, // gives way to the brand name on narrow phones; the place name truncates
    minWidth: 0,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: colors.text,
  },
});
