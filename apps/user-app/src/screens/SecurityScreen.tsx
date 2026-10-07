import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Smartphone } from 'lucide-react-native';
import { AppText, Button, Card } from '../components/ui';
import { colors, spacing } from '../theme/tokens';
import { meApi } from '../api/endpoints';
import type { SessionInfo } from '../api/types';
import { errorText } from '../i18n';

export const SecurityScreen = () => {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<SessionInfo[] | null>(null);

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

  const revoke = async (id: string) => {
    try {
      await meApi.revokeSession(id);
      load();
    } catch (e) {
      Alert.alert(errorText(e));
    }
  };

  const revokeOthers = async () => {
    try {
      await meApi.revokeOtherSessions();
      load();
    } catch (e) {
      Alert.alert(errorText(e));
    }
  };

  if (!items) return <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />;

  return (
    <SafeAreaView style={styles.fill} edges={['bottom']}>
      <FlatList
        data={items}
        keyExtractor={s => s.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        ListHeaderComponent={<AppText variant="h3">{t('security.sessions')}</AppText>}
        renderItem={({ item }) => (
          <Card style={styles.row}>
            <Smartphone size={24} color={colors.text} />
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">{item.deviceName || item.platform}</AppText>
              <AppText variant="caption" color={colors.textMuted}>
                {item.current
                  ? t('security.thisDevice')
                  : t('security.lastActive', { time: item.lastUsedAt ? new Date(item.lastUsedAt).toLocaleString(i18n.language) : '' })}
              </AppText>
            </View>
            {!item.current && <Button title={t('security.logoutDevice')} variant="outline" size="md" onPress={() => revoke(item.id)} />}
          </Card>
        )}
        ListFooterComponent={
          items.length > 1 ? <Button title={t('security.logoutOthers')} variant="outline" onPress={revokeOthers} style={{ marginTop: spacing.md }} /> : undefined
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
