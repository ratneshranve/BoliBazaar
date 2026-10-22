import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check, Wrench, CloudOff, Download, Search, Settings2 } from 'lucide-react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from '../components/primitives';
import { AppText, Button, EmptyState, Field } from '../components/ui';
import { colors, radius, spacing } from '@theme/tokens';
import { ensureLanguage, savedLanguage, setLanguage } from '../i18n';
import { useAppDispatch, useAppSelector, fetchBootstrap, dismissUpdate } from '../store';

const Center = ({ children }) => <View style={styles.fill}>{children}</View>;

export const ConfigErrorScreen = ({ missing }) => {
  const { t } = useTranslation();
  return (
    <Center>
      <EmptyState icon={<Settings2 size={48} color={colors.danger} />} title={t('config.title')} body={`${t('config.body')}\n\n${missing.join('\n')}`} />
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
  const m = useAppSelector((s) => s.app.maintenance);
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

export const UpdateScreen = ({ required }) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const update = useAppSelector((s) => s.app.bootstrap?.update);
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

const SEARCH_FROM = 8; // a search box once the list is longer than this

const matches = (l, q) => [l.nativeName, l.name, l.code].some((s) => s && s.toLocaleLowerCase().includes(q));

/**
 * Languages come from Admin › Settings › Languages (bootstrap): the admin's picks, or every language.
 * The chosen one stays until the user changes it here again.
 */
export const LanguageScreen = ({ onDone, onBack }) => {
  const { t, i18n } = useTranslation();
  const languages = useAppSelector((s) => s.app.bootstrap?.languages);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  // The list is ordered once, by the language in use when the screen opened. Choosing a language must NOT reorder the rows:
  // moving a row to the top while the language changes crashes Android's view system and closed the app.
  const [startLang] = useState(() => i18n.language);

  const items = useMemo(() => {
    const all = languages?.items ?? [];
    // language in use first, then the admin's default, then the rest in list order
    const rank = (l) => (l.code === startLang ? 0 : l.code === languages?.default ? 1 : 2);
    const sorted = [...all].sort((a, b) => rank(a) - rank(b));
    const q = query.trim().toLocaleLowerCase();
    return q ? sorted.filter((l) => matches(l, q)) : sorted;
  }, [languages, query, startLang]);

  const choose = async (code) => {
    if (code === i18n.language && savedLanguage() === code) return onDone();
    setBusy(code);
    setError('');
    const ok = await ensureLanguage(code); // downloads its text the first time
    if (!ok) {
      setBusy(null);
      setError(t('language.loadFailed'));
      return undefined;
    }
    await setLanguage(code);
    setBusy(null);
    return onDone();
  };

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: onBack ? spacing.lg : spacing.xxxl, paddingBottom: spacing.xxxl }}>
        {onBack && (
          <Pressable accessibilityLabel={t('common.back')} onPress={onBack} style={{ alignSelf: 'flex-start', marginBottom: spacing.md }}>
            <ArrowLeft size={24} color={colors.text} />
          </Pressable>
        )}
        <AppText variant="h1">{t('language.title')}</AppText>
        <AppText color={colors.textMuted} style={{ marginTop: spacing.xs, marginBottom: spacing.lg }}>
          {t('language.subtitle')}
        </AppText>
        {(languages?.items?.length ?? 0) > SEARCH_FROM && (
          <View style={{ marginBottom: spacing.lg }}>
            <Field
              value={query}
              onChangeText={setQuery}
              placeholder={t('language.search')}
              autoCorrect={false}
              autoCapitalize="none"
              left={<Search size={18} color={colors.textMuted} />}
            />
          </View>
        )}
        {!!error && (
          <AppText color={colors.danger} style={{ marginBottom: spacing.md }}>
            {error}
          </AppText>
        )}
        {items.length === 0 && (
          <AppText color={colors.textMuted} style={{ textAlign: 'center', marginTop: spacing.xl }}>
            {t('language.noMatch')}
          </AppText>
        )}
        {items.map((l) => {
          const on = i18n.language === l.code;
          return (
            <Pressable key={l.code} onPress={() => choose(l.code)} disabled={!!busy} style={[styles.lang, on && { borderColor: colors.brand, backgroundColor: colors.brandSoft }]}>
              <View style={{ flex: 1 }}>
                <AppText variant="h3">{l.nativeName}</AppText>
                {l.name !== l.nativeName && (
                  <AppText variant="caption" color={colors.textMuted}>
                    {l.name}
                  </AppText>
                )}
              </View>
              {busy === l.code ? <ActivityIndicator color={colors.brand} /> : on ? <Check size={22} color={colors.brand} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.white, justifyContent: 'center' },
  page: { flex: 1, backgroundColor: colors.white },
  lang: { padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
});
