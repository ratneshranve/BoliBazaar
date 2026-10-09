import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { adsApi, growthApi } from '../api/endpoints';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowUpDown, Bookmark, SearchX, SlidersHorizontal, X } from 'lucide-react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, View } from '../components/primitives';
import { AppText, Button, EmptyState, Field } from '../components/ui';
import { ListingCard } from '../components/ListingCard';
import { LocationChip } from '../components/LocationChip';
import { Sheet } from '../components/Sheet';
import { colors, radius, spacing } from '@theme/tokens';
import { categoriesApi, listingsApi } from '../api/endpoints';
import { useAppSelector } from '../store';
import { locationQuery } from '../utils/listing';
import { errorText } from '../i18n';

const CONDITIONS = ['new', 'used', 'refurbished'];
const SORTS = ['newest', 'price_asc', 'price_desc', 'nearest'];

const Chip = ({ label, active, onPress }) => (
  <Pressable onPress={onPress} style={[styles.chip, active && styles.chipOn]}>
    <AppText variant="bodyStrong" color={active ? colors.white : colors.text}>{label}</AppText>
  </Pressable>
);

/** Filters for this search: price, condition, type and the category's own filterable fields. */
function FiltersSheet({ category, params, onApply, onClose }) {
  const { t } = useTranslation();
  const [price, setPrice] = useState({ min: params.priceMin ?? '', max: params.priceMax ?? '' });
  const [condition, setCondition] = useState(params.condition ?? '');
  const [type, setType] = useState(params.listingType ?? '');
  const [delivery, setDelivery] = useState(Boolean(params.delivery));
  const [attrs, setAttrs] = useState(() => {
    try {
      return params.filters ? JSON.parse(params.filters) : {};
    } catch {
      return {};
    }
  });

  const fields = (category?.attributes ?? []).filter((a) => a.filterable);
  const setAttr = (key, patch) => setAttrs((a) => ({ ...a, [key]: patch }));
  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== undefined && !(typeof v === 'object' && v !== null && Object.values(v).every((x) => x === '' || x === undefined))));

  const apply = () =>
    onApply({
      priceMin: price.min || undefined,
      priceMax: price.max || undefined,
      condition: condition || undefined,
      listingType: type || undefined,
      delivery: delivery ? '1' : undefined,
      filters: Object.keys(clean(attrs)).length ? JSON.stringify(clean(attrs)) : undefined,
    });

  const reset = () => {
    setPrice({ min: '', max: '' });
    setCondition('');
    setType('');
    setDelivery(false);
    setAttrs({});
  };

  return (
    <Sheet
      title={t('search.filters')}
      onClose={onClose}
      tall
      footer={
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Button title={t('search.reset')} variant="outline" onPress={reset} style={{ flex: 1 }} />
          <Button title={t('search.apply')} onPress={apply} style={{ flex: 2 }} />
        </View>
      }>
      <View>
        <AppText variant="bodyStrong" style={{ marginBottom: spacing.sm }}>{t('search.priceRange')}</AppText>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}><Field value={String(price.min)} onChangeText={(v) => setPrice({ ...price, min: v.replace(/\D/g, '') })} placeholder={t('search.min')} keyboardType="number-pad" /></View>
          <View style={{ flex: 1 }}><Field value={String(price.max)} onChangeText={(v) => setPrice({ ...price, max: v.replace(/\D/g, '') })} placeholder={t('search.max')} keyboardType="number-pad" /></View>
        </View>
      </View>

      <View>
        <AppText variant="bodyStrong" style={{ marginBottom: spacing.sm }}>{t('search.condition')}</AppText>
        <View style={styles.chips}>
          <Chip label={t('search.any')} active={!condition} onPress={() => setCondition('')} />
          {CONDITIONS.map((c) => (
            <Chip key={c} label={t(`listing.condition_${c}`)} active={condition === c} onPress={() => setCondition(c)} />
          ))}
        </View>
      </View>

      <View>
        <AppText variant="bodyStrong" style={{ marginBottom: spacing.sm }}>{t('search.delivery')}</AppText>
        <View style={styles.chips}>
          <Chip label={t('search.any')} active={!delivery} onPress={() => setDelivery(false)} />
          <Chip label={t('search.deliveryOnly')} active={delivery} onPress={() => setDelivery(true)} />
        </View>
      </View>

      {category?.listingTypes?.length > 1 && (
        <View>
          <AppText variant="bodyStrong" style={{ marginBottom: spacing.sm }}>{t('search.type')}</AppText>
          <View style={styles.chips}>
            <Chip label={t('search.any')} active={!type} onPress={() => setType('')} />
            {category.listingTypes.filter((x) => x !== 'auction').map((x) => (
              <Chip key={x} label={t(`listing.type_${x}`)} active={type === x} onPress={() => setType(x)} />
            ))}
          </View>
        </View>
      )}

      {fields.map((f) =>
        ['number', 'year'].includes(f.type) ? (
          <View key={f.key}>
            <AppText variant="bodyStrong" style={{ marginBottom: spacing.sm }}>{f.label}{f.unit ? ` (${f.unit})` : ''}</AppText>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ flex: 1 }}><Field value={String(attrs[f.key]?.min ?? '')} onChangeText={(v) => setAttr(f.key, { ...attrs[f.key], min: v === '' ? undefined : Number(v.replace(/\D/g, '')) })} placeholder={t('search.min')} keyboardType="number-pad" /></View>
              <View style={{ flex: 1 }}><Field value={String(attrs[f.key]?.max ?? '')} onChangeText={(v) => setAttr(f.key, { ...attrs[f.key], max: v === '' ? undefined : Number(v.replace(/\D/g, '')) })} placeholder={t('search.max')} keyboardType="number-pad" /></View>
            </View>
          </View>
        ) : ['select', 'multiselect'].includes(f.type) ? (
          <View key={f.key}>
            <AppText variant="bodyStrong" style={{ marginBottom: spacing.sm }}>{f.label}</AppText>
            <View style={styles.chips}>
              <Chip label={t('search.any')} active={!attrs[f.key]} onPress={() => setAttr(f.key, undefined)} />
              {f.options.map((o) => (
                <Chip key={o.value} label={o.label} active={attrs[f.key]?.eq === o.value} onPress={() => setAttr(f.key, { eq: o.value })} />
              ))}
            </View>
          </View>
        ) : null
      )}
    </Sheet>
  );
}

/** Search results: keyword, category, filters, sort and distance — all kept in the URL so a search can be shared. */
export const SearchScreen = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const current = useAppSelector((s) => s.location.current);
  const params = useMemo(() => Object.fromEntries(sp.entries()), [sp]);

  const [text, setText] = useState(params.q ?? '');
  const [category, setCategory] = useState(null);
  const [items, setItems] = useState(null);
  const [ads, setAds] = useState({ sponsoredListings: [], sponsor: null });
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState(null); // 'sort' | 'filters'

  const patch = useCallback((next) => {
    const merged = { ...params, ...next };
    Object.keys(merged).forEach((k) => (merged[k] === undefined || merged[k] === '') && delete merged[k]);
    setSp(merged, { replace: true });
  }, [params, setSp]);

  // keyword typing → URL (debounced)
  useEffect(() => {
    const id = setTimeout(() => text !== (params.q ?? '') && patch({ q: text.trim() || undefined }), 400);
    return () => clearTimeout(id);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  // the category (name + its filterable fields)
  useEffect(() => {
    if (!params.categoryId) return setCategory(null);
    categoriesApi.detail(params.categoryId).then(({ data }) => setCategory(data)).catch(() => setCategory(null));
  }, [params.categoryId, i18n.language]);

  const query = useMemo(
    () => ({
      q: params.q,
      categoryId: params.categoryId,
      listingType: params.listingType,
      condition: params.condition,
      delivery: params.delivery,
      priceMin: params.priceMin,
      priceMax: params.priceMax,
      filters: params.filters,
      sort: params.sort === 'nearest' && !current ? undefined : params.sort,
      ...locationQuery(current),
    }),
    [params, current]
  );

  const run = useCallback(
    async (pageNo) => {
      try {
        const { data } = await listingsApi.search({ ...query, page: pageNo, limit: 20 });
        setItems((prev) => (pageNo === 1 ? data.items : [...(prev ?? []), ...data.items]));
        if (pageNo === 1) setAds({ sponsoredListings: data.sponsoredListings || [], sponsor: data.sponsor || null });
        setHasMore(data.hasMore);
        setPage(pageNo);
        setError('');
      } catch (e) {
        setError(errorText(e));
        setItems((prev) => prev ?? []);
      }
    },
    [query]
  );

  useEffect(() => {
    setItems(null);
    run(1);
  }, [run, i18n.language]);

  const loadMore = async () => {
    setLoadingMore(true);
    await run(page + 1);
    setLoadingMore(false);
  };

  const authed = useAppSelector((s) => s.session.status === 'authenticated');
  const saveSearch = async () => {
    if (!authed) return navigate('/login');
    const name = window.prompt(t('saved.namePrompt'), params.q || category?.name || '');
    if (!name || name.trim().length < 2) return;
    const { sort: _s, ...q } = query; // eslint-disable-line no-unused-vars
    try {
      await growthApi.saveSearch({ name: name.trim(), query: Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined && v !== '')), alerts: true });
      Alert.alert(t('saved.saved'));
    } catch (e) {
      Alert.alert(errorText(e));
    }
  };

  const sort = params.sort || 'newest';
  const activeFilters = ['priceMin', 'priceMax', 'condition', 'delivery', 'listingType', 'filters'].filter((k) => params[k]).length;

  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={t('common.back')} onPress={() => navigate(-1)}>
          <ArrowLeft size={24} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Field value={text} onChangeText={setText} placeholder={t('home.searchPlaceholder')} autoFocus={!params.q && !params.categoryId} />
        </View>
      </View>

      <View style={styles.bar}>
        <LocationChip />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Pressable onPress={() => setSheet('sort')} style={styles.tool}>
            <ArrowUpDown size={16} color={colors.text} />
            <AppText variant="bodyStrong">{t('search.sort')}</AppText>
          </Pressable>
          <Pressable accessibilityLabel={t('saved.save')} onPress={saveSearch} style={styles.tool}>
            <Bookmark size={16} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => setSheet('filters')} style={styles.tool}>
            <SlidersHorizontal size={16} color={colors.text} />
            <AppText variant="bodyStrong">{t('search.filters')}{activeFilters ? ` (${activeFilters})` : ''}</AppText>
          </Pressable>
        </View>
      </View>

      {category && (
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, flexDirection: 'row' }}>
          <Pressable onPress={() => patch({ categoryId: undefined, filters: undefined, listingType: undefined })} style={[styles.chip, styles.chipOn, { flexDirection: 'row', alignItems: 'center', gap: spacing.xs }]}>
            <AppText variant="bodyStrong" color={colors.white}>{category.name}</AppText>
            <X size={14} color={colors.white} />
          </Pressable>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        {!items && !error && (
          <View style={{ padding: spacing.xxl, alignItems: 'center' }}><ActivityIndicator color={colors.primary} /></View>
        )}
        {!!error && <AppText color={colors.danger} style={{ textAlign: 'center' }}>{error}</AppText>}
        {items && items.length === 0 && !error && (
          <EmptyState icon={<SearchX size={44} color={colors.textMuted} />} title={t('search.noResults')} body={t('search.noResultsHint')} />
        )}
        {ads.sponsor && (
          <Pressable onPress={() => { adsApi.click(ads.sponsor.id).catch(() => {}); if (ads.sponsor.route) navigate(ads.sponsor.route); }} style={styles.sponsor}>
            {ads.sponsor.image && <Image source={{ uri: ads.sponsor.image }} style={{ width: '100%', height: 110 }} resizeMode="cover" />}
            <View style={{ padding: spacing.sm }}>
              <AppText variant="small" color={colors.textMuted}>{t('ads.sponsored')}</AppText>
              {!!ads.sponsor.title && <AppText variant="bodyStrong">{ads.sponsor.title}</AppText>}
              {!!ads.sponsor.subtitle && <AppText variant="caption" color={colors.textMuted}>{ads.sponsor.subtitle}</AppText>}
            </View>
          </Pressable>
        )}
        {items && items.length > 0 && (
          <View style={styles.grid}>
            {[...ads.sponsoredListings, ...items.filter((x) => !ads.sponsoredListings.some((s) => s.id === x.id))].map((l) => (
              <View key={l.id} style={{ width: 'calc(50% - 6px)' }}>
                <ListingCard listing={l} />
              </View>
            ))}
          </View>
        )}
        {hasMore && (
          <Button title={t('search.loadMore')} variant="outline" loading={loadingMore} onPress={loadMore} style={{ marginTop: spacing.lg }} />
        )}
      </ScrollView>

      {sheet === 'sort' && (
        <Sheet title={t('search.sort')} onClose={() => setSheet(null)}>
          <View style={{ gap: spacing.sm }}>
            {SORTS.map((s) => (
              <Chip
                key={s}
                label={s === 'nearest' && !current ? `${t('search.sort_nearest')} — ${t('search.nearestNeedsLocation')}` : t(`search.sort_${s}`)}
                active={sort === s}
                onPress={() => {
                  if (s === 'nearest' && !current) return navigate('/location');
                  patch({ sort: s === 'newest' ? undefined : s });
                  setSheet(null);
                }}
              />
            ))}
          </View>
        </Sheet>
      )}
      {sheet === 'filters' && (
        <FiltersSheet
          category={category}
          params={params}
          onClose={() => setSheet(null)}
          onApply={(f) => {
            patch(f);
            setSheet(null);
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  sponsor: { borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.divider, marginBottom: spacing.md },
  fill: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  tool: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
