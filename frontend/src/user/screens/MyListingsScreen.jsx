import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Heart, PackageOpen } from 'lucide-react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, View } from '../components/primitives';
import { AppText, Button, EmptyState } from '../components/ui';
import { ListingCard } from '../components/ListingCard';
import { colors, radius, spacing } from '@theme/tokens';
import { listingsApi } from '../api/endpoints';
import { formatPrice, formatDate } from '../utils/listing';
import { errorText } from '../i18n';

const TABS = ['active', 'payment_pending', 'pending_review', 'paused', 'rejected', 'expired', 'sold'];

const TONE = { payment_pending: colors.warning, published: colors.sell, pending_review: colors.warning, paused: colors.textMuted, rejected: colors.danger, expired: colors.textMuted, sold: colors.auctionBlue };

/** The seller's own ads, by status, with quick actions. */
export const MyListingsScreen = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState('active');
  const [items, setItems] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (pageNo = 1) => {
      try {
        const { data } = await listingsApi.mine({ status: tab, page: pageNo, limit: 20 });
        setItems((prev) => (pageNo === 1 ? data.items : [...(prev ?? []), ...data.items]));
        setHasMore(data.hasMore);
        setPage(pageNo);
      } catch (e) {
        Alert.alert(errorText(e));
        setItems((prev) => prev ?? []);
      }
    },
    [tab]
  );

  useEffect(() => {
    setItems(null);
    load(1);
  }, [load]);

  const act = async (id, name) => {
    try {
      if (name === 'delete') {
        if (!window.confirm(t('myListings.confirmDelete'))) return;
        await listingsApi.remove(id);
      } else await listingsApi.action(id, name);
      load(1);
    } catch (e) {
      Alert.alert(errorText(e));
    }
  };

  const more = async () => {
    setBusy(true);
    await load(page + 1);
    setBusy(false);
  };

  const Row = ({ l }) => (
    <View style={styles.row}>
      <Pressable onPress={() => navigate(`/listing/${l.id}`)} style={{ flexDirection: 'row', gap: spacing.md }}>
        {l.cover ? <Image source={{ uri: l.cover }} style={styles.thumb} resizeMode="cover" /> : <View style={[styles.thumb, { backgroundColor: colors.surface }]} />}
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="bodyStrong" numberOfLines={1}>{l.title}</AppText>
          <AppText variant="bodyStrong" color={colors.primary}>{formatPrice(l.price, t, i18n.language)}</AppText>
          <AppText variant="small" color={TONE[l.status === 'published' ? 'published' : l.status]}>{t(`status.${l.status}`)}</AppText>
          <AppText variant="small" color={colors.textMuted}>
            {t('myListings.views', { count: l.stats?.views ?? 0 })} · ♥ {l.stats?.favourites ?? 0}
            {l.status === 'published' && l.expiresAt ? ` · ${t('myListings.expires', { date: formatDate(l.expiresAt, i18n.language) })}` : ''}
          </AppText>
        </View>
      </Pressable>
      {l.status === 'rejected' && l.rejectReason && <AppText variant="caption" color={colors.danger}>{t('myListings.reason', { reason: l.rejectReason })}</AppText>}
      <View style={styles.actions}>
        {!['sold'].includes(l.status) && <Button size="md" variant="outline" title={t('myListings.edit')} onPress={() => navigate(`/sell/${l.id}`)} />}
        {l.status === 'published' && <Button size="md" variant="outline" title={t('myListings.pause')} onPress={() => act(l.id, 'pause')} />}
        {l.status === 'paused' && <Button size="md" variant="outline" title={t('myListings.resume')} onPress={() => act(l.id, 'resume')} />}
        {['published', 'paused'].includes(l.status) && <Button size="md" variant="outline" title={t('myListings.markSold')} onPress={() => act(l.id, 'sold')} />}
        {l.status === 'expired' && <Button size="md" title={t('myListings.renew')} onPress={() => act(l.id, 'renew')} />}
        {l.status === 'payment_pending' && <Button size="md" title={t('myListings.payFee')} onPress={() => navigate(`/pay?purpose=listing_fee&refId=${l.id}`)} />}
        {l.status === 'published' && <Button size="md" variant="sell" title={t('myListings.promote')} onPress={() => navigate(`/promote/${l.id}`)} />}
        <Button size="md" variant="ghost" title={t('myListings.delete')} onPress={() => act(l.id, 'delete')} />
      </View>
    </View>
  );

  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={t('common.back')} onPress={() => navigate(-1)}><ArrowLeft size={24} color={colors.text} /></Pressable>
        <AppText variant="h3">{t('myListings.title')}</AppText>
      </View>
      <ScrollView horizontal contentContainerStyle={{ gap: spacing.sm, padding: spacing.lg }} style={{ flexGrow: 0 }}>
        {TABS.map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[styles.tab, tab === k && styles.tabOn]}>
            <AppText variant="bodyStrong" color={tab === k ? colors.white : colors.text}>{t(`myListings.tab_${k}`)}</AppText>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxxl }}>
        {!items && <ActivityIndicator style={{ padding: spacing.xl }} color={colors.primary} />}
        {items?.length === 0 && <EmptyState icon={<PackageOpen size={44} color={colors.textMuted} />} title={t('myListings.empty')} />}
        {items?.map((l) => <Row key={l.id} l={l} />)}
        {hasMore && <Button title={t('search.loadMore')} variant="outline" loading={busy} onPress={more} />}
      </ScrollView>
    </View>
  );
};

/** Ads the user saved. */
export const FavouritesScreen = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);

  const load = useCallback(async (pageNo = 1) => {
    try {
      const { data } = await listingsApi.favourites({ page: pageNo, limit: 20 });
      setItems((prev) => (pageNo === 1 ? data.items : [...(prev ?? []), ...data.items]));
      setHasMore(data.hasMore);
      setPage(pageNo);
    } catch {
      setItems((prev) => prev ?? []);
    }
  }, []);
  useEffect(() => {
    load(1);
  }, [load]);

  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={t('common.back')} onPress={() => navigate(-1)}><ArrowLeft size={24} color={colors.text} /></Pressable>
        <AppText variant="h3">{t('favourites.title')}</AppText>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        {!items && <ActivityIndicator style={{ padding: spacing.xl }} color={colors.primary} />}
        {items?.length === 0 && <EmptyState icon={<Heart size={44} color={colors.textMuted} />} title={t('favourites.empty')} />}
        <View style={styles.grid}>
          {items?.map((l) => (
            <View key={l.id} style={{ width: 'calc(50% - 6px)' }}>
              <ListingCard listing={l} onFavouriteChange={(on) => !on && setItems((x) => x.filter((y) => y.id !== l.id))} />
            </View>
          ))}
        </View>
        {hasMore && <Button title={t('search.loadMore')} variant="outline" onPress={() => load(page + 1)} style={{ marginTop: spacing.lg }} />}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  tab: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  tabOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  row: { borderWidth: 1, borderColor: colors.divider, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  thumb: { width: 84, height: 84, borderRadius: radius.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
