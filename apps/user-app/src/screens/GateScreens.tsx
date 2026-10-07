import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Wrench, CloudOff, Download, Settings2 } from 'lucide-react-native';
import { AppText, Button, EmptyState } from '../components/ui';
import { colors, radius, spacing } from '../theme/tokens';
import { LANGUAGES, setLanguage, LanguageCode } from '../i18n';
import { useAppDispatch, useAppSelector, fetchBootstrap, dismissUpdate } from '../store';

const Center = ({ children }: { children: React.ReactNode }) => (
  <SafeAreaView style={styles.fill}>
    <View style={styles.fill}>{children}</View>
  </SafeAreaView>
);

export const ConfigErrorScreen = ({ missing }: { missing: string[] }) => {
  const { t } = useTranslation();
  return (
    <Center>
      <EmptyState
        icon={<Settings2 size={48} color={colors.danger} />}
        title={t('config.title')}
        body={`${t('config.body')}\n\n${missing.join('\n')}`}
      />
    </Center>
  );
};

export const OfflineScreen = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  return (
    <Center>
      <EmptyState
        icon={<CloudOff size={48} color={colors.textMuted} />}
        title={t('common.offline')}
        action={<Button title={t('common.retry')} onPress={() => dispatch(fetchBootstrap())} />}
      />
    </Center>
  );
};

export const MaintenanceScreen = () => {
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const m = useAppSelector(s => s.app.maintenance);
  const until = m?.until ? new Date(m.until).toLocaleString(i18n.language) : null;
  return (
    <Center>
      <EmptyState
        icon={<Wrench size={52} color={colors.primary} />}
        title={m?.title || t('maintenance.title')}
        body={[m?.message, until ? t('maintenance.until', { time: until }) : null].filter(Boolean).join('\n\n')}
        action={<Button title={t('maintenance.check')} onPress={() => dispatch(fetchBootstrap())} />}
      />
    </Center>
  );
};

export const UpdateScreen = ({ required }: { required: boolean }) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const update = useAppSelector(s => s.app.bootstrap?.update);
  return (
    <Center>
      <EmptyState
        icon={<Download size={52} color={colors.primary} />}
        title={required ? t('update.requiredTitle') : t('update.availableTitle')}
        body={required ? t('update.requiredBody') : t('update.availableBody')}
        action={
          <View style={{ gap: spacing.sm }}>
            <Button title={t('update.update')} onPress={() => update?.storeUrl && Linking.openURL(update.storeUrl)} />
            {!required && <Button variant="ghost" title={t('update.later')} onPress={() => dispatch(dismissUpdate())} />}
          </View>
        }
      />
    </Center>
  );
};

export const LanguageScreen = ({ onDone }: { onDone: () => void }) => {
  const { t } = useTranslation();
  const choose = async (code: LanguageCode) => {
    await setLanguage(code);
    onDone();
  };
  return (
    <SafeAreaView style={styles.fill}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.xxxl }}>
        <AppText variant="h1">{t('language.title')}</AppText>
        <AppText color={colors.textMuted} style={{ marginTop: spacing.xs, marginBottom: spacing.xl }}>
          {t('language.subtitle')}
        </AppText>
        {LANGUAGES.map(l => (
          <Pressable key={l.code} accessibilityRole="button" onPress={() => choose(l.code)} style={styles.lang}>
            <AppText variant="h3">{l.nativeName}</AppText>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.white, justifyContent: 'center' },
  lang: { padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: spacing.md },
});
