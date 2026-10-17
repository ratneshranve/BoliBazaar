import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronRight, PackageOpen } from 'lucide-react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from '../components/primitives';
import { AppText, EmptyState } from '../components/ui';
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

/** /explore → top-level categories; /explore/:id → left rail of categories + that category's sub-categories on the right. */
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
  // left rail = top-level categories; the right pane shows the children of the opened node (first top-level by default)
  const top = trail?.[0] ?? tree?.[0];
  const current = trail?.[trail.length - 1] ?? tree?.[0];
  const items = current?.children ?? [];

  const goBack = () => (trail && trail.length > 1 ? navigate(`/explore/${trail[trail.length - 2].id}`) : navigate('/'));
  const open = (c) => navigate(c.children.length ? `/explore/${c.id}` : `/search?categoryId=${c.id}`);

  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={t('common.back')} onPress={goBack} style={{ padding: spacing.xs }}>
          <ArrowLeft size={24} color={colors.text} />
        </Pressable>
        <AppText variant="h2">{t('explore.categories')}</AppText>
      </View>

      {!tree && !failed && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
      {failed && <EmptyState title={t('common.somethingWrong')} />}

      {tree && tree.length === 0 && <EmptyState icon={<PackageOpen size={44} color={colors.textMuted} />} title={t('explore.noCategories')} />}

      {tree && tree.length > 0 && (
        <View style={styles.body}>
          <ScrollView style={styles.rail}>
            {tree.map((c) => {
              const active = c.id === top?.id;
              return (
                <Pressable key={c.id} accessibilityLabel={c.name} onPress={() => navigate(`/explore/${c.id}`)} style={[styles.railItem, active && styles.railActive]}>
                  {active && <View style={styles.railBar} />}
                  <View style={[styles.railIcon, active && { borderColor: colors.primary }]}>
                    {c.icon ? (
                      <Image source={{ uri: c.icon }} style={{ width: 38, height: 38 }} resizeMode="contain" />
                    ) : (
                      <AppText style={{ fontSize: 20, fontWeight: '700' }} color={colors.brand}>{c.name?.charAt(0).toUpperCase()}</AppText>
                    )}
                  </View>
                  <AppText variant="small" numberOfLines={3} style={styles.railLabel} color={active ? colors.primary : colors.text}>
                    {c.name}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>

          <ScrollView style={styles.pane} contentContainerStyle={styles.paneContent}>
            <View style={styles.titleRow}>
              <AppText variant="h3" style={{ color: colors.brand }}>{current?.name}</AppText>
              <View style={styles.titleLine} />
            </View>

            <View style={styles.grid}>
              {items.map((c) => (
                <CategoryTile key={c.id} category={c} size={72} style={styles.gridTile} onPress={() => open(c)} />
              ))}
              <Pressable accessibilityLabel={t('explore.viewAll')} onPress={() => navigate(`/search?categoryId=${current.id}`)} style={[styles.gridTile, { alignItems: 'center' }]}>
                <View style={styles.viewAll}>
                  <ChevronRight size={28} color={colors.brand} />
                </View>
                <AppText variant="small" style={styles.viewAllLabel}>{t('explore.viewAll')}</AppText>
              </Pressable>
            </View>

            <Pressable onPress={() => navigate('/sell')} style={styles.sell}>
              <View style={styles.sellDot} />
              <AppText variant="bodyStrong" style={{ flex: 1 }}>{t('explore.sellCta')}</AppText>
              <ChevronRight size={20} color={colors.text} />
            </Pressable>
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  body: { flex: 1, flexDirection: 'row', minHeight: 0 },
  rail: { flex: '0 0 auto', width: 92, backgroundColor: colors.brandSoft },
  railItem: { alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: colors.white },
  railActive: { backgroundColor: colors.white },
  railBar: { position: 'absolute', left: 0, top: 10, bottom: 10, width: 4, borderTopRightRadius: 4, borderBottomRightRadius: 4, backgroundColor: colors.primary },
  railIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderWidth: 1.5, borderColor: 'transparent' },
  railLabel: { textAlign: 'center', marginTop: 6, fontWeight: '500', width: '100%' },
  pane: { flex: 1 },
  paneContent: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  titleLine: { flex: 1, height: 1, backgroundColor: colors.border },
  // three columns, same on website and phone
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 18, width: '100%', alignItems: 'flex-start' },
  gridTile: { width: '33.333%', alignItems: 'center' },
  viewAll: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  viewAllLabel: { textAlign: 'center', marginTop: spacing.xs, fontWeight: '600', color: colors.brand },
  sell: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xxl, padding: spacing.md, borderRadius: 10, backgroundColor: colors.primarySoft, borderLeftWidth: 4, borderLeftColor: colors.primary },
  sellDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
});
