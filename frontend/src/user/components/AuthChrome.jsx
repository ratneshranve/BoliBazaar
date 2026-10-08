import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, Headphones, ShieldCheck } from 'lucide-react';
import { Image, Pressable, StyleSheet, View } from './primitives';
import { AppText } from './ui';
import loginHeroImage from '../assets/login-hero.png';

/** Exact Hero Banner spanning full width edge-to-edge from mockup */
export const AuthHero = () => {
  return (
    <View style={styles.heroWrapper}>
      <Image
        source={{ uri: loginHeroImage }}
        style={styles.heroImage}
        resizeMode="cover"
      />
    </View>
  );
};

/** "Need Help?" footer with comfortable safe bottom space and 3 columns */
export const HelpFooter = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <View style={styles.footerContainer}>
      <View style={styles.helpRule}>
        <View style={styles.helpLine} />
        <AppText style={styles.helpRuleText}>{t('auth.needHelp') || 'Need Help?'}</AppText>
        <View style={styles.helpLine} />
      </View>
      <View style={styles.helpRow}>
        <Pressable onPress={() => navigate('/page/privacy')} style={styles.helpItem}>
          <ShieldCheck size={18} color="#0F172A" strokeWidth={1.8} />
          <AppText style={styles.helpLabel}>{t('auth.privacy') || 'Privacy Policy'}</AppText>
        </Pressable>
        <View style={styles.helpColDivider} />
        <Pressable onPress={() => navigate('/page/terms')} style={styles.helpItem}>
          <FileText size={18} color="#0F172A" strokeWidth={1.8} />
          <AppText style={styles.helpLabel}>{t('auth.terms') || 'Terms & Conditions'}</AppText>
        </Pressable>
        <View style={styles.helpColDivider} />
        <Pressable onPress={() => navigate('/page/support')} style={styles.helpItem}>
          <Headphones size={18} color="#0F172A" strokeWidth={1.8} />
          <AppText style={styles.helpLabel}>{t('auth.support') || 'Support'}</AppText>
        </Pressable>
      </View>
    </View>
  );
};

export const authStyles = StyleSheet.create({
  page: {
    flex: 1,
    height: '100%',
    maxHeight: '100%',
    overflow: 'hidden',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
  },
  card: {
    marginHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingVertical: 22,
    boxShadow: '0 8px 30px rgba(15, 23, 42, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.7)',
    flexShrink: 0,
    marginTop: -20,
    zIndex: 2,
  },
  cta: {
    borderRadius: 9999,
    height: 50,
    backgroundColor: '#A61B36',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
});

const styles = StyleSheet.create({
  heroWrapper: {
    width: '100%',
    flex: 1,
    minHeight: 220,
    maxHeight: 400,
    overflow: 'hidden',
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
    objectPosition: 'top center',
  },
  footerContainer: {
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 32, // Space at bottom
    flexShrink: 0,
  },
  helpRule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  helpLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  helpRuleText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#94A3B8',
  },
  helpRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  helpItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  helpColDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#E2E8F0',
  },
  helpLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#0F172A',
    textAlign: 'center',
  },
});
