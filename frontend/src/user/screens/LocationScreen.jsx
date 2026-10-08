import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, LocateFixed, MapPin, Search } from 'lucide-react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from '../components/primitives';
import { AppText, Button, Field } from '../components/ui';
import { MapPicker } from '../components/MapPicker';
import { colors, radius, spacing } from '@theme/tokens';
import { placesApi } from '../api/endpoints';
import { errorText } from '../i18n';
import { chooseLocation, useAppDispatch, useAppSelector } from '../store';
import { getPosition } from '../services/geolocation';
import { formatDistance } from '../utils/distance';

const newToken = () => crypto.randomUUID().replace(/-/g, '');

const Chip = ({ label, active, onPress }) => (
  <Pressable onPress={onPress} style={[styles.chip, active && styles.chipOn]}>
    <AppText variant="bodyStrong" color={active ? colors.white : colors.text}>
      {label}
    </AppText>
  </Pressable>
);

/**
 * Choose where you are and how far to look — like OLX:
 * search any place (Google), use GPS, or drag the pin; then pick a distance around it.
 */
export const LocationScreen = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const settings = useAppSelector((s) => s.app.bootstrap?.location);
  const current = useAppSelector((s) => s.location.current);

  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [draft, setDraft] = useState(current); // the place being chosen
  const [scope, setScope] = useState(current?.scope ?? { type: 'radius', km: settings?.defaultRadiusKm });
  const [message, setMessage] = useState({ kind: '', text: '' });
  const [busy, setBusy] = useState(false);
  const token = useRef(newToken());
  const dragTimer = useRef(null);

  // autocomplete while typing
  useEffect(() => {
    if (q.trim().length < 2) return setSuggestions([]);
    const id = setTimeout(() => {
      placesApi
        .autocomplete(q.trim(), token.current)
        .then(({ data }) => setSuggestions(data))
        .catch((e) => {
          setSuggestions([]);
          setMessage({ kind: 'error', text: errorText(e) });
        });
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  const withScope = (place) => ({ ...place, scope });

  const pickSuggestion = async (s) => {
    setBusy(true);
    setMessage({ kind: '', text: '' });
    try {
      const { data } = await placesApi.details(s.placeId, token.current);
      token.current = newToken(); // a new search session starts after a place is chosen
      setDraft(withScope(data));
      setQ('');
      setSuggestions([]);
    } catch (e) {
      setMessage({ kind: 'error', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const useGps = async () => {
    setBusy(true);
    setMessage({ kind: 'info', text: t('location.locating') });
    try {
      const { lat, lng } = await getPosition();
      const { data } = await placesApi.reverse(lat, lng);
      setDraft(withScope(data ?? { label: t('location.pinned'), name: t('location.pinned'), lat, lng, address: {} }));
      setMessage({ kind: '', text: '' });
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      setMessage({ kind: 'error', text: code === 'denied' ? t('location.denied') : code === 'unsupported' ? t('location.unsupported') : code === 'unavailable' ? t('location.notFound') : errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const pickPopular = (p) => setDraft(withScope({ placeId: p.placeId, name: p.name, label: p.label, lat: p.lat, lng: p.lng, address: p.countryCode ? { countryCode: p.countryCode } : {} }));

  // pin moved on the map → look up the new address (after the user stops dragging)
  const onPinMoved = (lat, lng) => {
    setDraft((d) => ({ ...d, lat, lng }));
    clearTimeout(dragTimer.current);
    dragTimer.current = setTimeout(async () => {
      try {
        const { data } = await placesApi.reverse(lat, lng);
        setDraft((d) => ({ ...(data ?? { label: t('location.pinned'), name: t('location.pinned'), address: {} }), lat, lng, scope: d.scope }));
        setMessage({ kind: '', text: '' });
      } catch (e) {
        setMessage({ kind: 'error', text: errorText(e) });
      }
    }, 500);
  };

  const chooseScope = (next) => {
    setScope(next);
    setDraft((d) => (d ? { ...d, scope: next } : d));
  };

  const apply = async () => {
    await dispatch(chooseLocation({ ...draft, scope }));
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

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}>
        <Field value={q} onChangeText={setQ} placeholder={t('location.search')} left={<Search size={18} color={colors.textMuted} style={{ marginRight: 8 }} />} />

        {suggestions.length > 0 && (
          <View style={styles.list}>
            {suggestions.map((s) => (
              <Pressable key={s.placeId} onPress={() => pickSuggestion(s)} style={styles.row}>
                <MapPin size={18} color={colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong">{s.primary}</AppText>
                  <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>{s.secondary}</AppText>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        <Pressable onPress={useGps} disabled={busy} style={styles.gps}>
          {busy ? <ActivityIndicator color={colors.primary} /> : <LocateFixed size={20} color={colors.primary} />}
          <AppText variant="bodyStrong" color={colors.primary}>{t('location.current')}</AppText>
        </Pressable>

        {!!message.text && (
          <AppText variant="caption" color={message.kind === 'error' ? colors.danger : colors.textMuted}>
            {message.text}
          </AppText>
        )}

        {settings.popularPlaces.length > 0 && !draft && (
          <View>
            <AppText variant="small" color={colors.textMuted} style={{ marginBottom: spacing.sm }}>{t('location.popular')}</AppText>
            <View style={styles.chips}>
              {settings.popularPlaces.map((p) => (
                <Chip key={p.placeId} label={p.name} onPress={() => pickPopular(p)} />
              ))}
            </View>
          </View>
        )}

        {draft && (
          <>
            <View style={styles.selected}>
              <MapPin size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">{draft.label}</AppText>
                <AppText variant="caption" color={colors.textMuted}>{t('location.dragPin')}</AppText>
              </View>
            </View>
            <MapPicker lat={draft.lat} lng={draft.lng} onMove={onPinMoved} fallback={<AppText variant="caption" color={colors.textMuted}>{t('location.mapUnavailable')}</AppText>} />

            <View>
              <AppText variant="bodyStrong" style={{ marginBottom: spacing.sm }}>{t('location.radius')}</AppText>
              <View style={styles.chips}>
                {settings.radiusOptionsKm.map((km) => (
                  <Chip key={km} label={formatDistance(km, settings.distanceUnit)} active={scope.type === 'radius' && scope.km === km} onPress={() => chooseScope({ type: 'radius', km })} />
                ))}
                {wide.map(([type]) => (
                  <Chip key={type} label={t(`location.scope_${type}`)} active={scope.type === type} onPress={() => chooseScope({ type })} />
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
  list: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  gps: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  selected: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
});
