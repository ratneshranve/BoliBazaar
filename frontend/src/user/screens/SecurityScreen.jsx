import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Smartphone } from 'lucide-react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, View } from '../components/primitives';
import { AppText, Button, Card } from '../components/ui';
import { colors, spacing } from '@theme/tokens';
import { meApi } from '../api/endpoints';
import { errorText } from '../i18n';

export const SecurityScreen = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);

  const load = useCallback(async () => {
    try {
      setItems((await meApi.sessions()).data);
    } catch (e) {
      Alert.alert(errorText(e));
      setItems([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn) => {
    try {
      await fn();
      load();
    } catch (e) {
      Alert.alert(errorText(e));
    }
  };

  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={t('common.back')} onPress={() => navigate(-1)}>
          <ArrowLeft size={24} color={colors.text} />
        </Pressable>
        <AppText variant="h3">{t('security.title')}</AppText>
      </View>
      {!items ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          ListHeaderComponent={<AppText variant="h3">{t('security.sessions')}</AppText>}
          renderItem={({ item }) => (
            <Card style={styles.row}>
              <Smartphone size={24} color={colors.text} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {item.deviceName || item.platform}
                </AppText>
                <AppText variant="caption" color={colors.textMuted}>
                  {item.current ? t('security.thisDevice') : t('security.lastActive', { time: item.lastUsedAt ? new Date(item.lastUsedAt).toLocaleString(i18n.language) : '' })}
                </AppText>
              </View>
              {!item.current && <Button title={t('security.logoutDevice')} variant="outline" size="md" onPress={() => run(() => meApi.revokeSession(item.id))} />}
            </Card>
          )}
          ListFooterComponent={
            items.length > 1 ? <Button title={t('security.logoutOthers')} variant="outline" onPress={() => run(() => meApi.revokeOtherSessions())} style={{ marginTop: spacing.md }} /> : undefined
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.divider },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
