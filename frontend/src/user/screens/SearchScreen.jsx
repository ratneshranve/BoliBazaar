import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { adsApi } from '../api/endpoints';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowUpDown, Check, Mic, Search, SearchX, SlidersHorizontal, Tag, X } from 'lucide-react';
import { listenOnce, voiceSupported } from '../services/voice';
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
const POSTED = ['1', '7', '30'];
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
  const [posted, setPosted] = useState(params.postedWithin ?? '');
  const [sellerType, setSellerType] = useState(params.sellerType ?? '');
  const [verified, setVerified] = useState(Boolean(params.verified));
  const [withPhotos, setWithPhotos] = useState(Boolean(params.withPhotos));
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
      postedWithin: posted || undefined,
      sellerType: sellerType || undefined,
      verified: verified ? '1' : undefined,
      withPhotos: withPhotos ? '1' : undefined,
      filters: Object.keys(clean(attrs)).length ? JSON.stringify(clean(attrs)) : undefined,
    });

  const reset = () => {
    setPrice({ min: '', max: '' });
    setCondition('');
    setType('');
    setDelivery(false);
    setPosted('');
    setSellerType('');
    setVerified(false);
    setWithPhotos(false);
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
          <Button title={t('search.apply')} variant="primary" onPress={apply} style={{ flex: 2 }} />
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

      <View>
        <AppText variant="bodyStrong" style={{ marginBottom: spacing.sm }}>{t('search.posted')}</AppText>
        <View style={styles.chips}>
          <Chip label={t('search.any')} active={!posted} onPress={() => setPosted('')} />
          {POSTED.map((d) => (
            <Chip key={d} label={t(`search.posted_${d}`)} active={posted === d} onPress={() => setPosted(d)} />
          ))}
        </View>
      </View>

      <View>
        <AppText variant="bodyStrong" style={{ marginBottom: spacing.sm }}>{t('search.seller')}</AppText>
        <View style={styles.chips}>
          <Chip label={t('search.any')} active={!sellerType} onPress={() => setSellerType('')} />
          <Chip label={t('search.seller_individual')} active={sellerType === 'individual'} onPress={() => setSellerType('individual')} />
          <Chip label={t('search.seller_business')} active={sellerType === 'business'} onPress={() => setSellerType('business')} />
        </View>
      </View>

      <View>
        <AppText variant="bodyStrong" style={{ marginBottom: spacing.sm }}>{t('search.more')}</AppText>
        <View style={styles.chips}>
          <Chip label={t('search.verifiedOnly')} active={verified} onPress={() => setVerified(!verified)} />
          <Chip label={t('search.withPhotos')} active={withPhotos} onPress={() => setWithPhotos(!withPhotos)} />
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
  const [suggestions, setSuggestions] = useState(null); // { categories, terms } while typing
  const [focused, setFocused] = useState(false);
  const [listening, setListening] = useState(false);

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

  // suggestions while typing (matching categories and ad titles)
  useEffect(() => {
    const q = text.trim();
    if (q.length < 2 || q === (params.q ?? '')) return setSuggestions(null);
    let live = true;
    const id = setTimeout(() => listingsApi.suggest(q).then(({ data }) => live && setSuggestions(data)).catch(() => {}), 200);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  const speak = () => {
    setListening(true);
    listenOnce({
      lang: i18n.language,
      onText: (said) => {
        if (!said) return;
        setText(said);
        patch({ q: said });
      },
      onEnd: () => setListening(false),
      onError: (code) => code === 'not-allowed' && Alert.alert(t('search.micBlocked')),
    });
  };

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
      postedWithin: params.postedWithin,
      sellerType: params.sellerType,
      verified: params.verified,
      withPhotos: params.withPhotos,
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



  const sort = params.sort || 'newest';
  const activeFilters = ['priceMin', 'priceMax', 'condition', 'delivery', 'listingType', 'filters', 'postedWithin', 'sellerType', 'verified', 'withPhotos'].filter((k) => params[k]).length;

  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={t('common.back')} onPress={() => navigate(-1)}>
          <ArrowLeft size={24} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, position: 'relative' }}>
          <Field
            value={text}
            onChangeText={setText}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            onSubmitEditing={() => {
              patch({ q: text.trim() || undefined });
              setSuggestions(null);
            }}
            placeholder={t('home.searchPlaceholder')}
            autoFocus={!params.q && !params.categoryId}
          />
          {focused && suggestions && (suggestions.categories.length > 0 || suggestions.terms.length > 0) && (
            <View style={styles.suggest}>
              {suggestions.categories.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => {
                    setText('');
                    setSuggestions(null);
                    patch({ q: undefined, categoryId: c.id, filters: undefined, listingType: undefined });
                  }}
                  style={styles.suggestRow}>
                  <Tag size={16} color={colors.textMuted} />
                  <AppText style={{ flex: 1 }}>{t('search.inCategory', { name: c.name })}</AppText>
                </Pressable>
              ))}
              {suggestions.terms.map((term) => (
                <Pressable
                  key={term}
                  onPress={() => {
                    setText(term);
                    setSuggestions(null);
                    patch({ q: term });
                  }}
                  style={styles.suggestRow}>
                  <Search size={16} color={colors.textMuted} />
                  <AppText style={{ flex: 1 }} numberOfLines={1}>{term}</AppText>
                </Pressable>
              ))}
            </View>
          )}
        </View>
        {voiceSupported() && (
          <Pressable accessibilityLabel={t('search.voice')} onPress={speak} style={[styles.mic, listening && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
            <Mic size={20} color={listening ? colors.white : colors.text} />
          </Pressable>
        )}
      </View>

      <View style={styles.bar}>
        <LocationChip maxWidth={110} />
        <View style={styles.toolsGroup}>
          <Pressable
            accessibilityLabel={t('search.sort')}
            onPress={() => setSheet('sort')}
            style={[styles.tool, sort !== 'newest' && styles.toolActive]}
          >
            <ArrowUpDown size={14} color={sort !== 'newest' ? colors.primary : colors.text} />
            <AppText variant="caption" style={styles.toolText} color={sort !== 'newest' ? colors.primary : colors.text}>
              {t('search.sort')}
            </AppText>
            {sort !== 'newest' && <View style={styles.activeDot} />}
          </Pressable>

          <Pressable
            accessibilityLabel={t('search.filters')}
            onPress={() => setSheet('filters')}
            style={[styles.tool, activeFilters > 0 && styles.toolActive]}
          >
            <SlidersHorizontal size={14} color={activeFilters > 0 ? colors.primary : colors.text} />
            <AppText variant="caption" style={styles.toolText} color={activeFilters > 0 ? colors.primary : colors.text}>
              {t('search.filters')}
            </AppText>
            {activeFilters > 0 && (
              <View style={styles.filterBadge}>
                <AppText variant="caption" color={colors.white} style={styles.filterBadgeText}>
                  {activeFilters}
                </AppText>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {(category || activeFilters > 0 || sort !== 'newest') && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeFiltersRow}>
          {category && (
            <Pressable onPress={() => patch({ categoryId: undefined, filters: undefined, listingType: undefined })} style={styles.activeFilterChip}>
              <AppText variant="caption" color={colors.primary} style={{ fontWeight: '600' }}>{category.name}</AppText>
              <X size={12} color={colors.primary} />
            </Pressable>
          )}
          {sort !== 'newest' && (
            <Pressable onPress={() => patch({ sort: undefined })} style={styles.activeFilterChip}>
              <AppText variant="caption" color={colors.primary} style={{ fontWeight: '600' }}>{t(`search.sort_${sort}`)}</AppText>
              <X size={12} color={colors.primary} />
            </Pressable>
          )}
          {params.priceMin && (
            <Pressable onPress={() => patch({ priceMin: undefined })} style={styles.activeFilterChip}>
              <AppText variant="caption" color={colors.primary} style={{ fontWeight: '600' }}>₹{params.priceMin}+</AppText>
              <X size={12} color={colors.primary} />
            </Pressable>
          )}
          {params.priceMax && (
            <Pressable onPress={() => patch({ priceMax: undefined })} style={styles.activeFilterChip}>
              <AppText variant="caption" color={colors.primary} style={{ fontWeight: '600' }}>≤ ₹{params.priceMax}</AppText>
              <X size={12} color={colors.primary} />
            </Pressable>
          )}
          {params.condition && (
            <Pressable onPress={() => patch({ condition: undefined })} style={styles.activeFilterChip}>
              <AppText variant="caption" color={colors.primary} style={{ fontWeight: '600' }}>{t(`listing.condition_${params.condition}`)}</AppText>
              <X size={12} color={colors.primary} />
            </Pressable>
          )}
          {params.verified && (
            <Pressable onPress={() => patch({ verified: undefined })} style={styles.activeFilterChip}>
              <AppText variant="caption" color={colors.primary} style={{ fontWeight: '600' }}>{t('search.verifiedOnly')}</AppText>
              <X size={12} color={colors.primary} />
            </Pressable>
          )}
          {params.withPhotos && (
            <Pressable onPress={() => patch({ withPhotos: undefined })} style={styles.activeFilterChip}>
              <AppText variant="caption" color={colors.primary} style={{ fontWeight: '600' }}>{t('search.withPhotos')}</AppText>
              <X size={12} color={colors.primary} />
            </Pressable>
          )}
          <Pressable
            onPress={() => patch({
              categoryId: undefined,
              priceMin: undefined,
              priceMax: undefined,
              condition: undefined,
              delivery: undefined,
              listingType: undefined,
              filters: undefined,
              postedWithin: undefined,
              sellerType: undefined,
              verified: undefined,
              withPhotos: undefined,
              sort: undefined,
            })}
            style={styles.clearAllBtn}
          >
            <AppText variant="caption" color={colors.textMuted} style={{ textDecorationLine: 'underline', fontWeight: '500' }}>{t('search.reset')}</AppText>
          </Pressable>
        </ScrollView>
      )}

      <ScrollView contentContainerStyle={{ paddingHorizontal: 10, paddingTop: spacing.md, paddingBottom: spacing.xxxl }}>
        {!items && !error && (
          <View style={{ minHeight: 'calc(100dvh - 200px)', alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary} /></View>
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
              <View key={l.id} style={{ width: '100%' }}>
                <ListingCard listing={l} horizontal />
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
          <View style={{ gap: spacing.xs, paddingBottom: spacing.sm }}>
            {SORTS.map((s) => {
              const active = sort === s;
              return (
                <Pressable
                  key={s}
                  onPress={() => {
                    if (s === 'nearest' && !current) return navigate('/location');
                    patch({ sort: s === 'newest' ? undefined : s });
                    setSheet(null);
                  }}
                  style={[styles.sortRow, active && styles.sortRowActive]}
                >
                  <AppText
                    variant="bodyStrong"
                    color={active ? colors.primary : colors.text}
                    style={{ flex: 1 }}
                  >
                    {s === 'nearest' && !current ? `${t('search.sort_nearest')} — ${t('search.nearestNeedsLocation')}` : t(`search.sort_${s}`)}
                  </AppText>
                  {active && <Check size={18} color={colors.primary} />}
                </Pressable>
              );
            })}
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
  sponsor: { borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: colors.divider, marginBottom: spacing.md },
  fill: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  toolsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  toolActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}0D`,
  },
  toolText: {
    fontWeight: '600',
    fontSize: 13,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  filterBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  activeFiltersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  activeFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: `${colors.primary}12`,
    borderWidth: 1,
    borderColor: `${colors.primary}30`,
  },
  clearAllBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  sortRowActive: {
    backgroundColor: `${colors.primary}0A`,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  mic: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  suggest: { position: 'absolute', top: 52, left: 0, right: 0, zIndex: 20, backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.xs, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
