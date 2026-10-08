import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, ChevronDown } from 'lucide-react';
import { getCountryCallingCode } from 'libphonenumber-js';
import { Alert, Image, Pressable, ScrollView, StyleSheet, TextInput, View } from '../components/primitives';
import { PageSheet } from './PageScreen';
import { AppText, Button, Checkbox, Field } from '../components/ui';
import { AuthHero, HelpFooter, authStyles } from '../components/AuthChrome';
import { colors, spacing } from '@theme/tokens';
import { authApi, meApi } from '../api/endpoints';
import { ApiError, saveTokens } from '../api/client';
import { errorText } from '../i18n';
import { env } from '../config/env';
import { useAppDispatch, useAppSelector, signedIn, meUpdated } from '../store';

/** Country flag picture (flag emoji do not show on Windows). */
const Flag = ({ cc }) => <Image source={{ uri: `https://flagcdn.com/w40/${cc.toLowerCase()}.png` }} style={{ width: 28, height: 20, borderRadius: 3 }} resizeMode="cover" />;
const dialOf = (cc) => {
  try {
    return `+${getCountryCallingCode(cc)}`;
  } catch {
    return '';
  }
};

const CtaButton = ({ title, onPress, loading, disabled }) => (
  <Button title={title} onPress={onPress} loading={loading} disabled={disabled} icon={null} style={authStyles.cta} iconRight={<ArrowRight size={22} color={colors.white} />} />
);

export const LoginScreen = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const appName = useAppSelector((s) => s.app.bootstrap?.branding?.appName);
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const cc = env.defaultCountryCode;

  const submit = async () => {
    if (phone.trim().length < 6 || loading) return;
    setError('');
    setLoading(true);
    try {
      const { data } = await authApi.sendOtp(phone.trim(), cc);
      navigate('/otp', { state: { phone: phone.trim(), e164: data.phone, length: data.length, resendInSec: data.resendInSec } });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={authStyles.page}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.lg }}>
        <AuthHero />
        <View style={authStyles.card}>
          <AppText style={styles.cardTitle}>
            {appName ? <>{t('auth.loginTo')} <AppText style={styles.cardTitle} color={colors.primary}>{appName}</AppText></> : t('auth.login')}
          </AppText>
          <AppText color={colors.textMuted} style={{ fontSize: 17, marginTop: spacing.xs, marginBottom: spacing.xl }}>{t('auth.enterMobile')}</AppText>

          <View style={[styles.phoneBox, !!error && { borderColor: colors.danger }]}>
            <Flag cc={cc} />
            <ChevronDown size={16} color={colors.textMuted} />
            <AppText variant="bodyStrong" style={{ fontSize: 18, marginLeft: spacing.sm }}>{dialOf(cc)}</AppText>
            <View style={styles.sep} />
            <TextInput
              value={phone}
              onChangeText={(v) => setPhone(v.replace(/[^\d\s]/g, ''))}
              placeholder={t('auth.phonePlaceholder')}
              placeholderTextColor={colors.textSubtle}
              keyboardType="phone-pad"
              maxLength={15}
              autoFocus
              onSubmitEditing={submit}
              style={styles.phoneInput}
            />
          </View>
          {!!error && <AppText variant="caption" color={colors.danger} style={{ marginTop: spacing.xs }}>{error}</AppText>}

          <View style={{ marginTop: spacing.xl }}>
            <CtaButton title={t('auth.next')} onPress={submit} loading={loading} disabled={phone.trim().length < 6} />
          </View>
          <Button title={t('auth.browseGuest')} variant="ghost" onPress={() => navigate('/')} style={{ marginTop: spacing.sm }} />
        </View>
        <HelpFooter />
      </ScrollView>
    </View>
  );
};

export const OtpScreen = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { state } = useLocation();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [wait, setWait] = useState(state?.resendInSec ?? 0);
  const [focused, setFocused] = useState(true);
  const input = useRef(null);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  if (!state) return <Navigate to="/login" replace />;
  const { phone, e164, length } = state;

  const verify = async (value) => {
    if (value.length !== length || loading) return;
    setError('');
    setLoading(true);
    try {
      const { data } = await authApi.verifyOtp(phone, env.defaultCountryCode, value);
      await saveTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      dispatch(signedIn(data.user));
      navigate(data.isNewUser ? '/profile-setup' : '/', { replace: true });
    } catch (e) {
      setCode('');
      setError(
        e instanceof ApiError && e.code === 'OTP_INVALID' && typeof e.details?.attemptsLeft === 'number'
          ? `${errorText(e)} · ${t('auth.attemptsLeft', { count: e.details.attemptsLeft })}`
          : errorText(e),
      );
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    try {
      const { data } = await authApi.sendOtp(phone, env.defaultCountryCode);
      setWait(data.resendInSec);
      setError('');
    } catch (e) {
      if (e instanceof ApiError && typeof e.details?.retryAfterSec === 'number') setWait(e.details.retryAfterSec);
      setError(errorText(e));
    }
  };

  const mmss = `${String(Math.floor(wait / 60)).padStart(2, '0')}:${String(wait % 60).padStart(2, '0')}`;
  const pretty = (() => {
    const dial = dialOf(env.defaultCountryCode);
    const rest = e164.startsWith(dial) ? e164.slice(dial.length) : e164;
    return rest.length === 10 ? `${dial} ${rest.slice(0, 5)} ${rest.slice(5)}` : e164;
  })();

  return (
    <View style={authStyles.page}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.lg }}>
        <Pressable accessibilityLabel={t('common.back')} onPress={() => navigate(-1)} style={{ position: 'absolute', top: spacing.lg, left: spacing.lg, zIndex: 3, padding: spacing.xs }}>
          <ArrowLeft size={26} color={colors.text} />
        </Pressable>
        <AuthHero compact />
        <View style={[authStyles.card, { alignItems: 'center' }]}>
          <AppText style={[styles.cardTitle, { textAlign: 'center' }]}>{t('auth.verifyTitle')}</AppText>
          <AppText color={colors.textMuted} style={{ fontSize: 17, marginTop: spacing.sm, textAlign: 'center' }}>{t('auth.sentTo', { count: length })}</AppText>
          <AppText variant="bodyStrong" style={{ fontSize: 18, marginTop: 2 }}>{pretty}</AppText>

          <Pressable onPress={() => input.current?.focus()} style={styles.boxes} accessibilityRole="none">
            {Array.from({ length }, (_, i) => {
              const active = focused && i === Math.min(code.length, length - 1);
              return (
                <View key={i} style={[styles.box, active && styles.boxActive, !!error && { borderColor: colors.danger }]}>
                  <AppText style={{ fontSize: 28, fontWeight: '600' }}>{code[i] ?? ''}</AppText>
                </View>
              );
            })}
            <TextInput
              ref={input}
              value={code}
              onChangeText={(v) => {
                const digits = v.replace(/\D/g, '').slice(0, length);
                setCode(digits);
                if (digits.length === length) verify(digits);
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={length}
              autoFocus
              style={styles.hiddenInput}
            />
          </Pressable>
          {!!error && <AppText variant="caption" color={colors.danger} style={{ marginTop: spacing.sm, textAlign: 'center' }}>{error}</AppText>}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, flexWrap: 'wrap', justifyContent: 'center' }}>
            <AppText color={colors.textMuted}>{t('auth.didntReceive')}</AppText>
            <Pressable onPress={wait > 0 ? undefined : resend} disabled={wait > 0}>
              <AppText variant="bodyStrong" color={colors.primary} style={{ textDecorationLine: 'underline', opacity: wait > 0 ? 0.85 : 1 }}>
                {t('auth.resendOtp')}{wait > 0 ? ` (${mmss})` : ''}
              </AppText>
            </Pressable>
          </View>

          <View style={{ marginTop: spacing.xl, alignSelf: 'stretch' }}>
            <CtaButton title={t('auth.verify')} onPress={() => verify(code)} loading={loading} disabled={code.length !== length} />
          </View>
        </View>
        <HelpFooter />
      </ScrollView>
    </View>
  );
};

export const ProfileSetupScreen = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const legal = useAppSelector((s) => s.app.bootstrap?.legal);
  const [name, setName] = useState('');
  const [age, setAge] = useState(false);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [loading, setLoading] = useState(false);

  const legalReady = Boolean(legal?.terms.version && legal?.privacy.version);
  const canSubmit = name.trim().length >= 2 && age && terms && privacy && legalReady;

  const [openPage, setOpenPage] = useState(null);
  const linkLabel = (label, slug) => (
    <AppText>
      {label}{' '}
      <AppText color={colors.primary} variant="bodyStrong" onPress={() => setOpenPage(slug)}>
        {t('profileSetup.read')}
      </AppText>
    </AppText>
  );

  const submit = async () => {
    setLoading(true);
    try {
      const consents = [
        { docType: 'terms', version: legal.terms.version },
        { docType: 'privacy', version: legal.privacy.version },
      ];
      if (marketing) consents.push({ docType: 'marketing', version: 1 });
      const { data } = await meApi.completeProfile({ name: name.trim(), language: i18n.language, ageConfirmed: true, consents });
      dispatch(meUpdated(data));
      navigate('/', { replace: true });
    } catch (e) {
      Alert.alert(errorText(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.fill}>
      <ScrollView contentContainerStyle={styles.pad}>
        <AppText variant="h1" style={{ marginBottom: spacing.xl }}>
          {t('profileSetup.title')}
        </AppText>
        <Field value={name} onChangeText={setName} placeholder={t('profileSetup.name')} maxLength={80} />
        <View style={{ marginTop: spacing.lg }}>
          <Checkbox checked={age} onChange={setAge} label={t('profileSetup.age')} />
          <Checkbox checked={terms} onChange={setTerms} label={linkLabel(t('profileSetup.terms'), 'terms')} />
          <Checkbox checked={privacy} onChange={setPrivacy} label={linkLabel(t('profileSetup.privacy'), 'privacy')} />
          <Checkbox checked={marketing} onChange={setMarketing} label={t('profileSetup.marketing')} />
        </View>
        {!legalReady && (
          <AppText color={colors.warning} variant="caption" style={{ marginTop: spacing.sm }}>
            {t('profileSetup.legalMissing')}
          </AppText>
        )}
        <Button title={t('profileSetup.submit')} onPress={submit} loading={loading} disabled={!canSubmit} style={{ marginTop: spacing.xl }} />
      </ScrollView>
      {openPage && <PageSheet slug={openPage} onClose={() => setOpenPage(null)} />}
    </View>
  );
};

const styles = StyleSheet.create({
  cardTitle: { fontSize: 30, lineHeight: 38, fontWeight: '800', color: colors.text },
  phoneBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, height: 64, paddingHorizontal: spacing.lg, borderRadius: 20, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.white, boxShadow: '0 4px 16px rgba(20,24,60,0.05)' },
  sep: { width: 1, height: 32, backgroundColor: colors.divider, marginHorizontal: spacing.md },
  phoneInput: { flex: 1, fontSize: 18, height: '100%', outline: 'none' },
  boxes: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl, position: 'relative', justifyContent: 'center' },
  box: { width: 64, height: 72, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  boxActive: { borderColor: colors.primary, borderWidth: 1.5 },
  hiddenInput: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, fontSize: 16 },
  fill: { flex: 1, backgroundColor: colors.white },
  pad: { padding: spacing.xl, paddingTop: spacing.xxxl },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xl },
});
