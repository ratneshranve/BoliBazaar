import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, PackageOpen } from 'lucide-react-native';
import { AppText, EmptyState } from '../components/ui';
import { BrandHeader } from '../components/BrandHeader';
import { CategoryTile, LocationChip } from '../components/Chips';
import { colors, spacing } from '../theme/tokens';
import { categoriesApi } from '../api/endpoints';
import type { CategoryNode } from '../api/types';
import type { MainTabParamList } from '../navigation/types';

/** Find a node and the chain of its parents in the nested tree. */
const findPath = (nodes: CategoryNode[], id: string, trail: CategoryNode[] = []): CategoryNode[] | null => {
  for (const n of nodes) {
    if (n.id === id) return [...trail, n];
    const hit = findPath(n.children, id, [...trail, n]);
    if (hit) return hit;
  }
  return null;
};

/** Top-level categories; tapping drills into sub-categories (ads arrive in Phase 3). */
export const ExploreScreen = ({ route }: BottomTabScreenProps<MainTabParamList, 'Explore'>) => {
  const { t, i18n } = useTranslation();
  const [tree, setTree] = useState<CategoryNode[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [id, setId] = useState<string | undefined>(route.params?.categoryId);

  // a banner / home tile can send us straight to a category
  useEffect(() => {
    setId(route.params?.categoryId);
  }, [route.params?.categoryId]);

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
  const goBack = () => setId(trail && trail.length > 1 ? trail[trail.length - 2].id : undefined);

  return (
    <SafeAreaView style={styles.fill} edges={['top']}>
      <BrandHeader>
        <LocationChip />
      </BrandHeader>

      <View style={styles.crumb}>
        {id && current ? (
          <>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={goBack}>
              <ArrowLeft size={22} color={colors.text} />
            </Pressable>
            <AppText variant="h3" numberOfLines={1} style={{ flex: 1 }}>
              {current.name}
            </AppText>
          </>
        ) : (
          <AppText variant="h2">{t('explore.allCategories')}</AppText>
        )}
      </View>

      {!tree && !failed && <ActivityIndicator style={{ padding: spacing.xxl }} color={colors.primary} />}
      {failed && <EmptyState title={t('common.somethingWrong')} />}

      {tree && (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
          {items.length === 0 ? (
            <EmptyState icon={<PackageOpen size={44} color={colors.textMuted} />} title={id ? t('explore.noListings') : t('explore.noCategories')} />
          ) : (
            <View style={styles.grid}>
              {items.map(c => (
                <CategoryTile key={c.id} category={c} size={72} onPress={() => setId(c.id)} />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.white },
  crumb: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
});
