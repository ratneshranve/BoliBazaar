import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Briefcase, ChevronLeft, ChevronRight, Home, MapPin, Navigation, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from '../components/primitives';
import { AppText, Button } from '../components/ui';
import { PinMap } from '../components/PinMap';
import { colors, radius, spacing } from '@theme/tokens';
import { chooseLocation, useAppDispatch, useAppSelector } from '../store';
import { formatDistance } from '../utils/distance';
import { uuid } from '../utils/uuid';
import { meApi, placesApi } from '../api/endpoints';
import { errorText } from '../i18n';
import { getPosition } from '../services/geolocation';
import { confirmAsync } from '../services/dialogs';

const KIND_ICON = { home: Home, work: Briefcase, other: MapPin };
const DEFAULT_CENTER = { lat: 22.7196, lng: 75.8577 }; // until GPS or a saved place says otherwise
const newToken = () => uuid().replace(/-/g, '');

const gpsError = (e, t) => {
  const code = e instanceof Error ? e.message : '';
  return code === 'denied' ? t('location.denied') : code === 'unsupported' ? t('location.unsupported') : code === 'unavailable' ? t('location.notFound') : errorText(e);
};

/** Address at a map point (always returns something usable). */
const placeAt = async (lat, lng, t) => {
  const { data } = await placesApi.reverse(lat, lng);
  return data ? { ...data, lat, lng } : { label: t('location.pinned'), name: t('location.pinned'), lat, lng, address: {} };
};

/** Full address line of a place: "Pawar Villa, N-430, Risi Nagar, Indore, Madhya Pradesh 452007". */
const fullLine = (p) => p?.address?.formatted || p?.label || '';

/** Street / area / landmark part: the full line up to the city ("Pawar Villa, N-430, Risi Nagar"). */
const primaryOf = (p) => {
  if (!p) return '';
  const a = p.address ?? {};
  const parts = (a.formatted || '').split(', ').filter(Boolean);
  const cut = parts.findIndex((x) => [a.city, a.district].includes(x) || (a.state && x.startsWith(a.state)));
  const head = (cut > 0 ? parts.slice(0, cut) : []).join(', ');
  return head || [a.street, a.area].filter(Boolean).join(', ') || p.name || p.label || '';
};

const fmtDistance = (m) => (m == null ? '' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

/** Text field with its own box; `soft` = grey box for auto-filled fields. */
const Input = ({ soft, boxStyle, right, ...props }) => (
  <View style={[styles.inputBox, soft && styles.inputBoxSoft, boxStyle]}>
    <TextInput placeholderTextColor={colors.textSubtle} style={[styles.inputText, !props.editable && props.editable !== undefined && { color: colors.textMuted }]} {...props} />
    {right}
  </View>
);

const Header = ({ title, onBack }) => (
  <View style={styles.header}>
    <Pressable accessibilityLabel="Back" onPress={onBack} style={styles.backBtn}>
      <ChevronLeft size={24} color={colors.text} />
    </Pressable>
    <AppText variant="h3">{title}</AppText>
  </View>
);

/** Place search with suggestions (nearest first). Used by the map's search bar and the Primary Address field. */
const usePlaceSearch = (near) => {
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [searching, setSearching] = useState(false);
  const token = useRef(newToken());
  const skip = useRef(false);
  const latest = useRef(q); // the text as of now, also inside async callbacks
  latest.current = q;

  useEffect(() => {
    if (skip.current) {
      skip.current = false;
      return undefined;
    }
    if (q.trim().length < 3) {
      setList([]);
      setSearching(false);
      return undefined;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await placesApi.autocomplete(q.trim(), token.current, near);
        setList([...data].sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity)).slice(0, 5));
      } catch {
        setList([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  /** Coordinates + address of a chosen suggestion. */
  const resolve = async (s) => {
    const { data } = await placesApi.details(s.placeId, token.current);
    token.current = newToken();
    setList([]);
    return data;
  };
  /** Set the text without searching for it (e.g. filled from the pin). */
  const setQuiet = (text) => {
    if (text !== latest.current) skip.current = true; // only a real change runs the search effect, so only then skip it
    latest.current = text;
    setQ(text);
    setList([]);
  };
  return { q, setQ, setQuiet, list, clear: () => setList([]), searching, resolve };
};

const Suggestions = ({ items, onPick, title }) => (
  <View style={styles.suggest}>
    {!!title && <AppText style={styles.suggestHead}>{title}</AppText>}
    {items.map((s) => (
      <Pressable key={s.placeId} onPress={() => onPick(s)} style={styles.suggestRow}>
        <MapPin size={16} color={colors.textSubtle} style={{ marginTop: 2 }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="bodyStrong" numberOfLines={1}>{s.primary}</AppText>
          <AppText variant="small" color={colors.textMuted} numberOfLines={1}>{s.secondary}</AppText>
        </View>
        {s.distanceMeters != null && <AppText variant="small" color={colors.textSubtle}>{fmtDistance(s.distanceMeters)}</AppText>}
      </Pressable>
    ))}
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
  const [gpsLine, setGpsLine] = useState('');
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
      const place = await placeAt(lat, lng, t);
      setGpsLine(fullLine(place));
      await pick(place);
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
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        <View style={styles.top}>
          <Pressable onPress={useGps} disabled={busy} style={({ pressed }) => [styles.gpsCard, pressed && { opacity: 0.85 }]}>
            <View style={styles.gpsIcon}>
              {busy ? <ActivityIndicator color={colors.primary} /> : <Navigation size={20} color={colors.primary} />}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="bodyStrong" color={colors.primary}>{t('location.useCurrent')}</AppText>
              <AppText variant="small" color={colors.textMuted} numberOfLines={1}>{busy ? t('location.locating') : gpsLine || t('location.enableGps')}</AppText>
            </View>
            <ChevronRight size={20} color={colors.textSubtle} />
          </Pressable>
          {!!error && <AppText variant="caption" color={colors.danger} style={{ marginTop: spacing.sm }}>{error}</AppText>}

          <AppText style={[styles.caps, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>{t('location.radius')}</AppText>
          <View style={styles.chips}>
            {settings.radiusOptionsKm.map((km) => {
              const on = scope.type === 'radius' && scope.km === km;
              return (
                <Pressable key={km} onPress={() => setScope({ type: 'radius', km })} style={[styles.chip, on && styles.chipOn]}>
                  <AppText variant="caption" style={{ fontWeight: '600' }} color={on ? colors.white : colors.text}>{formatDistance(km, settings.distanceUnit)}</AppText>
                </Pressable>
              );
            })}
            {wide.map(([type]) => {
              const on = scope.type === type;
              return (
                <Pressable key={type} onPress={() => setScope({ type })} style={[styles.chip, on && styles.chipOn]}>
                  <AppText variant="caption" style={{ fontWeight: '600' }} color={on ? colors.white : colors.text}>{t(`location.scope_${type}`)}</AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ padding: spacing.lg }}>
          <View style={styles.savedHead}>
            <AppText style={styles.caps}>{t('location.saved')}</AppText>
            <Pressable onPress={() => navigate(loggedIn ? '/location/new' : '/login')} style={styles.addNew}>
              <Plus size={16} color={colors.primary} />
              <AppText variant="bodyStrong" color={colors.primary}>{t('location.addNew')}</AppText>
            </Pressable>
          </View>

          <View style={{ gap: spacing.md }}>
            {!loggedIn && (
              <View style={styles.empty}>
                <MapPin size={44} color={colors.textSubtle} />
                <AppText color={colors.textMuted} style={{ textAlign: 'center' }}>{t('location.loginToSave')}</AppText>
              </View>
            )}
            {loggedIn && saved === null && <ActivityIndicator color={colors.primary} style={{ paddingVertical: spacing.xl }} />}
            {loggedIn && saved?.length === 0 && (
              <View style={styles.empty}>
                <MapPin size={44} color={colors.textSubtle} />
                <AppText color={colors.textMuted}>{t('location.noSaved')}</AppText>
              </View>
            )}
            {saved?.map((a) => {
              const Icon = KIND_ICON[a.kind] ?? MapPin;
              const line = [a.details, primaryOf(a.place), a.place.address?.city, a.place.address?.state].filter(Boolean).join(', ');
              return (
                <View key={a.id} style={styles.addr}>
                  <Pressable onPress={() => pick(a.place)} style={styles.addrMain}>
                    <View style={styles.addrIcon}><Icon size={20} color={colors.textMuted} /></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AppText variant="bodyStrong">{a.label}</AppText>
                      <AppText variant="small" color={colors.textMuted} numberOfLines={2} style={{ marginTop: 2 }}>{line || a.place.label}</AppText>
                    </View>
                  </Pressable>
                  <Pressable accessibilityLabel="Edit" onPress={() => navigate(`/location/${a.id}/edit`)} style={styles.iconBtn}>
                    <Pencil size={16} color={colors.textSubtle} />
                  </Pressable>
                  <Pressable accessibilityLabel="Delete" onPress={() => remove(a)} style={styles.iconBtn}>
                    <Trash2 size={16} color={colors.textSubtle} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

/**
 * Add / edit a location: the map has a fixed pin in the middle — drag the map, the address under the pin fills the form.
 * Search (top of the map or the Primary Address field) jumps the map to a place. Saving also makes it the current location.
 */
export const AddressMapScreen = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { id } = useParams();
  const settings = useAppSelector((s) => s.app.bootstrap?.location);
  const current = useAppSelector((s) => s.location.current);
  const [pos, setPos] = useState(current?.lat != null ? { lat: current.lat, lng: current.lng } : DEFAULT_CENTER);
  const [place, setPlace] = useState(null); // the address under the pin
  const [details, setDetails] = useState('');
  const [kind, setKind] = useState('home');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(Boolean(id));
  const lookup = useRef(0);
  const top = usePlaceSearch(pos);
  const street = usePlaceSearch(pos);
  const mapHeight = Math.max(260, Math.min(420, Math.round(((typeof window !== 'undefined' && window.innerHeight) || 800) * 0.45)));

  /** Fill the form from a place and keep the map on it. */
  const apply = (p) => {
    setPlace(p);
    setPos({ lat: p.lat, lng: p.lng });
    street.setQuiet(primaryOf(p));
  };

  // edit: start at the saved address; new: start at your GPS position (falls back to your current place)
  useEffect(() => {
    if (id) {
      meApi
        .locations()
        .then(({ data }) => {
          const a = data.find((x) => x.id === id);
          if (!a) return;
          apply(a.place);
          setDetails(a.details);
          setKind(a.kind);
          setName(a.kind === 'other' ? a.label : '');
        })
        .catch((e) => setMsg(errorText(e)))
        .finally(() => setLoading(false));
      return;
    }
    if (current?.lat != null) apply(current);
    else onPinMoved(pos.lat, pos.lng);
    locateMe(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // the map stopped under a new point → look up its address (only the latest lookup wins)
  const onPinMoved = async (lat, lng) => {
    setPos({ lat, lng });
    const n = ++lookup.current;
    try {
      const p = await placeAt(lat, lng, t);
      if (n === lookup.current) {
        setPlace(p);
        street.setQuiet(primaryOf(p));
      }
    } catch (e) {
      if (n === lookup.current) setMsg(errorText(e));
    }
  };

  async function locateMe(silent = false) {
    setLocating(true);
    if (!silent) setMsg('');
    try {
      const { lat, lng } = await getPosition();
      const n = ++lookup.current;
      setPos({ lat, lng });
      const p = await placeAt(lat, lng, t);
      if (n === lookup.current) apply(p);
    } catch (e) {
      if (!silent) setMsg(gpsError(e, t));
    } finally {
      setLocating(false);
    }
  }

  const choose = async (search, s) => {
    try {
      lookup.current += 1; // a pending pin lookup must not overwrite the chosen place
      const p = await search.resolve(s);
      apply(p);
      top.setQuiet('');
      setMsg('');
    } catch (e) {
      setMsg(errorText(e));
    }
  };

  const save = async () => {
    if (!place) return setMsg(t('location.selectOnMap'));
    setSaving(true);
    setMsg('');
    // the server needs a non-empty label; a pin on an unnamed spot falls back to its coordinates
    const primary = (street.q.trim() || primaryOf(place) || place.label || place.address?.formatted || `${Number(pos.lat).toFixed(4)}, ${Number(pos.lng).toFixed(4)}`).slice(0, 200);
    const body = {
      label: kind === 'other' ? name.trim() || t('location.kind_other') : t(`location.kind_${kind}`),
      kind,
      details: details.trim() || undefined,
      place: {
        label: primary,
        name: place.name || place.address?.area || place.address?.city || undefined,
        placeId: typeof place.placeId === 'string' && place.placeId ? place.placeId : undefined,
        lat: Number(pos.lat),
        lng: Number(pos.lng),
        address: { ...place.address, formatted: place.address?.formatted?.slice(0, 300) },
      },
    };
    try {
      if (id) await meApi.updateLocation(id, body);
      else await meApi.addLocation(body);
      await dispatch(chooseLocation({ ...body.place, scope: current?.scope ?? { type: 'radius', km: settings?.defaultRadiusKm } }));
      navigate(-2);
    } catch (e) {
      setMsg(errorText(e));
      Alert.alert(errorText(e)); // the message under the form can be out of sight: a failed save must never be silent
      setSaving(false);
    }
  };

  const title = id ? t('location.editTitle') : t('location.addTitle');
  if (!settings || loading) {
    return (
      <View style={styles.fill}>
        <Header title={title} onBack={() => navigate(-1)} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary} /></View>
      </View>
    );
  }

  const a = place?.address ?? {};

  return (
    <View style={styles.fill}>
      <Header title={title} onBack={() => navigate(-1)} />

      <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
        {/* map + floating search + Use My Location */}
        <View style={{ height: mapHeight }}>
          <PinMap lat={pos.lat} lng={pos.lng} height={mapHeight} onMove={onPinMoved} />

          <View style={styles.searchWrap}>
            <View style={styles.searchBar}>
              <Search size={20} color={colors.textSubtle} />
              <TextInput value={top.q} onChangeText={top.setQ} placeholder={t('location.mapSearch')} placeholderTextColor={colors.textSubtle} style={styles.searchInput} />
              {top.searching && <ActivityIndicator color={colors.primary} />}
            </View>
            {top.list.length > 0 && <Suggestions title={t('location.suggestions')} items={top.list} onPick={(s) => choose(top, s)} />}
          </View>

          {top.list.length === 0 && (
            <Pressable onPress={() => locateMe(false)} disabled={locating} style={({ pressed }) => [styles.myLoc, pressed && { opacity: 0.85 }]}>
              {locating ? <ActivityIndicator color={colors.primary} /> : <Navigation size={16} color={colors.primary} />}
              <AppText variant="bodyStrong">{t('location.useMy')}</AppText>
            </Pressable>
          )}
        </View>

        {/* form sheet, overlapping the map's bottom edge */}
        <View style={styles.sheet}>
          <View style={styles.pinned}>
            <MapPin size={20} color={colors.primary} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText style={styles.pinnedCaps}>{t('location.pinnedCaps')}</AppText>
              <AppText variant="caption" color={colors.text} numberOfLines={2}>{place ? fullLine(place) : t('location.selectOnMap')}</AppText>
            </View>
          </View>

          <View>
            <AppText variant="bodyStrong" style={styles.label}>{t('location.primary')}</AppText>
            <Input soft value={street.q} onChangeText={street.setQ} placeholder={t('location.primaryHint')} right={street.searching ? <ActivityIndicator color={colors.primary} /> : null} />
            {street.list.length > 0 && <Suggestions items={street.list} onPick={(s) => choose(street, s)} />}
            <AppText variant="small" color={colors.textMuted} style={{ marginTop: 6 }}>{t('location.autoFilled')}</AppText>
          </View>

          <View>
            <AppText variant="bodyStrong" style={[styles.label, { color: colors.warm }]}>{t('location.secondary')}</AppText>
            <Input value={details} onChangeText={setDetails} maxLength={200} placeholder={t('location.secondaryHint')} boxStyle={{ borderColor: '#FED7AA' }} />
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <AppText variant="small" style={styles.smallLabel}>{t('location.city')}</AppText>
              <Input soft value={a.city || a.district || ''} editable={false} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="small" style={styles.smallLabel}>{t('location.state')}</AppText>
              <Input soft value={a.state || ''} editable={false} />
            </View>
          </View>
          <View>
            <AppText variant="small" style={styles.smallLabel}>{t('location.pincode')}</AppText>
            <Input soft value={a.pin || ''} editable={false} placeholder={t('location.pincode')} />
          </View>

          <View>
            <AppText variant="bodyStrong" style={styles.label}>{t('location.saveAs')}</AppText>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {['home', 'work', 'other'].map((k) => {
                const on = kind === k;
                return (
                  <Pressable key={k} onPress={() => setKind(k)} style={[styles.kindBtn, on && styles.kindOn]}>
                    <AppText variant="bodyStrong" color={on ? colors.white : colors.text}>{t(`location.kind_${k}`)}</AppText>
                  </Pressable>
                );
              })}
            </View>
            {kind === 'other' && (
              <Input value={name} onChangeText={setName} maxLength={40} placeholder={t('location.nameHint')} boxStyle={{ marginTop: spacing.sm }} />
            )}
          </View>

          {!!msg && <AppText variant="caption" color={colors.danger}>{msg}</AppText>}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button title={saving ? t('location.saving') : t('location.saveProceed')} onPress={save} loading={saving} disabled={!place} />
      </View>
    </View>
  );
};

const lift = (o, r, y) => ({ shadowColor: '#111827', shadowOpacity: o, shadowRadius: r, shadowOffset: { width: 0, height: y }, elevation: 4 });

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider, backgroundColor: colors.white },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  // Select Location
  top: { padding: spacing.lg, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  gpsCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.white, ...lift(0.06, 6, 2) },
  gpsIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.warmSoft, alignItems: 'center', justifyContent: 'center' },
  caps: { fontSize: 13, lineHeight: 18, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  savedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  addNew: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  addr: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.lg, borderRadius: radius.md, backgroundColor: '#F8FAFC' },
  addrMain: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg, minWidth: 0 },
  addrIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...lift(0.06, 4, 1), elevation: 1 },
  iconBtn: { padding: spacing.sm, borderRadius: 18 },

  // Add / edit location
  searchWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, top: spacing.lg, zIndex: 600 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 48, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.96)', ...lift(0.18, 12, 6) },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 0 },
  suggest: { marginTop: spacing.sm, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.divider, overflow: 'hidden', ...lift(0.18, 14, 8) },
  suggestHead: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: colors.textSubtle, backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  suggestRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  myLoc: { position: 'absolute', right: spacing.lg, bottom: 44, zIndex: 600, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 48, paddingHorizontal: spacing.xl, borderRadius: radius.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, ...lift(0.2, 12, 6) },
  sheet: { marginTop: -32, borderTopLeftRadius: 32, borderTopRightRadius: 32, backgroundColor: colors.white, padding: spacing.lg, gap: spacing.xxl, zIndex: 700, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: -10 }, elevation: 6 },
  pinned: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.warmSoft, borderWidth: 1, borderColor: '#FFEDD5' },
  pinnedCaps: { fontSize: 12, lineHeight: 16, fontWeight: '700', textTransform: 'uppercase', color: '#9A3412', marginBottom: 4 },
  label: { marginBottom: spacing.sm },
  smallLabel: { marginBottom: 4, color: colors.text },
  inputBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, paddingHorizontal: spacing.md },
  inputBoxSoft: { backgroundColor: '#F9FAFB' },
  inputText: { flex: 1, height: '100%', fontSize: 15, color: colors.text },
  kindBtn: { flex: 1, height: 44, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  kindOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl, backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderTopColor: colors.divider, zIndex: 800, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: -10 }, elevation: 8 },
});
