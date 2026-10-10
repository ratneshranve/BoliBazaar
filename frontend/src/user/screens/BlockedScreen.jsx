import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, UserX } from 'lucide-react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, View } from '../components/primitives';
import { AppText, Button, EmptyState } from '../components/ui';
import { colors, spacing } from '@theme/tokens';
import { chatApi } from '../api/endpoints';
import { useAppSelector } from '../store';
import { formatDate } from '../utils/listing';
import { errorText } from '../i18n';

/** People this user blocked (from a chat). They cannot message, call or apply to each other until unblocked. */
export const BlockedScreen = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const status = useAppSelector((s) => s.session.status);
  const [items, setItems] = useState(null);
  useEffect(() => {
    if (status === 'guest') return navigate('/login', { replace: true });
    if (status === 'authenticated') chatApi.blocked().then(({ data }) => setItems(data)).catch(() => setItems([]));
    return undefined;
  }, [status, navigate]);
  const unblock = async (u) => {
    try {
      await chatApi.unblock(u.id);
      setItems((x) => x.filter((y) => y.id !== u.id));
    } catch (e) {
      Alert.alert(errorText(e));
    }
  };
  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={t('common.back')} onPress={() => navigate(-1)}><ArrowLeft size={24} color={colors.text} /></Pressable>
        <AppText variant="h3">{t('chat.blockedTitle')}</AppText>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}>
        <AppText variant="caption" color={colors.textMuted}>{t('chat.blockedHint')}</AppText>
        {!items && <ActivityIndicator color={colors.primary} />}
        {items?.length === 0 && <EmptyState icon={<UserX size={44} color={colors.textMuted} />} title={t('chat.blockedEmpty')} />}
        {items?.map((u) => (
          <View key={u.id} style={styles.row}>
            {u.avatar ? <Image source={{ uri: u.avatar }} style={styles.avatar} /> : <View style={[styles.avatar, { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }]}><AppText variant="bodyStrong" color={colors.primary}>{(u.name ?? '?').charAt(0).toUpperCase()}</AppText></View>}
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">{u.name ?? t('chat.unknownUser')}</AppText>
              <AppText variant="small" color={colors.textMuted}>{t('chat.blockedOn', { date: formatDate(u.blockedAt, i18n.language) })}</AppText>
            </View>
            <Button size="md" variant="outline" title={t('chat.unblock')} onPress={() => unblock(u)} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  avatar: { width: 44, height: 44, borderRadius: 22 },
});
