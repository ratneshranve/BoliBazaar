import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ChevronDown, ChevronLeft } from 'lucide-react';
import { getCountryCallingCode } from 'libphonenumber-js';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from '../components/primitives';
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
const Flag = ({ cc }) => <Image source={{ uri: `https://flagcdn.com/w40/${cc.toLowerCase()}.png` }} style={{ width: 24, height: 16, borderRadius: 2 }} resizeMode="cover" />;
const dialOf = (cc) => {
  try {
    return `+${getCountryCallingCode(cc)}`;
  } catch {
    return '';
  }
};

const CtaButton = ({ title, onPress, loading, disabled }) => (
  <Pressable
    accessibilityRole="button"
    onPress={disabled || loading ? undefined : onPress}
    disabled={disabled || loading}
    style={({ pressed }) => [
      authStyles.cta,
      disabled ? { backgroundColor: '#A61B36', opacity: 0.88 } : { backgroundColor: '#A61B36' },
      pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] },
    ]}
  >
    {loading ? (
      <ActivityIndicator color="#FFFFFF" />
    ) : (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        <AppText style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>{title}</AppText>
        <ArrowRight size={18} color="#FFFFFF" style={{ marginLeft: 8 }} />
      </View>
    )}
  </Pressable>
);

export const LoginScreen = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
      <AuthHero />
      <View style={authStyles.card}>
        <Text style={styles.cardTitle}>
          Login to <Text style={styles.titleBoli}>Boli</Text><Text style={styles.titleBazaar}>bazaar</Text>
        </Text>
        <AppText style={styles.cardSubtitle}>{t('auth.enterMobile') || 'Enter your mobile number to continue'}</AppText>

        <View style={[styles.phoneBox, !!error && { borderColor: '#ef4444' }]}>
          <Flag cc={cc} />
          <ChevronDown size={14} color="#64748B" style={{ marginLeft: 6 }} />
          <Text style={styles.dialCode}>{dialOf(cc)}</Text>
          <View style={styles.sep} />
          <TextInput
            value={phone}
            onChangeText={(v) => setPhone(v.replace(/[^\d\s]/g, ''))}
            placeholder={t('auth.phonePlaceholder') || 'Enter mobile number'}
            placeholderTextColor="#94A3B8"
            keyboardType="phone-pad"
            maxLength={15}
            autoFocus
            onSubmitEditing={submit}
            style={styles.phoneInput}
          />
        </View>
        {!!error && <AppText variant="caption" color={colors.danger} style={{ marginTop: 4 }}>{error}</AppText>}

        <View style={{ marginTop: 18 }}>
          <CtaButton title={t('auth.next') || 'Next'} onPress={submit} loading={loading} disabled={phone.trim().length < 6} />
        </View>
      </View>
      <HelpFooter />
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
  const otpLength = length || 4;

  const verify = async (value) => {
    if (value.length !== otpLength || loading) return;
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
      <Pressable accessibilityLabel={t('common.back')} onPress={() => navigate(-1)} style={styles.backBtn}>
        <ChevronLeft size={24} color="#0F172A" strokeWidth={2.2} />
      </Pressable>
      <AuthHero />
      <View style={authStyles.card}>
        <AppText style={styles.otpTitle}>Verify Your Number</AppText>
        <AppText style={styles.otpSubtitle}>We have sent a {otpLength}-digit OTP to</AppText>
        <AppText style={styles.otpPhone}>{pretty}</AppText>

        <Pressable onPress={() => input.current?.focus()} style={styles.boxes} accessibilityRole="none">
          {Array.from({ length: otpLength }, (_, i) => {
            const isFocusedBox = focused && i === Math.min(code.length, otpLength - 1);
            const hasChar = Boolean(code[i]);
            return (
              <View
                key={i}
                style={[
                  styles.box,
                  isFocusedBox && styles.boxActive,
                  !!error && { borderColor: '#ef4444' },
                ]}
              >
                <AppText style={styles.boxText}>{code[i] ?? ''}</AppText>
                {isFocusedBox && !hasChar && <View style={styles.cursor} />}
              </View>
            );
          })}
          <TextInput
            ref={input}
            value={code}
            onChangeText={(v) => {
              const digits = v.replace(/\D/g, '').slice(0, otpLength);
              setCode(digits);
              if (digits.length === otpLength) verify(digits);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={otpLength}
            autoFocus
            style={styles.hiddenInput}
          />
        </Pressable>
        {!!error && <AppText variant="caption" color={colors.danger} style={{ marginTop: 6, textAlign: 'center' }}>{error}</AppText>}

        <View style={styles.resendRow}>
          <AppText style={styles.resendText}>Didn’t receive OTP? </AppText>
          <Pressable onPress={wait > 0 ? undefined : resend} disabled={wait > 0}>
            <AppText style={styles.resendLink}>
              Resend OTP{wait > 0 ? ` (${mmss})` : ''}
            </AppText>
          </Pressable>
        </View>

        <View style={{ marginTop: 16 }}>
          <CtaButton title={t('auth.verify') || 'Verify'} onPress={() => verify(code)} loading={loading} disabled={code.length !== otpLength} />
        </View>
      </View>
      <HelpFooter />
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
  cardTitle: { fontSize: 26, lineHeight: 32, fontWeight: '700', color: '#0F172A' },
  titleBoli: { fontSize: 26, lineHeight: 32, fontWeight: '700', color: '#A61B36', display: 'inline' },
  titleBazaar: { fontSize: 26, lineHeight: 32, fontWeight: '700', color: '#1E3A8A', display: 'inline' },
  cardSubtitle: { fontSize: 14, color: '#64748B', marginTop: 4, marginBottom: 18 },

  phoneBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  dialCode: { fontSize: 15, fontWeight: '600', color: '#0F172A', marginLeft: 8 },
  sep: { width: 1, height: 22, backgroundColor: '#E2E8F0', marginHorizontal: 10 },
  phoneInput: { flex: 1, fontSize: 15, height: '100%', outline: 'none', color: '#0F172A' },

  backBtn: {
    position: 'absolute',
    top: 14,
    left: 14,
    zIndex: 10,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  otpTitle: { fontSize: 24, lineHeight: 30, fontWeight: '700', color: '#0F172A', textAlign: 'center' },
  otpSubtitle: { fontSize: 14, color: '#64748B', marginTop: 4, textAlign: 'center' },
  otpPhone: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginTop: 2, textAlign: 'center' },

  boxes: { flexDirection: 'row', gap: 12, marginTop: 18, position: 'relative', justifyContent: 'center' },
  box: {
    width: 52,
    height: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    position: 'relative',
  },
  boxActive: { borderColor: '#A61B36', borderWidth: 1.5 },
  boxText: { fontSize: 22, fontWeight: '700', color: '#0F172A' },
  cursor: { width: 1.5, height: 22, backgroundColor: '#0F172A', position: 'absolute' },
  hiddenInput: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, fontSize: 16 },

  resendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  resendText: { fontSize: 13, color: '#64748B' },
  resendLink: { fontSize: 13, fontWeight: '600', color: '#A61B36', textDecorationLine: 'underline' },

  fill: { flex: 1, backgroundColor: colors.white },
  pad: { padding: spacing.xl, paddingTop: spacing.xxxl },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xl },
});
