import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Pressable, ScrollView, StyleSheet, View } from '../components/primitives';
import { AppText, Button } from '../components/ui';
import { PlacePicker } from '../components/PlacePicker';
import { colors, radius, spacing } from '@theme/tokens';
import { chooseLocation, useAppDispatch, useAppSelector } from '../store';
import { formatDistance } from '../utils/distance';

const Chip = ({ label, active, onPress }) => (
  <Pressable onPress={onPress} style={[styles.chip, active && styles.chipOn]}>
    <AppText variant="bodyStrong" color={active ? colors.white : colors.text}>{label}</AppText>
  </Pressable>
);

/** Where am I, and how far should I look? (place picker + a distance from the admin's options) */
export const LocationScreen = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const settings = useAppSelector((s) => s.app.bootstrap?.location);
  const current = useAppSelector((s) => s.location.current);
  const [place, setPlace] = useState(current);
  const [scope, setScope] = useState(current?.scope ?? { type: 'radius', km: settings?.defaultRadiusKm });

  const apply = async () => {
    await dispatch(chooseLocation({ ...place, scope }));
    navigate(-1);
  };

  if (!settings) return null;
  const wide = Object.entries(settings.wideScopes).filter(([, on]) => on);

  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={t('common.back')} onPress={() => navigate(-1)}>
          <ArrowLeft size={24} color={colors.text} />
        </Pressable>
        <AppText variant="h3">{t('location.title')}</AppText>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl }}>
        <PlacePicker value={place} onChange={setPlace} popular={settings.popularPlaces} />

        {place && (
          <>
            <View>
              <AppText variant="bodyStrong" style={{ marginBottom: spacing.sm }}>{t('location.radius')}</AppText>
              <View style={styles.chips}>
                {settings.radiusOptionsKm.map((km) => (
                  <Chip key={km} label={formatDistance(km, settings.distanceUnit)} active={scope.type === 'radius' && scope.km === km} onPress={() => setScope({ type: 'radius', km })} />
                ))}
                {wide.map(([type]) => (
                  <Chip key={type} label={t(`location.scope_${type}`)} active={scope.type === type} onPress={() => setScope({ type })} />
                ))}
              </View>
            </View>
            <Button title={t('location.apply')} onPress={apply} />
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
});
