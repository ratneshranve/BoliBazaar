import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Inbox } from 'lucide-react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, View } from '../components/primitives';
import { AppText, Button, EmptyState } from '../components/ui';
import { colors, radius, spacing } from '@theme/tokens';
import { leadsApi } from '../api/endpoints';
import { useAppSelector } from '../store';
import { formatDate } from '../utils/listing';
import { errorText } from '../i18n';

const TONE = { new: colors.warning, seen: colors.textMuted, shortlisted: colors.sell, declined: colors.danger, withdrawn: colors.textMuted };

/** Job applications and service enquiries: the ones I received on my ads, and the ones I sent. */
export const LeadsScreen = ({ initial = 'received' }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const listingId = params.get('listing') || undefined;
  const status = useAppSelector((s) => s.session.status);
  const [tab, setTab] = useState(initial);
  const [items, setItems] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);

  const load = useCallback(
    async (pageNo = 1) => {
      try {
        const { data } = await (tab === 'received' ? leadsApi.received({ page: pageNo, limit: 20, listingId }) : leadsApi.sent({ page: pageNo, limit: 20 }));
        setItems((prev) => (pageNo === 1 ? data.items : [...(prev ?? []), ...data.items]));
        setHasMore(data.hasMore);
        setPage(pageNo);
      } catch (e) {
        Alert.alert(errorText(e));
        setItems((prev) => prev ?? []);
      }
    },
    [tab, listingId]
  );

  useEffect(() => {
    if (status === 'guest') return navigate('/login', { replace: true });
    if (status !== 'authenticated') return;
    setItems(null);
    load(1);
  }, [status, load, navigate]);

  const mark = async (lead, next) => {
    try {
      await leadsApi.setStatus(lead.id, next);
      setItems((prev) => prev.map((x) => (x.id === lead.id ? { ...x, status: next } : x)));
    } catch (e) {
      Alert.alert(errorText(e));
    }
  };

  const withdraw = async (lead) => {
    if (!window.confirm(t('leads.confirmWithdraw'))) return;
    try {
      await leadsApi.withdraw(lead.id);
      setItems((prev) => prev.map((x) => (x.id === lead.id ? { ...x, status: 'withdrawn' } : x)));
    } catch (e) {
      Alert.alert(errorText(e));
    }
  };

  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={t('common.back')} onPress={() => navigate(-1)}><ArrowLeft size={24} color={colors.text} /></Pressable>
        <AppText variant="h3">{t('leads.title')}</AppText>
      </View>
      <View style={styles.tabs}>
        {['received', 'sent'].map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[styles.tab, tab === k && styles.tabOn]}>
            <AppText variant="bodyStrong" color={tab === k ? colors.white : colors.text}>{t(`leads.tab_${k}`)}</AppText>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxxl }}>
        {!items && <ActivityIndicator style={{ padding: spacing.xl }} color={colors.primary} />}
        {items?.length === 0 && <EmptyState icon={<Inbox size={44} color={colors.textMuted} />} title={t(`leads.empty_${tab}`)} />}
        {items?.map((l) => (
          <View key={l.id} style={styles.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
              <AppText variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                {tab === 'received' ? (l.sender.name ?? t('chat.unknownUser')) : l.listing?.title}
              </AppText>
              <AppText variant="small" color={TONE[l.status]}>{t(`leads.status_${l.status}`)}</AppText>
            </View>
            <AppText variant="small" color={colors.primary}>
              {t(`leads.type_${l.type}`)}{tab === 'received' && l.listing ? ` · ${l.listing.title}` : ''}
            </AppText>
            <AppText style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{l.message}</AppText>
            <AppText variant="small" color={colors.textSubtle}>{formatDate(l.createdAt, i18n.language)}</AppText>

            {tab === 'received' && l.status !== 'withdrawn' && (
              <View style={styles.actions}>
                {l.sender.phone && <Button size="md" variant="outline" title={t('leads.call')} onPress={() => Linking.openURL(`tel:${l.sender.phone}`)} />}
                {l.status !== 'shortlisted' && <Button size="md" variant="sell" title={t('leads.shortlist')} onPress={() => mark(l, 'shortlisted')} />}
                {l.status !== 'declined' && <Button size="md" variant="outline" title={t('leads.decline')} onPress={() => mark(l, 'declined')} />}
                {l.status === 'new' && <Button size="md" variant="ghost" title={t('leads.markSeen')} onPress={() => mark(l, 'seen')} />}
              </View>
            )}
            {tab === 'sent' && l.status !== 'withdrawn' && (
              <View style={styles.actions}>
                {l.listing && <Button size="md" variant="outline" title={t('leads.viewAd')} onPress={() => navigate(`/listing/${l.listing.id}`)} />}
                <Button size="md" variant="ghost" title={t('leads.withdraw')} onPress={() => withdraw(l)} />
              </View>
            )}
          </View>
        ))}
        {hasMore && <Button title={t('search.loadMore')} variant="outline" onPress={() => load(page + 1)} />}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  tabs: { flexDirection: 'row', gap: spacing.sm, padding: spacing.lg },
  tab: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  tabOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  card: { borderWidth: 1, borderColor: colors.divider, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
});
