import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, FileX, X } from 'lucide-react-native';
import { AppText, Button, EmptyState } from '../components/ui';
import { colors, spacing } from '../theme/tokens';
import { pagesApi } from '../api/endpoints';
import type { ContentPage } from '../api/types';
import type { RootStackParamList } from '../navigation/types';

/** Loads a content page (Terms / Privacy / Support) in the user's language. */
const usePage = (slug: ContentPage['slug']) => {
  const [state, setState] = useState<{ loading: boolean; page: ContentPage | null; failed: boolean }>({ loading: true, page: null, failed: false });
  const load = useCallback(() => {
    setState({ loading: true, page: null, failed: false });
    pagesApi
      .get(slug)
      .then(({ data }) => setState({ loading: false, page: data, failed: false }))
      .catch(() => setState({ loading: false, page: null, failed: true }));
  }, [slug]);
  useEffect(load, [load]);
  return { ...state, reload: load };
};

const PageBody = ({ slug }: { slug: ContentPage['slug'] }) => {
  const { t } = useTranslation();
  const { loading, page, failed, reload } = usePage(slug);
  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />;
  if (failed || !page) {
    return <EmptyState icon={<FileX size={44} color={colors.textMuted} />} title={t('page.unavailable')} action={<Button title={t('common.retry')} onPress={reload} />} />;
  }
  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
      <AppText variant="h2" style={{ marginBottom: spacing.md }}>
        {page.title}
      </AppText>
      <AppText style={{ lineHeight: 24 }}>{page.body}</AppText>
    </ScrollView>
  );
};

/** Full screen (used for Help & Support) */
export const PageScreen = ({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'Page'>) => {
  const { t } = useTranslation();
  return (
    <SafeAreaView style={styles.fill}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color={colors.text} />
        </Pressable>
      </View>
      <PageBody slug={route.params.slug} />
    </SafeAreaView>
  );
};

/** Overlay used from forms (e.g. Profile Setup) so the user doesn't lose what they typed. */
export const PageSheet = ({ slug, onClose }: { slug: ContentPage['slug'] | null; onClose: () => void }) => {
  const { t } = useTranslation();
  return (
    <Modal visible={!!slug} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.fill}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose}>
            <X size={24} color={colors.text} />
          </Pressable>
        </View>
        {slug && <PageBody slug={slug} />}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
});
