import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, Headphones, ShieldCheck } from 'lucide-react';
import { Image, Pressable, StyleSheet, View } from './primitives';
import { AppText } from './ui';
import { colors, radius, spacing } from '@theme/tokens';
import { useAppSelector } from '../store';
import { categoriesApi } from '../api/endpoints';

/** Soft background tints behind each floating category chip (structural styling only). */
const CHIP_TINTS = ['#FDECEF', '#EAF1FB', '#FFF6E5', '#EAF7EE', '#EEF0FB'];

/** Top categories (from Admin › Categories) shown as chips around the login picture. */
const useTopCategories = () => {
  const [items, setItems] = useState([]);
  useEffect(() => {
    categoriesApi
      .tree()
      .then(({ data }) => setItems([...data].sort((a, b) => Number(Boolean(b.icon)) - Number(Boolean(a.icon))).slice(0, 5)))
      .catch(() => setItems([]));
  }, []);
  return items;
};

const Chip = ({ c, i }) => (
  <View style={[styles.chip, { backgroundColor: CHIP_TINTS[i % CHIP_TINTS.length] }]}>
    {c.icon ? <Image source={{ uri: c.icon }} style={{ width: 26, height: 26 }} resizeMode="contain" /> : null}
    <AppText variant="caption" style={{ fontWeight: '600' }} numberOfLines={2}>{c.name}</AppText>
  </View>
);

/** Logo + tagline + login picture with category chips. Everything shown comes from the admin panel. */
export const AuthHero = ({ compact = false }) => {
  const branding = useAppSelector((s) => s.app.bootstrap?.branding);
  const cats = useTopCategories();
  const left = cats.slice(0, 3);
  const right = cats.slice(3, 5);
  const heroH = compact ? 300 : 380;

  return (
    <View style={{ alignItems: 'center', paddingTop: spacing.lg }}>
      {branding?.logo?.url ? (
        <Image source={{ uri: branding.logo.url }} style={{ width: 240, height: compact ? 110 : 130 }} resizeMode="contain" />
      ) : branding?.appName ? (
        <AppText style={styles.brandName} color={colors.primary}>{branding.appName}</AppText>
      ) : null}
      {!!branding?.tagline && <AppText color={colors.textMuted} style={{ fontSize: 17, marginTop: spacing.xs }}>{branding.tagline}</AppText>}

      {(branding?.loginImage?.url || cats.length > 0) && (
        <View style={{ width: '100%', height: branding?.loginImage?.url ? heroH : 'auto', marginTop: spacing.md }}>
          {branding?.loginImage?.url && (
            <Image source={{ uri: branding.loginImage.url }} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%', height: heroH * 0.82 }} resizeMode="contain" />
          )}
          {branding?.loginImage?.url ? (
            <>
              <View style={[styles.chipCol, { left: spacing.lg }]}>{left.map((c, i) => <Chip key={c.id} c={c} i={i} />)}</View>
              <View style={[styles.chipCol, { right: spacing.lg, top: spacing.xl }]}>{right.map((c, i) => <Chip key={c.id} c={c} i={i + 3} />)}</View>
            </>
          ) : (
            <View style={styles.chipRow}>{cats.map((c, i) => <Chip key={c.id} c={c} i={i} />)}</View>
          )}
        </View>
      )}
    </View>
  );
};

/** "Need Help?" with links to the in-app Privacy, Terms and Support pages. */
export const HelpFooter = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const links = [
    { icon: ShieldCheck, label: t('auth.privacy'), slug: 'privacy' },
    { icon: FileText, label: t('auth.terms'), slug: 'terms' },
    { icon: Headphones, label: t('auth.support'), slug: 'support' },
  ];
  return (
    <View style={{ paddingHorizontal: spacing.xl, paddingVertical: spacing.xl }}>
      <View style={styles.helpRule}>
        <View style={styles.line} />
        <AppText variant="caption" color={colors.textMuted}>{t('auth.needHelp')}</AppText>
        <View style={styles.line} />
      </View>
      <View style={{ flexDirection: 'row', marginTop: spacing.lg }}>
        {links.map(({ icon: Icon, label, slug }, i) => (
          <Pressable key={slug} onPress={() => navigate(`/page/${slug}`)} style={[styles.helpLink, i > 0 && { borderLeftWidth: 1, borderLeftColor: colors.divider }]}>
            <Icon size={26} color={colors.text} />
            <AppText variant="caption" style={{ marginTop: spacing.xs, textAlign: 'center' }}>{label}</AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
};

export const authStyles = StyleSheet.create({
  page: { flex: 1, background: 'linear-gradient(180deg, #F7F8FC 0%, #FFFFFF 40%, #F7F8FC 100%)' },
  card: { marginHorizontal: spacing.lg, marginTop: spacing.sm, backgroundColor: colors.white, borderRadius: 24, padding: spacing.xl, boxShadow: '0 8px 30px rgba(20,24,60,0.08)' },
  cta: { borderRadius: radius.pill, height: 56 },
});

const styles = StyleSheet.create({
  brandName: { fontSize: 44, lineHeight: 52, fontWeight: '700', fontFamily: 'Georgia, serif' },
  chipCol: { position: 'absolute', top: 0, gap: spacing.md, zIndex: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.pill, maxWidth: 190, boxShadow: '0 4px 14px rgba(20,24,60,0.06)' },
  helpRule: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  line: { flex: 1, height: 1, backgroundColor: colors.divider },
  helpLink: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.xs },
});
