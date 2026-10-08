import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LocateFixed, MapPin, Search } from 'lucide-react';
import { ActivityIndicator, Pressable, StyleSheet, View } from './primitives';
import { AppText, Field } from './ui';
import { MapPicker } from './MapPicker';
import { colors, radius, spacing } from '@theme/tokens';
import { placesApi } from '../api/endpoints';
import { errorText } from '../i18n';
import { getPosition } from '../services/geolocation';

const newToken = () => crypto.randomUUID().replace(/-/g, '');

/**
 * Pick a place on the map: search any place (Google), use GPS, or drag the pin.
 * Controlled: `value` is { label, name, placeId, lat, lng, address } or null; `onChange(place)`.
 * `popular` (optional) shows shortcut chips while nothing is chosen.
 */
export const PlacePicker = ({ value, onChange, popular = [] }) => {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [message, setMessage] = useState({ kind: '', text: '' });
  const [busy, setBusy] = useState(false);
  const token = useRef(newToken());
  const dragTimer = useRef(null);

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

  const pickSuggestion = async (s) => {
    setBusy(true);
    setMessage({ kind: '', text: '' });
    try {
      const { data } = await placesApi.details(s.placeId, token.current);
      token.current = newToken();
      onChange(data);
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
      onChange(data ?? { label: t('location.pinned'), name: t('location.pinned'), lat, lng, address: {} });
      setMessage({ kind: '', text: '' });
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      setMessage({ kind: 'error', text: code === 'denied' ? t('location.denied') : code === 'unsupported' ? t('location.unsupported') : code === 'unavailable' ? t('location.notFound') : errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  // pin moved on the map → look up the new address once the user stops dragging
  const onPinMoved = (lat, lng) => {
    onChange({ ...value, lat, lng });
    clearTimeout(dragTimer.current);
    dragTimer.current = setTimeout(async () => {
      try {
        const { data } = await placesApi.reverse(lat, lng);
        onChange(data ? { ...data, lat, lng } : { label: t('location.pinned'), name: t('location.pinned'), lat, lng, address: {} });
        setMessage({ kind: '', text: '' });
      } catch (e) {
        setMessage({ kind: 'error', text: errorText(e) });
      }
    }, 500);
  };

  return (
    <View style={{ gap: spacing.md }}>
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

      {!!message.text && <AppText variant="caption" color={message.kind === 'error' ? colors.danger : colors.textMuted}>{message.text}</AppText>}

      {popular.length > 0 && !value && (
        <View>
          <AppText variant="small" color={colors.textMuted} style={{ marginBottom: spacing.sm }}>{t('location.popular')}</AppText>
          <View style={styles.chips}>
            {popular.map((p) => (
              <Pressable key={p.placeId} onPress={() => onChange({ placeId: p.placeId, name: p.name, label: p.label, lat: p.lat, lng: p.lng, address: p.countryCode ? { countryCode: p.countryCode } : {} })} style={styles.chip}>
                <AppText variant="bodyStrong">{p.name}</AppText>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {value && (
        <>
          <View style={styles.selected}>
            <MapPin size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">{value.label}</AppText>
              <AppText variant="caption" color={colors.textMuted}>{t('location.dragPin')}</AppText>
            </View>
          </View>
          <MapPicker lat={value.lat} lng={value.lng} onMove={onPinMoved} fallback={<AppText variant="caption" color={colors.textMuted}>{t('location.mapUnavailable')}</AppText>} />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  list: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  gps: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  selected: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
});
