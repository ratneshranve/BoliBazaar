import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, FileX, X } from 'lucide-react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from '../components/primitives';
import { AppText, Button, EmptyState } from '../components/ui';
import { colors, spacing } from '@theme/tokens';
import { pagesApi } from '../api/endpoints';

/** Loads a content page (Terms / Privacy / Support) in the user's language. */
const usePage = (slug) => {
  const [state, setState] = useState({ loading: true, page: null, failed: false });
  const load = () => {
    setState({ loading: true, page: null, failed: false });
    pagesApi
      .get(slug)
      .then(({ data }) => setState({ loading: false, page: data, failed: false }))
      .catch(() => setState({ loading: false, page: null, failed: true }));
  };
  useEffect(load, [slug]);
  return { ...state, reload: load };
};

const PageBody = ({ slug }) => {
  const { t } = useTranslation();
  const { loading, page, failed, reload } = usePage(slug);
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
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

/** Full screen: /page/:slug (used for Help & Support) */
export const PageScreen = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { slug } = useParams();
  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={t('common.back')} onPress={() => navigate(-1)}>
          <ArrowLeft size={24} color={colors.text} />
        </Pressable>
      </View>
      <PageBody slug={slug} />
    </View>
  );
};

/** Overlay used from forms (e.g. Profile Setup) so the user doesn't lose what they typed. */
export const PageSheet = ({ slug, onClose }) => {
  const { t } = useTranslation();
  return (
    <View style={styles.sheet}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={t('common.close')} onPress={onClose}>
          <X size={24} color={colors.text} />
        </Pressable>
      </View>
      <PageBody slug={slug} />
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.white },
  sheet: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.white, zIndex: 20 },
  header: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
});
