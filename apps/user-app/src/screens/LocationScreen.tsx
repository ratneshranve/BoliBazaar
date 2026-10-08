import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronRight, LocateFixed, MapPin, Search } from 'lucide-react-native';
import { AppText, Field } from '../components/ui';
import { colors, radius, spacing } from '../theme/tokens';
import { locationsApi } from '../api/endpoints';
import type { PlaceLite, PlaceNode } from '../api/types';
import { chooseLocation, useAppDispatch } from '../store';
import { getPosition } from '../services/geolocation';
import type { RootStackParamList } from '../navigation/types';

const Row = ({ title, subtitle, onPress, chevron }: { title: string; subtitle?: string; onPress: () => void; chevron?: boolean }) => (
  <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
    <MapPin size={20} color={colors.textMuted} />
    <View style={{ flex: 1 }}>
      <AppText variant="bodyStrong">{title}</AppText>
      {!!subtitle && (
        <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
          {subtitle}
        </AppText>
      )}
    </View>
    {chevron && <ChevronRight size={20} color={colors.textMuted} />}
  </Pressable>
);

/**
 * Pick the place you're browsing from: search by name/PIN, browse down from the country,
 * or use GPS (matched to the nearest known place from the admin-managed location list).
 */
export const LocationScreen = ({ navigation }: NativeStackScreenProps<RootStackParamList, 'Location'>) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PlaceLite[] | null>(null);
  const [trail, setTrail] = useState<PlaceNode[]>([]);
  const [children, setChildren] = useState<PlaceNode[] | null>(null);
  const [gps, setGps] = useState<{ state: 'idle' | 'busy' | 'error'; message: string }>({ state: 'idle', message: '' });
  const parent = trail[trail.length - 1];

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    const id = setTimeout(() => {
      locationsApi.search(q.trim()).then(({ data }) => setResults(data)).catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    setChildren(null);
    locationsApi.children(parent?.id).then(({ data }) => setChildren(data)).catch(() => setChildren([]));
  }, [parent?.id]);

  const pick = async (loc: PlaceLite) => {
    await dispatch(chooseLocation({ id: loc.id, name: loc.name, path: loc.path, type: loc.type }));
    navigation.goBack();
  };

  const useGps = async () => {
    setGps({ state: 'busy', message: t('location.locating') });
    try {
      const { lat, lng } = await getPosition();
      const { data } = await locationsApi.reverse(lat, lng);
      if (!data) return setGps({ state: 'error', message: t('location.notFound') });
      setGps({ state: 'idle', message: '' });
      await pick(data);
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      setGps({ state: 'error', message: code === 'denied' ? t('location.denied') : t('location.notFound') });
    }
  };

  const back = () => (trail.length && !q ? setTrail(trail.slice(0, -1)) : navigation.goBack());

  return (
    <SafeAreaView style={styles.fill}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={back}>
          <ArrowLeft size={24} color={colors.text} />
        </Pressable>
        <AppText variant="h3">{t('location.title')}</AppText>
      </View>

      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Field value={q} onChangeText={setQ} placeholder={t('location.search')} left={<Search size={18} color={colors.textMuted} style={{ marginRight: 8 }} />} />
        <Pressable accessibilityRole="button" onPress={useGps} disabled={gps.state === 'busy'} style={styles.gps}>
          {gps.state === 'busy' ? <ActivityIndicator color={colors.primary} /> : <LocateFixed size={20} color={colors.primary} />}
          <AppText variant="bodyStrong" color={colors.primary}>
            {t('location.current')}
          </AppText>
        </Pressable>
        {!!gps.message && (
          <AppText variant="caption" color={gps.state === 'error' ? colors.danger : colors.textMuted}>
            {gps.message}
          </AppText>
        )}
      </View>

      <ScrollView keyboardShouldPersistTaps="handled">
        {results ? (
          results.length === 0 ? (
            <AppText color={colors.textMuted} style={{ padding: spacing.xl, textAlign: 'center' }}>
              {t('location.noResults')}
            </AppText>
          ) : (
            results.map(r => <Row key={r.id} title={r.name} subtitle={r.path} onPress={() => pick(r)} />)
          )
        ) : (
          <>
            <AppText variant="small" color={colors.textMuted} style={styles.section}>
              {parent ? parent.path : t('location.countries')}
            </AppText>
            {parent && <Row title={t('location.selectHere', { name: parent.name })} subtitle={parent.path} onPress={() => pick(parent)} />}
            {!children && <ActivityIndicator style={{ padding: spacing.xl }} color={colors.primary} />}
            {children?.map(c => (
              <Row key={c.id} title={c.name} subtitle={c.pinCodes?.[0]} chevron={c.childCount > 0} onPress={() => (c.childCount > 0 ? setTrail([...trail, c]) : pick(c))} />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  gps: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  section: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.surface },
});
