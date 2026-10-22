import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mic, Search } from 'lucide-react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, View } from '../components/primitives';
import { AppText, EmptyState } from '../components/ui';
import { BrandHeader } from '../components/BrandHeader';
import { LocationChip } from '../components/LocationChip';
import { CategoryTile, ViewAllTile } from '../components/CategoryTile';
import { BannerCarousel } from '../components/BannerCarousel';
import { ListingCard } from '../components/ListingCard';
import { locationQuery } from '../utils/listing';
import { listenOnce, voiceSupported } from '../services/voice';
import { colors, radius, spacing, shadow } from '@theme/tokens';
import { adsApi, homeApi } from '../api/endpoints';
import { AuctionCard } from './AuctionScreens';
import { useAppSelector } from '../store';

const HomeBanners = ({ banners, adBanners, onOpenBanner }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const items = useMemo(() => {
    const list = [];
    if (adBanners?.length) {
      adBanners.forEach((b) => list.push({ ...b, isAd: true }));
    }
    if (banners?.length) {
      banners.forEach((b) => list.push({ ...b, isAd: false }));
    }
    return list;
  }, [banners, adBanners]);

  if (!items.length) return null;

  return (
    <View style={styles.bannerSection}>
      <BannerCarousel
        items={items}
        keyOf={(b) => (b.isAd ? `ad-${b.id}` : `banner-${b.id}`)}
        renderItem={(b) => (
          <Pressable
            onPress={() => {
              if (b.isAd) {
                adsApi.click(b.id).catch(() => {});
                if (b.route) navigate(b.route);
              } else {
                onOpenBanner(b);
              }
            }}
            style={styles.banner}
          >
            <Image source={{ uri: b.image }} style={styles.bannerImg} resizeMode="cover" />
            {b.isAd && (
              <View style={styles.adLabel}>
                <AppText variant="small" color={colors.white}>{t('ads.ad')}</AppText>
              </View>
            )}
            {(b.title || b.subtitle) && (
              <View style={styles.bannerText}>
                {!!b.title && <AppText variant="h3" color={colors.white}>{b.title}</AppText>}
                {!!b.subtitle && <AppText variant="caption" color={colors.white}>{b.subtitle}</AppText>}
              </View>
            )}
          </Pressable>
        )}
      />
    </View>
  );
};

export const HomeScreen = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [home, setHome] = useState(null);
  const [failed, setFailed] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const stopListening = useRef(null);

  // mic in the search bar: tap, say what you want, the results open (tap again to finish early)
  const speak = () => {
    if (listening) return stopListening.current?.();
    setListening(true);
    setHeard('');
    stopListening.current = listenOnce({
      lang: i18n.language,
      onPartial: setHeard,
      onText: (said) => said && navigate(`/search?q=${encodeURIComponent(said)}`),
      onEnd: () => {
        setListening(false);
        setHeard('');
      },
      onError: (code) => {
        if (code === 'not-allowed') Alert.alert(t('search.micBlocked'));
        else if (code === 'network') Alert.alert(t('search.voiceNetwork'));
        else Alert.alert(t('search.voiceUnavailable'));
      },
    });
    return undefined;
  };

  const current = useAppSelector((s) => s.location.current);
  const placeKey = current ? `${current.lat},${current.lng},${current.scope?.type},${current.scope?.km}` : '';

  useEffect(() => {
    let live = true;
    setFailed(false);
    homeApi
      .get(locationQuery(current))
      .then(({ data }) => live && setHome(data))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
    // reload when the language or the chosen place/distance changes
  }, [i18n.language, placeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const openBanner = (b) => b.action.type === 'category' && navigate(`/search?categoryId=${b.action.categoryId}`);

  const categoryColumns = useMemo(() => {
    if (!home?.categories?.length) return [];
    const all = [
      ...home.categories,
      { id: '__view_all__', isViewAll: true, name: t('common.seeAll') },
    ];
    const cols = [];
    for (let i = 0; i < all.length; i += 2) {
      cols.push([all[i], all[i + 1]]);
    }
    return cols;
  }, [home?.categories, t]);

  return (
    <View style={styles.fill}>
      <BrandHeader>
        <LocationChip />
      </BrandHeader>

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        {/* search (opens Explore until listing search ships) */}
        <View style={styles.search}>
          <Pressable accessibilityLabel={t('home.searchPlaceholder')} onPress={() => (listening ? speak() : navigate('/search'))} style={styles.searchTap}>
            <Search size={20} color={colors.brand} />
            <AppText color={listening ? (heard ? colors.text : colors.brand) : colors.textSubtle} numberOfLines={1} style={{ flex: 1 }}>
              {listening ? heard || t('search.listening') : t('home.searchPlaceholder')}
            </AppText>
          </Pressable>
          {voiceSupported() && (
            <Pressable accessibilityLabel={t('search.voice')} onPress={speak} hitSlop={8} style={[styles.mic, listening && { backgroundColor: colors.brand }]}>
              <Mic size={20} color={listening ? colors.white : colors.brand} />
            </Pressable>
          )}
        </View>

        {!home && !failed && (
          <View style={{ minHeight: 'calc(100dvh - 200px)', alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}
        {failed && <EmptyState title={t('common.somethingWrong')} />}

        {(home?.banners?.length > 0 || home?.adBanners?.length > 0) && (
          <HomeBanners
            banners={home.banners}
            adBanners={home.adBanners}
            onOpenBanner={openBanner}
          />
        )}

        {categoryColumns.length > 0 && (
          <View style={styles.categoriesSection}>
            <View style={styles.sectionHead}>
              <AppText variant="h2">{t('home.exploreCategories')}</AppText>
              <AppText
                variant="bodyStrong"
                color={colors.primary}
                onPress={() => navigate('/explore')}
              >
                {t('common.seeAll')} ›
              </AppText>
            </View>
            <ScrollView
              horizontal
              contentContainerStyle={styles.categoryScroll}
            >
              {categoryColumns.map((col, colIdx) => (
                <View key={`cat-col-${colIdx}`} style={styles.categoryCol}>
                  {col.map((c, rowIdx) => {
                    if (!c) {
                      return <View key={`cat-empty-${rowIdx}`} style={styles.categoryPlaceholder} />;
                    }
                    if (c.isViewAll) {
                      return <ViewAllTile key="view-all" label={t('common.seeAll')} size={60} style={styles.categoryTile} onPress={() => navigate('/explore')} />;
                    }
                    return (
                      <CategoryTile
                        key={c.id}
                        category={c}
                        size={60}
                        style={styles.categoryTile}
                        onPress={() => navigate(c.hasChildren ? `/explore/${c.id}` : `/search?categoryId=${c.id}`)}
                      />
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {[['featured', home?.featured], ['auctions', home?.auctions], ['nearby', home?.nearby], ['latest', home?.latest]].map(
          ([key, list]) =>
            list?.length > 0 && (
              <View key={key} style={{ marginTop: spacing.lg }}>
                <View style={styles.sectionHead}>
                  <AppText variant="h2">{t(`homeRails.${key}`)}</AppText>
                  <AppText
                    variant="bodyStrong"
                    color={colors.primary}
                    onPress={() => navigate(key === 'auctions' ? '/auctions' : `/search${key === 'nearby' ? '?sort=nearest' : ''}`)}
                  >
                    {t('common.seeAll')} ›
                  </AppText>
                </View>
                <ScrollView horizontal contentContainerStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
                  {list.map((l) =>
                    key === 'auctions' ? (
                      <View key={l.id} style={{ width: 200 }}><AuctionCard listing={l} /></View>
                    ) : (
                      <ListingCard key={l.id} listing={l} width={170} />
                    )
                  )}
                </ScrollView>
              </View>
            )
        )}

        {home?.sponsoredBusinesses?.length > 0 && (
          <View style={{ marginTop: spacing.lg }}>
            <View style={styles.sectionHead}>
              <AppText variant="h2">{t('ads.businesses')}</AppText>
              <AppText variant="small" color={colors.textMuted}>{t('ads.sponsored')}</AppText>
            </View>
            <ScrollView horizontal contentContainerStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}>
              {home.sponsoredBusinesses.map((b) => (
                <Pressable key={b.id} onPress={() => { adsApi.click(b.id).catch(() => {}); navigate(`/u/${b.publicId}`); }} style={styles.bizCard}>
                  {b.image ? <Image source={{ uri: b.image }} style={styles.bizImg} resizeMode="cover" /> : <View style={[styles.bizImg, { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }]}><AppText variant="h2" color={colors.primary}>{b.title.charAt(0)}</AppText></View>}
                  <AppText variant="bodyStrong" numberOfLines={1}>{b.title}</AppText>
                  {!!b.subtitle && <AppText variant="small" color={colors.textMuted} numberOfLines={2}>{b.subtitle}</AppText>}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  adLabel: { position: 'absolute', top: spacing.sm, right: spacing.sm, backgroundColor: 'rgba(17,24,39,0.7)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  bizCard: { width: 150, gap: 4 },
  bizImg: { width: 150, height: 96, borderRadius: radius.lg },
  fill: { flex: 1, backgroundColor: colors.white },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, marginVertical: spacing.md, paddingLeft: spacing.lg, paddingRight: spacing.sm, minHeight: 52, borderRadius: radius.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  searchTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52 },
  mic: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft },
  bannerSection: {
    marginHorizontal: spacing.sm,
    marginBottom: spacing.xs,
  },
  banner: { width: '100%', height: 150, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface, position: 'relative' },
  bannerImg: { width: '100%', height: '100%' },
  bannerText: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.md, backgroundColor: 'rgba(0,0,0,0.35)' },
  categoriesSection: { marginTop: spacing.md },
  categoryScroll: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  categoryCol: { gap: spacing.sm, alignItems: 'center' },
  categoryTile: { width: 76, height: 96, alignItems: 'center' },
  categoryPlaceholder: { width: 76, height: 96 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, marginBottom: spacing.md },
});
