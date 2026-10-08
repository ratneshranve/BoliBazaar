import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, PackageOpen } from 'lucide-react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from '../components/primitives';
import { AppText, EmptyState } from '../components/ui';
import { BrandHeader } from '../components/BrandHeader';
import { LocationChip } from '../components/LocationChip';
import { CategoryTile } from '../components/CategoryTile';
import { colors, spacing } from '@theme/tokens';
import { categoriesApi } from '../api/endpoints';

/** Find a node and the chain of its parents in the nested tree. */
const findPath = (nodes, id, trail = []) => {
  for (const n of nodes) {
    if (n.id === id) return [...trail, n];
    const hit = findPath(n.children, id, [...trail, n]);
    if (hit) return hit;
  }
  return null;
};

/** /explore → top-level categories; /explore/:id → that category's sub-categories (ads arrive in Phase 3). */
export const ExploreScreen = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const [tree, setTree] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setTree(null);
    setFailed(false);
    categoriesApi
      .tree()
      .then(({ data }) => live && setTree(data))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [i18n.language]);

  const trail = useMemo(() => (tree && id ? findPath(tree, id) : null), [tree, id]);
  const current = trail?.[trail.length - 1];
  const items = id ? current?.children ?? [] : tree ?? [];

  const goBack = () => (trail && trail.length > 1 ? navigate(`/explore/${trail[trail.length - 2].id}`) : navigate('/explore'));

  return (
    <View style={styles.fill}>
      <BrandHeader>
        <LocationChip />
      </BrandHeader>

      {id && current && (
        <View style={styles.crumb}>
          <Pressable accessibilityLabel={t('common.back')} onPress={goBack}>
            <ArrowLeft size={22} color={colors.text} />
          </Pressable>
          <AppText variant="h3" numberOfLines={1} style={{ flex: 1 }}>
            {current.name}
          </AppText>
        </View>
      )}
      {!id && (
        <View style={styles.crumb}>
          <AppText variant="h2">{t('explore.allCategories')}</AppText>
        </View>
      )}

      {!tree && !failed && (
        <View style={{ padding: spacing.xxl, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
      {failed && <EmptyState title={t('common.somethingWrong')} />}

      {tree && (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
          {items.length === 0 ? (
            <EmptyState icon={<PackageOpen size={44} color={colors.textMuted} />} title={id ? t('explore.noListings') : t('explore.noCategories')} />
          ) : (
            <View style={styles.grid}>
              {items.map((c) => (
                <CategoryTile key={c.id} category={c} size={72} onPress={() => navigate(`/explore/${c.id}`)} />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.white },
  crumb: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, justifyContent: 'flex-start' },
});
