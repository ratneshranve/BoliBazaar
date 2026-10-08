import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Gavel, Search, ShoppingCart, Tag } from 'lucide-react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from '../components/primitives';
import { AppText, EmptyState } from '../components/ui';
import { BrandHeader } from '../components/BrandHeader';
import { LocationChip } from '../components/LocationChip';
import { LanguageChip } from '../components/LanguageChip';
import { CategoryTile } from '../components/CategoryTile';
import { ListingCard } from '../components/ListingCard';
import { locationQuery } from '../utils/listing';
import { colors, radius, spacing, shadow } from '@theme/tokens';
import { homeApi } from '../api/endpoints';
import { useAppSelector } from '../store';

export const HomeScreen = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const loggedIn = useAppSelector((s) => s.session.status === 'authenticated');
  const [home, setHome] = useState(null);
  const [failed, setFailed] = useState(false);

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

  const cards = [
    { key: 'buy', icon: ShoppingCart, tint: colors.primary, bg: colors.primarySoft, title: t('home.buy'), sub: t('home.buySub'), go: () => navigate('/explore') },
    { key: 'sell', icon: Tag, tint: colors.sell, bg: colors.sellSoft, title: t('home.sell'), sub: t('home.sellSub'), go: () => navigate(loggedIn ? '/sell' : '/login') },
    { key: 'auctions', icon: Gavel, tint: colors.auctionBlue, bg: colors.auctionSoft, title: t('home.auctions'), sub: t('home.auctionsSub'), go: () => navigate('/auctions') },
  ];

  return (
    <View style={styles.fill}>
      <BrandHeader>
        <LocationChip />
        <LanguageChip />
      </BrandHeader>

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        {/* search (opens Explore until listing search ships) */}
        <Pressable accessibilityLabel={t('home.searchPlaceholder')} onPress={() => navigate('/search')} style={styles.search}>
          <Search size={20} color={colors.textMuted} />
          <AppText color={colors.textSubtle} numberOfLines={1} style={{ flex: 1 }}>
            {t('home.searchPlaceholder')}
          </AppText>
        </Pressable>

        {!home && !failed && (
          <View style={{ padding: spacing.xxl, alignItems: 'center' }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}
        {failed && <EmptyState title={t('common.somethingWrong')} />}

        {home?.banners.length > 0 && (
          <ScrollView horizontal contentContainerStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
            {home.banners.map((b) => (
              <Pressable key={b.id} onPress={() => openBanner(b)} style={styles.banner}>
                <Image source={{ uri: b.image }} style={styles.bannerImg} resizeMode="cover" />
                {(b.title || b.subtitle) && (
                  <View style={styles.bannerText}>
                    {!!b.title && <AppText variant="h3" color={colors.white}>{b.title}</AppText>}
                    {!!b.subtitle && <AppText variant="caption" color={colors.white}>{b.subtitle}</AppText>}
                  </View>
                )}
              </Pressable>
            ))}
          </ScrollView>
        )}

        <View style={styles.cards}>
          {cards.map(({ key, icon: Icon, tint, bg, title, sub, go }) => (
            <Pressable key={key} onPress={go} style={[styles.card, { backgroundColor: bg }]}>
              <Icon size={28} color={tint} />
              <AppText variant="h3" style={{ marginTop: spacing.sm }}>{title}</AppText>
              <AppText variant="small" color={colors.textMuted}>{sub}</AppText>
            </Pressable>
          ))}
        </View>

        {[['featured', home?.featured], ['auctions', home?.auctions], ['nearby', home?.nearby], ['latest', home?.latest]].map(
          ([key, list]) =>
            list?.length > 0 && (
              <View key={key} style={{ marginTop: spacing.lg }}>
                <View style={styles.sectionHead}>
                  <AppText variant="h2">{t(`homeRails.${key}`)}</AppText>
                  <AppText variant="bodyStrong" color={colors.primary} onPress={() => navigate(key === 'auctions' ? '/auctions' : `/search${key === 'nearby' ? '?sort=nearest' : ''}`)}>
                    {t('common.seeAll')} ›
                  </AppText>
                </View>
                <ScrollView horizontal contentContainerStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
                  {list.map((l) => (
                    <ListingCard key={l.id} listing={l} width={170} />
                  ))}
                </ScrollView>
              </View>
            )
        )}

        {home?.categories.length > 0 && (
          <View style={{ marginTop: spacing.lg }}>
            <View style={styles.sectionHead}>
              <AppText variant="h2">{t('home.exploreCategories')}</AppText>
              <AppText variant="bodyStrong" color={colors.primary} onPress={() => navigate('/explore')}>
                {t('common.seeAll')} ›
              </AppText>
            </View>
            <ScrollView horizontal contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}>
              {home.categories.map((c) => (
                <CategoryTile key={c.id} category={c} onPress={() => navigate(c.hasChildren ? `/explore/${c.id}` : `/search?categoryId=${c.id}`)} />
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.white },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, marginVertical: spacing.md, paddingHorizontal: spacing.lg, minHeight: 52, borderRadius: radius.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  banner: { width: 320, height: 150, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface },
  bannerImg: { width: '100%', height: '100%' },
  bannerText: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.md, backgroundColor: 'rgba(0,0,0,0.35)' },
  cards: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  card: { flex: 1, borderRadius: radius.lg, padding: spacing.md, minHeight: 112 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, marginBottom: spacing.md },
});
