import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import {
  Package, Gavel, ShoppingBag, Heart, MessageSquare, Wallet, MapPin, FileText, ShieldCheck, Headphones, ChevronRight, BadgeCheck, Languages, LogOut,
} from 'lucide-react-native';
import { AppText, Button, Card, EmptyState } from '../components/ui';
import { BrandHeader } from '../components/BrandHeader';
import { colors, radius, spacing, shadow } from '../theme/tokens';
import { useAppDispatch, useAppSelector, logoutThunk } from '../store';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Placeholder for tabs whose content is delivered in a later phase (listings, search, auctions). */
const PhaseScreen = ({ header, children }: { header?: React.ReactNode; children?: React.ReactNode }) => (
  <SafeAreaView style={styles.fill} edges={['top']}>
    {header}
    <View style={styles.fill}>{children}</View>
  </SafeAreaView>
);

export const HomeScreen = () => {
  const { t } = useTranslation();
  return (
    <PhaseScreen header={<BrandHeader />}>
      <EmptyState title={t('home.empty')} />
    </PhaseScreen>
  );
};

export const ExploreScreen = () => {
  const { t } = useTranslation();
  return (
    <PhaseScreen header={<BrandHeader />}>
      <EmptyState title={t('common.comingSoon')} />
    </PhaseScreen>
  );
};

export const SellScreen = () => {
  const { t } = useTranslation();
  return (
    <PhaseScreen header={<BrandHeader />}>
      <EmptyState title={t('common.comingSoon')} />
    </PhaseScreen>
  );
};

export const AuctionsScreen = () => {
  const { t } = useTranslation();
  const enabled = useAppSelector(s => s.app.bootstrap?.features.auctions);
  return (
    <PhaseScreen header={<BrandHeader />}>
      <EmptyState title={enabled ? t('common.comingSoon') : t('common.comingSoon')} />
    </PhaseScreen>
  );
};

type MenuItem = { icon: React.ReactNode; title: string; sub: string; onPress?: () => void };

const Row = ({ item, last }: { item: MenuItem; last: boolean }) => (
  <Pressable accessibilityRole="button" onPress={item.onPress} style={[styles.menuRow, !last && styles.menuDivider]}>
    <View style={styles.menuIcon}>{item.icon}</View>
    <View style={{ flex: 1 }}>
      <AppText variant="bodyStrong">{item.title}</AppText>
      <AppText variant="caption" color={colors.textMuted}>
        {item.sub}
      </AppText>
    </View>
    <ChevronRight size={20} color={colors.textMuted} />
  </Pressable>
);

export const ProfileScreen = () => {
  const { t, i18n } = useTranslation();
  const nav = useNavigation<Nav>();
  const dispatch = useAppDispatch();
  const { status, me } = useAppSelector(s => s.session);
  const bootstrapLanguages = useAppSelector(s => s.app.bootstrap?.languages?.items);

  if (status !== 'authenticated' || !me) {
    return (
      <PhaseScreen header={<BrandHeader />}>
        <EmptyState
          title={t('profile.guestTitle')}
          body={t('profile.guestBody')}
          action={<Button title={t('profile.login')} onPress={() => nav.navigate('Login')} />}
        />
      </PhaseScreen>
    );
  }

  const currentLang = (bootstrapLanguages ?? []).find(l => l.code === i18n.language);

  const tiles = [
    { icon: <Package size={26} color={colors.primary} />, bg: colors.primarySoft, title: t('profile.myListings'), sub: t('profile.myListingsSub') },
    { icon: <Gavel size={26} color={colors.sell} />, bg: colors.sellSoft, title: t('profile.myAuctions'), sub: t('profile.myAuctionsSub') },
    { icon: <ShoppingBag size={26} color={colors.auctionBlue} />, bg: colors.auctionSoft, title: t('profile.myPurchases'), sub: t('profile.myPurchasesSub') },
    { icon: <Heart size={26} color={colors.warm} />, bg: colors.warmSoft, title: t('profile.favourites'), sub: t('profile.favouritesSub') },
  ];

  const menu: MenuItem[] = [
    { icon: <MessageSquare size={22} color={colors.text} />, title: t('profile.messages'), sub: t('profile.messagesSub') },
    { icon: <Wallet size={22} color={colors.text} />, title: t('profile.payments'), sub: t('profile.paymentsSub') },
    { icon: <MapPin size={22} color={colors.text} />, title: t('profile.addresses'), sub: t('profile.addressesSub') },
    { icon: <FileText size={22} color={colors.text} />, title: t('profile.verification'), sub: t('profile.verificationSub') },
    { icon: <ShieldCheck size={22} color={colors.text} />, title: t('profile.security'), sub: t('profile.securitySub'), onPress: () => nav.navigate('Security') },
    { icon: <Languages size={22} color={colors.text} />, title: t('profile.language'), sub: currentLang?.nativeName ?? i18n.language, onPress: () => nav.navigate('Language') },
    { icon: <Headphones size={22} color={colors.text} />, title: t('profile.help'), sub: t('profile.helpSub'), onPress: () => nav.navigate('Page', { slug: 'support' }) },
  ];

  return (
    <SafeAreaView style={styles.fill} edges={['top']}>
      <BrandHeader right="bell+settings" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }} showsVerticalScrollIndicator={false}>
        <View style={styles.profileCard}>
          {me.avatar?.url ? (
            <Image source={{ uri: me.avatar.url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarEmpty]}>
              <AppText variant="h1" color={colors.primary}>
                {(me.name ?? '?').charAt(0).toUpperCase()}
              </AppText>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <AppText variant="h2" numberOfLines={1}>
              {me.name}
            </AppText>
            {me.phone.verified && (
              <View style={styles.verified}>
                <BadgeCheck size={16} color={colors.verified} />
                <AppText variant="caption" color={colors.textMuted}>
                  {t('profile.verifiedPhone')}
                </AppText>
              </View>
            )}
          </View>
          <Button title={t('profile.editProfile')} variant="outline" size="md" />
        </View>

        <View style={styles.tiles}>
          {tiles.map(tile => (
            <Pressable key={tile.title} accessibilityRole="button" style={[styles.tile, { backgroundColor: tile.bg }]}>
              {tile.icon}
              <AppText variant="bodyStrong" style={{ marginTop: spacing.sm }}>
                {tile.title}
              </AppText>
              <AppText variant="small" color={colors.textMuted}>
                {tile.sub}
              </AppText>
            </Pressable>
          ))}
        </View>

        <Card style={{ padding: 0, marginTop: spacing.lg }}>
          {menu.map((m, i) => (
            <Row key={m.title} item={m} last={i === menu.length - 1} />
          ))}
        </Card>

        <Button title={t('common.logout')} variant="outline" icon={<LogOut size={18} color={colors.primary} />} onPress={() => dispatch(logoutThunk())} style={{ marginTop: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.white },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: '#EEF3FB', borderRadius: radius.xl, padding: spacing.lg },
  avatar: { width: 68, height: 68, borderRadius: 34 },
  avatarEmpty: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.lg },
  tile: { width: '47.5%', borderRadius: radius.lg, padding: spacing.lg, minHeight: 112, ...shadow.card },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  menuDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  menuIcon: { width: 28, alignItems: 'center' },
});
