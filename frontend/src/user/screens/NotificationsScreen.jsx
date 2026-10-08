import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Bell } from 'lucide-react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, View } from '../components/primitives';
import { AppText, Button, EmptyState } from '../components/ui';
import { colors, radius, spacing } from '@theme/tokens';
import { notificationsApi } from '../api/endpoints';
import { useAppDispatch, useAppSelector, notificationsRead } from '../store';
import { onRealtime } from '../services/realtime';
import { formatDate } from '../utils/listing';
import { errorText } from '../i18n';

const GROUPS = ['chat', 'listings', 'auctions', 'jobs', 'system'];

/** Inbox of everything the app told the user, plus per-group push switches. */
export const NotificationsScreen = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const status = useAppSelector((s) => s.session.status);
  const [items, setItems] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [prefs, setPrefs] = useState(null);
  const [showPrefs, setShowPrefs] = useState(false);

  const load = useCallback(async (pageNo = 1) => {
    try {
      const { data } = await notificationsApi.list({ page: pageNo, limit: 20 });
      setItems((prev) => (pageNo === 1 ? data.items : [...(prev ?? []), ...data.items]));
      setHasMore(data.hasMore);
      setPage(pageNo);
    } catch (e) {
      Alert.alert(errorText(e));
      setItems((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    if (status === 'guest') return navigate('/login', { replace: true });
    if (status !== 'authenticated') return undefined;
    load(1);
    notificationsApi.prefs().then(({ data }) => setPrefs(data.groups)).catch(() => {});
    return onRealtime('notification:new', (n) => setItems((prev) => [n, ...(prev ?? [])]));
  }, [status, load, navigate]);

  const open = async (n) => {
    if (!n.readAt) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      notificationsApi.read([n.id]).then(({ data }) => dispatch(notificationsRead(data.count))).catch(() => {});
    }
    if (n.route) navigate(n.route);
  };

  const readAll = async () => {
    try {
      const { data } = await notificationsApi.read();
      dispatch(notificationsRead(data.count));
      setItems((prev) => prev.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
    } catch (e) {
      Alert.alert(errorText(e));
    }
  };

  const togglePush = async (group, on) => {
    const before = prefs;
    setPrefs({ ...prefs, [group]: { push: on } });
    try {
      await notificationsApi.setPrefs({ [group]: { push: on } });
    } catch (e) {
      setPrefs(before);
      Alert.alert(errorText(e));
    }
  };

  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={t('common.back')} onPress={() => navigate(-1)}><ArrowLeft size={24} color={colors.text} /></Pressable>
        <AppText variant="h3" style={{ flex: 1 }}>{t('notifications.title')}</AppText>
        <Pressable onPress={() => setShowPrefs((v) => !v)}><AppText variant="bodyStrong" color={colors.primary}>{t('notifications.settings')}</AppText></Pressable>
      </View>

      {showPrefs && prefs && (
        <View style={styles.prefs}>
          <AppText variant="caption" color={colors.textMuted}>{t('notifications.pushHelp')}</AppText>
          {GROUPS.map((g) => (
            <View key={g} style={styles.prefRow}>
              <AppText style={{ flex: 1 }}>{t(`notifications.group_${g}`)}</AppText>
              <Switch activeColor={colors.primary} value={prefs[g]?.push !== false} onValueChange={(on) => togglePush(g, on)} />
            </View>
          ))}
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxxl }}>
        {items?.some((n) => !n.readAt) && <Button size="md" variant="outline" title={t('notifications.markAll')} onPress={readAll} />}
        {!items && <ActivityIndicator style={{ padding: spacing.xl }} color={colors.primary} />}
        {items?.length === 0 && <EmptyState icon={<Bell size={44} color={colors.textMuted} />} title={t('notifications.empty')} />}
        {items?.map((n) => (
          <Pressable key={n.id} onPress={() => open(n)} style={[styles.row, !n.readAt && styles.unread]}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="bodyStrong">{n.title}</AppText>
              <AppText color={colors.textMuted}>{n.body}</AppText>
              <AppText variant="small" color={colors.textSubtle}>{formatDate(n.createdAt, i18n.language)}</AppText>
            </View>
            {!n.readAt && <View style={styles.dot} />}
          </Pressable>
        ))}
        {hasMore && <Button title={t('search.loadMore')} variant="outline" onPress={() => load(page + 1)} />}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  prefs: { padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  prefRow: { flexDirection: 'row', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.divider },
  unread: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
});
