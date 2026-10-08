import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Gavel, Search, ShoppingCart, Tag } from 'lucide-react-native';
import { AppText, EmptyState } from '../components/ui';
import { BrandHeader } from '../components/BrandHeader';
import { CategoryTile, LanguageChip, LocationChip } from '../components/Chips';
import { colors, radius, spacing, shadow } from '../theme/tokens';
import { homeApi } from '../api/endpoints';
import type { Banner, HomeFeed } from '../api/types';
import { useAppSelector } from '../store';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export const HomeScreen = () => {
  const { t, i18n } = useTranslation();
  const nav = useNavigation<Nav>();
  const loggedIn = useAppSelector(s => s.session.status === 'authenticated');
  const [home, setHome] = useState<HomeFeed | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    homeApi
      .get()
      .then(({ data }) => live && setHome(data))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [i18n.language]);

  const openBanner = (b: Banner) => b.action.type === 'category' && nav.navigate('Main', { screen: 'Explore', params: { categoryId: b.action.categoryId } });

  const cards = [
    { key: 'buy', icon: ShoppingCart, tint: colors.primary, bg: colors.primarySoft, title: t('home.buy'), sub: t('home.buySub'), go: () => nav.navigate('Main', { screen: 'Explore' }) },
    { key: 'sell', icon: Tag, tint: colors.sell, bg: colors.sellSoft, title: t('home.sell'), sub: t('home.sellSub'), go: () => (loggedIn ? nav.navigate('Main', { screen: 'Sell' }) : nav.navigate('Login')) },
    { key: 'auctions', icon: Gavel, tint: colors.auctionBlue, bg: colors.auctionSoft, title: t('home.auctions'), sub: t('home.auctionsSub'), go: () => nav.navigate('Main', { screen: 'Auctions' }) },
  ];

  return (
    <SafeAreaView style={styles.fill} edges={['top']}>
      <BrandHeader>
        <LocationChip />
        <LanguageChip />
      </BrandHeader>

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }} showsVerticalScrollIndicator={false}>
        <Pressable
          accessibilityRole="search"
          accessibilityLabel={t('home.searchPlaceholder')}
          onPress={() => nav.navigate('Main', { screen: 'Explore' })}
          style={styles.search}>
          <Search size={20} color={colors.textMuted} />
          <AppText color={colors.textSubtle} numberOfLines={1} style={{ flex: 1 }}>
            {t('home.searchPlaceholder')}
          </AppText>
        </Pressable>

        {!home && !failed && <ActivityIndicator style={{ padding: spacing.xxl }} color={colors.primary} />}
        {failed && <EmptyState title={t('common.somethingWrong')} />}

        {!!home?.banners.length && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
            {home.banners.map(b => (
              <Pressable key={b.id} onPress={() => openBanner(b)} style={styles.banner}>
                <Image source={{ uri: b.image }} style={styles.bannerImg} resizeMode="cover" />
                {(b.title || b.subtitle) && (
                  <View style={styles.bannerText}>
                    {!!b.title && (
                      <AppText variant="h3" color={colors.white}>
                        {b.title}
                      </AppText>
                    )}
                    {!!b.subtitle && (
                      <AppText variant="caption" color={colors.white}>
                        {b.subtitle}
                      </AppText>
                    )}
                  </View>
                )}
              </Pressable>
            ))}
          </ScrollView>
        )}

        <View style={styles.cards}>
          {cards.map(({ key, icon: Icon, tint, bg, title, sub, go }) => (
            <Pressable key={key} accessibilityRole="button" onPress={go} style={[styles.card, { backgroundColor: bg }]}>
              <Icon size={28} color={tint} />
              <AppText variant="h3" style={{ marginTop: spacing.sm }}>
                {title}
              </AppText>
              <AppText variant="small" color={colors.textMuted}>
                {sub}
              </AppText>
            </Pressable>
          ))}
        </View>

        {!!home?.categories.length && (
          <View style={{ marginTop: spacing.lg }}>
            <View style={styles.sectionHead}>
              <AppText variant="h2">{t('home.exploreCategories')}</AppText>
              <AppText variant="bodyStrong" color={colors.primary} onPress={() => nav.navigate('Main', { screen: 'Explore' })}>
                {t('common.seeAll')} ›
              </AppText>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}>
              {home.categories.map(c => (
                <CategoryTile key={c.id} category={c} onPress={() => nav.navigate('Main', { screen: 'Explore', params: { categoryId: c.id } })} />
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.white },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  banner: { width: 320, height: 150, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface },
  bannerImg: { width: '100%', height: '100%' },
  bannerText: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.md, backgroundColor: 'rgba(0,0,0,0.35)' },
  cards: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  card: { flex: 1, borderRadius: radius.lg, padding: spacing.md, minHeight: 112 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, marginBottom: spacing.md },
});
