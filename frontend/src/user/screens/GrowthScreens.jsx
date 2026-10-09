import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, BadgeCheck, Bell, BellOff, Bookmark, Building2, PackageOpen, Trash2, UserCheck } from 'lucide-react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, View } from '../components/primitives';
import { AppText, Button, EmptyState } from '../components/ui';
import { ListingCard } from '../components/ListingCard';
import { colors, radius, spacing } from '@theme/tokens';
import { growthApi } from '../api/endpoints';
import { useAppSelector } from '../store';
import { formatDate } from '../utils/listing';
import { usePageMeta } from '../utils/pageMeta';
import { errorText } from '../i18n';

const Header = ({ title }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <View style={styles.header}>
      <Pressable accessibilityLabel={t('common.back')} onPress={() => navigate(-1)}><ArrowLeft size={24} color={colors.text} /></Pressable>
      <AppText variant="h3" style={{ flex: 1 }} numberOfLines={1}>{title}</AppText>
    </View>
  );
};

/** /search?… for a saved query */
export const searchUrl = (query) => `/search?${new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString()}`;

/** Short human summary of what a saved search looks for. */
const describe = (q, t) =>
  [q.q && `“${q.q}”`, q.priceMin != null && `${t('saved.from')} ${q.priceMin}`, q.priceMax != null && `${t('saved.upTo')} ${q.priceMax}`, q.condition && t(`listing.condition_${q.condition}`), q.scope === 'radius' && q.radiusKm && `${q.radiusKm} km`]
    .filter(Boolean)
    .join(' · ') || t('saved.everything');

export const SavedSearchesScreen = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const status = useAppSelector((s) => s.session.status);
  const [items, setItems] = useState(null);

  const load = useCallback(() => growthApi.searches().then(({ data }) => setItems(data)).catch((e) => { Alert.alert(errorText(e)); setItems([]); }), []);
  useEffect(() => {
    if (status === 'guest') navigate('/login', { replace: true });
    else if (status === 'authenticated') load();
  }, [status, load, navigate]);

  const toggle = async (s) => {
    setItems((list) => list.map((x) => (x.id === s.id ? { ...x, alerts: !s.alerts } : x)));
    try {
      await growthApi.updateSearch(s.id, { alerts: !s.alerts });
    } catch (e) {
      Alert.alert(errorText(e));
      load();
    }
  };
  const remove = async (s) => {
    if (!window.confirm(t('saved.confirmDelete', { name: s.name }))) return;
    try {
      await growthApi.deleteSearch(s.id);
      setItems((list) => list.filter((x) => x.id !== s.id));
    } catch (e) {
      Alert.alert(errorText(e));
    }
  };

  return (
    <View style={styles.fill}>
      <Header title={t('saved.title')} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}>
        {!items && <ActivityIndicator style={{ minHeight: 'calc(100dvh - 200px)' }} color={colors.primary} />}
        {items?.length === 0 && <EmptyState icon={<Bookmark size={44} color={colors.textMuted} />} title={t('saved.empty')} body={t('saved.emptyHint')} action={<Button title={t('saved.search')} onPress={() => navigate('/search')} />} />}
        {items?.map((s) => (
          <View key={s.id} style={styles.row}>
            <Pressable onPress={() => navigate(searchUrl(s.query))} style={{ flex: 1, gap: 2 }}>
              <AppText variant="bodyStrong">{s.name}</AppText>
              <AppText variant="caption" color={colors.textMuted} numberOfLines={2}>{describe(s.query, t)}</AppText>
            </Pressable>
            <Pressable accessibilityLabel={s.alerts ? t('saved.alertsOff') : t('saved.alertsOn')} onPress={() => toggle(s)} style={styles.iconBtn}>
              {s.alerts ? <Bell size={20} color={colors.primary} /> : <BellOff size={20} color={colors.textMuted} />}
            </Pressable>
            <Pressable accessibilityLabel={t('saved.delete')} onPress={() => remove(s)} style={styles.iconBtn}><Trash2 size={20} color={colors.textMuted} /></Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

/** Opened from an alert notification: show the matching search. */
export const SavedSearchRedirect = () => {
  const { id } = useParams();
  const [to, setTo] = useState(null);
  useEffect(() => {
    growthApi.searches().then(({ data }) => {
      const s = data.find((x) => x.id === id);
      setTo(s ? searchUrl({ ...s.query, sort: 'newest' }) : '/saved-searches');
    }).catch(() => setTo('/saved-searches'));
  }, [id]);
  return to ? <Navigate to={to} replace /> : <View style={[styles.fill, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={colors.primary} /></View>;
};

/* ───────── public seller page ───────── */

export const SellerScreen = () => {
  const { t, i18n } = useTranslation();
  const { publicId } = useParams();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    growthApi.seller(publicId, 1).then(({ data: d }) => setData(d)).catch(() => setFailed(true));
  }, [publicId, i18n.language]);
  usePageMeta(data?.profile.name, data ? t('seller.meta', { name: data.profile.name, count: data.profile.activeCount }) : undefined);

  const more = async () => {
    const { data: d } = await growthApi.seller(publicId, page + 1);
    setData((prev) => ({ ...d, items: [...prev.items, ...d.items] }));
    setPage(page + 1);
  };

  if (failed) return <View style={styles.fill}><Header title="" /><EmptyState icon={<PackageOpen size={44} color={colors.textMuted} />} title={t('seller.unavailable')} /></View>;
  if (!data) return <View style={[styles.fill, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={colors.primary} /></View>;
  const p = data.profile;

  return (
    <View style={styles.fill}>
      <Header title={p.name ?? ''} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}>
        <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
          {p.avatar ? (
            <Image source={{ uri: p.avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }]}>
              <AppText variant="h1" color={colors.primary}>{(p.name ?? '?').charAt(0).toUpperCase()}</AppText>
            </View>
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="h2">{p.name}</AppText>
            {p.businessName && <AppText color={colors.textMuted}>{p.businessName}</AppText>}
            <AppText variant="caption" color={colors.textMuted}>{t('listing.memberSince', { date: formatDate(p.memberSince, i18n.language) })}</AppText>
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {p.badges.phone && <View style={styles.badge}><BadgeCheck size={14} color={colors.verified} /><AppText variant="small">{t('profile.verifiedPhone')}</AppText></View>}
          {p.badges.id && <View style={styles.badge}><UserCheck size={14} color={colors.verified} /><AppText variant="small">{t('verify.idBadge')}</AppText></View>}
          {p.badges.business && <View style={styles.badge}><Building2 size={14} color={colors.verified} /><AppText variant="small">{t('verify.businessBadge')}</AppText></View>}
        </View>
        {!!p.about && <AppText>{p.about}</AppText>}
        <AppText color={colors.textMuted}>{t('seller.stats', { active: p.activeCount, sold: p.soldCount })}</AppText>
        <AppText variant="h3">{t('seller.ads')}</AppText>
        {data.items.length === 0 && <AppText color={colors.textMuted}>{t('seller.noAds')}</AppText>}
        <View style={styles.grid}>
          {data.items.map((l) => <View key={l.id} style={{ width: 'calc(50% - 6px)' }}><ListingCard listing={l} /></View>)}
        </View>
        {data.hasMore && <Button variant="outline" title={t('search.loadMore')} onPress={more} />}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.lg },
  iconBtn: { padding: spacing.sm },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.sellSoft },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
