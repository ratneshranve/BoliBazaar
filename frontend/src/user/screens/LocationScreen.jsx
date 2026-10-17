import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Briefcase, ChevronRight, Home, LocateFixed, MapPin, Navigation, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from '../components/primitives';
import { AppText, Button } from '../components/ui';
import { MapPicker } from '../components/MapPicker';
import { colors, radius, spacing } from '@theme/tokens';
import { chooseLocation, useAppDispatch, useAppSelector } from '../store';
import { formatDistance } from '../utils/distance';
import { uuid } from '../utils/uuid';
import { meApi, placesApi } from '../api/endpoints';
import { errorText } from '../i18n';
import { getPosition } from '../services/geolocation';
import { confirmAsync } from '../services/dialogs';

const KIND_ICON = { home: Home, work: Briefcase, other: MapPin };
const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 }; // India, until a place is chosen
const newToken = () => uuid().replace(/-/g, '');

const gpsError = (e, t) => {
  const code = e instanceof Error ? e.message : '';
  return code === 'denied' ? t('location.denied') : code === 'unsupported' ? t('location.unsupported') : code === 'unavailable' ? t('location.notFound') : errorText(e);
};

/** Look up the address at a map point (falls back to a plain "Selected point"). */
const placeAt = async (lat, lng, t) => {
  const { data } = await placesApi.reverse(lat, lng);
  return data ? { ...data, lat, lng } : { label: t('location.pinned'), name: t('location.pinned'), lat, lng, address: {} };
};

const Chip = ({ label, active, onPress }) => (
  <Pressable onPress={onPress} style={[styles.chip, active && styles.chipOn]}>
    <AppText variant="bodyStrong" color={active ? colors.white : colors.text}>{label}</AppText>
  </Pressable>
);

const Header = ({ title, onBack }) => (
  <View style={styles.header}>
    <Pressable accessibilityLabel="Back" onPress={onBack} style={{ padding: spacing.xs }}>
      <ArrowLeft size={22} color={colors.text} />
    </Pressable>
    <AppText variant="h3">{title}</AppText>
  </View>
);

/** Select Location: use GPS, or one of your saved addresses. The radius row sets how far around it ads are shown. */
export const LocationScreen = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const settings = useAppSelector((s) => s.app.bootstrap?.location);
  const current = useAppSelector((s) => s.location.current);
  const loggedIn = useAppSelector((s) => s.session.status === 'authenticated');
  const [scope, setScope] = useState(current?.scope ?? { type: 'radius', km: settings?.defaultRadiusKm });
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loggedIn) return;
    meApi.locations().then(({ data }) => setSaved(data)).catch(() => setSaved([]));
  }, [loggedIn]);

  const pick = async (place) => {
    await dispatch(chooseLocation({ ...place, scope }));
    navigate(-1);
  };

  const useGps = async () => {
    setBusy(true);
    setError('');
    try {
      const { lat, lng } = await getPosition();
      await pick(await placeAt(lat, lng, t));
    } catch (e) {
      setError(gpsError(e, t));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (a) => {
    if (!(await confirmAsync(t('location.deleteConfirm', { name: a.label })))) return;
    try {
      await meApi.deleteLocation(a.id);
      setSaved((list) => list.filter((x) => x.id !== a.id));
    } catch (e) {
      setError(errorText(e));
    }
  };

  if (!settings) return null;
  const wide = Object.entries(settings.wideScopes).filter(([, on]) => on);

  return (
    <View style={styles.fill}>
      <Header title={t('location.title')} onBack={() => navigate(-1)} />
      <ScrollView style={{ backgroundColor: colors.surface }} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        <View style={styles.top}>
          <Pressable onPress={useGps} disabled={busy} style={styles.gpsCard}>
            <View style={styles.gpsIcon}>
              {busy ? <ActivityIndicator color={colors.primary} /> : <Navigation size={20} color={colors.primary} />}
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong" color={colors.primary}>{t('location.useCurrent')}</AppText>
              <AppText variant="small" color={colors.textMuted}>{busy ? t('location.locating') : t('location.enableGps')}</AppText>
            </View>
            <ChevronRight size={20} color={colors.textSubtle} />
          </Pressable>
          {!!error && <AppText variant="caption" color={colors.danger} style={{ marginTop: spacing.sm }}>{error}</AppText>}

          <AppText variant="small" color={colors.textMuted} style={styles.sectionLabel}>{t('location.radius')}</AppText>
          <View style={styles.chips}>
            {settings.radiusOptionsKm.map((km) => (
              <Chip key={km} label={formatDistance(km, settings.distanceUnit)} active={scope.type === 'radius' && scope.km === km} onPress={() => setScope({ type: 'radius', km })} />
            ))}
            {wide.map(([type]) => (
              <Chip key={type} label={t(`location.scope_${type}`)} active={scope.type === type} onPress={() => setScope({ type })} />
            ))}
          </View>
        </View>

        <View style={styles.savedHead}>
          <AppText variant="small" color={colors.textMuted} style={styles.sectionCaps}>{t('location.saved')}</AppText>
          <Pressable onPress={() => navigate(loggedIn ? '/location/new' : '/login')} style={styles.addNew}>
            <Plus size={16} color={colors.primary} />
            <AppText variant="bodyStrong" color={colors.primary}>{t('location.addNew')}</AppText>
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
          {!loggedIn && <AppText variant="caption" color={colors.textMuted}>{t('location.loginToSave')}</AppText>}
          {loggedIn && saved === null && <ActivityIndicator color={colors.primary} />}
          {loggedIn && saved?.length === 0 && <AppText variant="caption" color={colors.textMuted}>{t('location.noSaved')}</AppText>}
          {saved?.map((a) => {
            const Icon = KIND_ICON[a.kind] ?? MapPin;
            return (
              <Pressable key={a.id} onPress={() => pick(a.place)} style={styles.addr}>
                <View style={styles.addrIcon}><Icon size={18} color={colors.text} /></View>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong">{a.label}</AppText>
                  <AppText variant="small" color={colors.textMuted} numberOfLines={2}>
                    {[a.details, a.place.label].filter(Boolean).join(', ')}
                  </AppText>
                </View>
                <Pressable accessibilityLabel="Edit" onPress={() => navigate(`/location/${a.id}/edit`)} style={styles.iconBtn}>
                  <Pencil size={17} color={colors.textMuted} />
                </Pressable>
                <Pressable accessibilityLabel="Delete" onPress={() => remove(a)} style={styles.iconBtn}>
                  <Trash2 size={17} color={colors.textMuted} />
                </Pressable>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

/** Add / edit an address: search or tap the map, then name it. "Just use this location" browses from the pin without saving. */
export const AddressMapScreen = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { id } = useParams();
  const settings = useAppSelector((s) => s.app.bootstrap?.location);
  const current = useAppSelector((s) => s.location.current);
  const [place, setPlace] = useState(null);
  const [primary, setPrimary] = useState('');
  const [details, setDetails] = useState('');
  const [kind, setKind] = useState('home');
  const [name, setName] = useState('');
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(id));
  const token = useRef(newToken());
  const dragTimer = useRef(null);

  const setPicked = (p) => {
    setPlace(p);
    setPrimary(p.label ?? '');
  };

  useEffect(() => {
    if (!id) return;
    meApi
      .locations()
      .then(({ data }) => {
        const a = data.find((x) => x.id === id);
        if (a) {
          setPicked(a.place);
          setDetails(a.details);
          setKind(a.kind);
          setName(a.kind === 'other' ? a.label : '');
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (q.trim().length < 2) return setSuggestions([]);
    const timer = setTimeout(() => {
      placesApi.autocomplete(q.trim(), token.current).then(({ data }) => setSuggestions(data)).catch(() => setSuggestions([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const choose = async (s) => {
    setBusy(true);
    try {
      const { data } = await placesApi.details(s.placeId, token.current);
      token.current = newToken();
      setPicked(data);
      setQ('');
      setSuggestions([]);
      setMsg('');
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const useGps = async () => {
    setBusy(true);
    setMsg('');
    try {
      const { lat, lng } = await getPosition();
      setPicked(await placeAt(lat, lng, t));
    } catch (e) {
      setMsg(gpsError(e, t));
    } finally {
      setBusy(false);
    }
  };

  const onPinMoved = (lat, lng) => {
    setPlace((p) => ({ ...(p ?? { label: t('location.pinned'), address: {} }), lat, lng }));
    clearTimeout(dragTimer.current);
    dragTimer.current = setTimeout(async () => {
      try {
        setPicked(await placeAt(lat, lng, t));
      } catch (e) {
        setMsg(errorText(e));
      }
    }, 500);
  };

  const placeBody = () => ({ label: primary.trim() || place.label, name: place.name, placeId: place.placeId, lat: place.lat, lng: place.lng, address: place.address });
  const scopeNow = () => current?.scope ?? { type: 'radius', km: settings?.defaultRadiusKm };

  const save = async () => {
    setBusy(true);
    setMsg('');
    try {
      const b = {
        label: kind === 'other' ? name.trim() || t('location.kind_other') : t(`location.kind_${kind}`),
        kind,
        details: details.trim() || undefined,
        place: placeBody(),
      };
      if (id) await meApi.updateLocation(id, b);
      else await meApi.addLocation(b);
      await dispatch(chooseLocation({ ...b.place, scope: scopeNow() }));
      navigate(-2);
    } catch (e) {
      setMsg(errorText(e));
      setBusy(false);
    }
  };

  const browseOnly = async () => {
    await dispatch(chooseLocation({ ...placeBody(), scope: scopeNow() }));
    navigate(-2);
  };

  if (!settings || loading) {
    return (
      <View style={styles.fill}>
        <Header title={t('location.addTitle')} onBack={() => navigate(-1)} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary} /></View>
      </View>
    );
  }

  const center = place ?? current ?? settings.popularPlaces?.[0] ?? DEFAULT_CENTER;

  return (
    <View style={styles.fill}>
      <Header title={id ? t('location.editTitle') : t('location.addTitle')} onBack={() => navigate(-1)} />

      <View style={{ height: 280 }}>
        <MapPicker lat={center.lat} lng={center.lng} height={280} onMove={onPinMoved} fallback={<View style={{ height: 280, backgroundColor: colors.surface }} />} />
        <View style={styles.searchWrap}>
          <View style={styles.searchBar}>
            <Search size={18} color={colors.textMuted} />
            <TextInput value={q} onChangeText={setQ} placeholder={t('location.mapSearch')} placeholderTextColor={colors.textSubtle} style={styles.searchInput} />
          </View>
          {suggestions.length > 0 && (
            <View style={styles.suggest}>
              {suggestions.map((s) => (
                <Pressable key={s.placeId} onPress={() => choose(s)} style={styles.suggestRow}>
                  <MapPin size={16} color={colors.textMuted} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong" numberOfLines={1}>{s.primary}</AppText>
                    <AppText variant="small" color={colors.textMuted} numberOfLines={1}>{s.secondary}</AppText>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>
        <Pressable onPress={useGps} disabled={busy} style={styles.myLoc}>
          {busy ? <ActivityIndicator color={colors.primary} /> : <LocateFixed size={16} color={colors.primary} />}
          <AppText variant="bodyStrong">{t('location.useMy')}</AppText>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.form}>
        <View style={styles.pinned}>
          <MapPin size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <AppText variant="small" color={colors.primaryDark} style={{ fontWeight: '700', letterSpacing: 0.4 }}>{t('location.pinnedCaps')}</AppText>
            <AppText variant="bodyStrong" numberOfLines={2}>{place ? place.label : t('location.selectOnMap')}</AppText>
          </View>
        </View>

        <View>
          <AppText variant="bodyStrong" style={styles.fieldLabel}>{t('location.primary')}</AppText>
          <TextInput value={primary} onChangeText={setPrimary} placeholder={t('location.primaryHint')} placeholderTextColor={colors.textSubtle} style={styles.input} />
          <AppText variant="small" color={colors.textMuted} style={{ marginTop: 4 }}>{t('location.autoFilled')}</AppText>
        </View>

        <View>
          <AppText variant="bodyStrong" style={styles.fieldLabel}>{t('location.secondary')}</AppText>
          <TextInput value={details} onChangeText={setDetails} placeholder={t('location.secondaryHint')} placeholderTextColor={colors.textSubtle} style={styles.input} />
        </View>

        <View>
          <AppText variant="bodyStrong" style={styles.fieldLabel}>{t('location.saveAs')}</AppText>
          <View style={styles.chips}>
            {['home', 'work', 'other'].map((k) => <Chip key={k} label={t(`location.kind_${k}`)} active={kind === k} onPress={() => setKind(k)} />)}
          </View>
          {kind === 'other' && (
            <TextInput value={name} onChangeText={setName} maxLength={40} placeholder={t('location.nameHint')} placeholderTextColor={colors.textSubtle} style={[styles.input, { marginTop: spacing.sm }]} />
          )}
        </View>

        {!!msg && <AppText variant="caption" color={colors.danger}>{msg}</AppText>}
      </ScrollView>

      <View style={styles.footer}>
        <Button title={t('location.saveProceed')} onPress={save} loading={busy} disabled={!place} />
        {!id && !!place && (
          <Pressable onPress={browseOnly} style={{ alignItems: 'center', paddingTop: spacing.md }}>
            <AppText variant="bodyStrong" color={colors.brand}>{t('location.useWithoutSaving')}</AppText>
          </Pressable>
        )}
      </View>
    </View>
  );
};

const shadowSm = { shadowColor: '#111827', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 };

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  top: { backgroundColor: colors.white, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  gpsCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.divider, ...shadowSm, shadowOpacity: 0.08, elevation: 2 },
  gpsIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionCaps: { fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  savedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  addNew: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addr: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.divider },
  addrIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { padding: 6 },
  searchWrap: { position: 'absolute', left: spacing.md, right: spacing.md, top: spacing.md },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 46, ...shadowSm },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, borderWidth: 0, backgroundColor: 'transparent' },
  suggest: { marginTop: 4, backgroundColor: colors.white, borderRadius: radius.md, overflow: 'hidden', ...shadowSm },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  myLoc: { position: 'absolute', right: spacing.md, bottom: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.white, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 10, ...shadowSm },
  form: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },
  pinned: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  fieldLabel: { marginBottom: 6 },
  input: { height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.md, fontSize: 15, color: colors.text },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.white },
});
