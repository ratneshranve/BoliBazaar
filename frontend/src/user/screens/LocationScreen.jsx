import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronRight, LocateFixed, MapPin, Search } from 'lucide-react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from '../components/primitives';
import { AppText, Field } from '../components/ui';
import { colors, radius, spacing } from '@theme/tokens';
import { locationsApi } from '../api/endpoints';
import { chooseLocation, useAppDispatch } from '../store';

/** Ask the browser/device for GPS; resolves { lat, lng } or rejects with 'denied' | 'unavailable'. */
const getPosition = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (err) => reject(new Error(err.code === 1 ? 'denied' : 'unavailable')),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  });

const Row = ({ title, subtitle, onPress, chevron }) => (
  <Pressable onPress={onPress} style={styles.row}>
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
export const LocationScreen = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [trail, setTrail] = useState([]); // drilled-down places
  const [children, setChildren] = useState(null);
  const [gps, setGps] = useState({ state: 'idle', message: '' });
  const parent = trail[trail.length - 1];

  // search as you type
  useEffect(() => {
    if (q.trim().length < 2) return setResults(null);
    const id = setTimeout(() => {
      locationsApi.search(q.trim()).then(({ data }) => setResults(data)).catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  // browse
  useEffect(() => {
    setChildren(null);
    locationsApi.children(parent?.id).then(({ data }) => setChildren(data)).catch(() => setChildren([]));
  }, [parent?.id]);

  const pick = async (loc) => {
    await dispatch(chooseLocation(loc));
    navigate(-1);
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
      setGps({ state: 'error', message: e.message === 'denied' ? t('location.denied') : e.message === 'unsupported' ? t('location.unsupported') : t('location.notFound') });
    }
  };

  const back = () => (trail.length && !q ? setTrail(trail.slice(0, -1)) : navigate(-1));

  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={t('common.back')} onPress={back}>
          <ArrowLeft size={24} color={colors.text} />
        </Pressable>
        <AppText variant="h3">{t('location.title')}</AppText>
      </View>

      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Field value={q} onChangeText={setQ} placeholder={t('location.search')} left={<Search size={18} color={colors.textMuted} style={{ marginRight: 8 }} />} />
        <Pressable onPress={useGps} disabled={gps.state === 'busy'} style={styles.gps}>
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

      <ScrollView>
        {results ? (
          results.length === 0 ? (
            <AppText color={colors.textMuted} style={{ padding: spacing.xl, textAlign: 'center' }}>
              {t('location.noResults')}
            </AppText>
          ) : (
            results.map((r) => <Row key={r.id} title={r.name} subtitle={r.path} onPress={() => pick(r)} />)
          )
        ) : (
          <>
            <AppText variant="small" color={colors.textMuted} style={styles.section}>
              {parent ? parent.path : t('location.countries')}
            </AppText>
            {parent && <Row title={t('location.selectHere', { name: parent.name })} subtitle={parent.path} onPress={() => pick(parent)} />}
            {!children && (
              <View style={{ padding: spacing.xl, alignItems: 'center' }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            )}
            {children?.map((c) => (
              <Row key={c.id} title={c.name} subtitle={c.pinCodes?.[0]} chevron={c.childCount > 0} onPress={() => (c.childCount > 0 ? setTrail([...trail, c]) : pick(c))} />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  gps: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  section: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.surface },
});
