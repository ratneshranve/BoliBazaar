import { useEffect, useState } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, View } from '../components/primitives';
import { PageSheet } from './PageScreen';
import { AppText, Button, Checkbox, Field } from '../components/ui';
import { colors, spacing } from '@theme/tokens';
import { authApi, meApi } from '../api/endpoints';
import { ApiError, saveTokens } from '../api/client';
import { errorText } from '../i18n';
import { env } from '../config/env';
import { useAppDispatch, useAppSelector, signedIn, meUpdated } from '../store';

export const LoginScreen = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    setLoading(true);
    try {
      const { data } = await authApi.sendOtp(phone.trim(), env.defaultCountryCode);
      navigate('/otp', { state: { phone: phone.trim(), e164: data.phone, length: data.length, resendInSec: data.resendInSec } });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.fill}>
      <ScrollView contentContainerStyle={styles.pad}>
        <AppText variant="h1">{t('auth.loginTitle')}</AppText>
        <AppText color={colors.textMuted} style={{ marginTop: spacing.xs, marginBottom: spacing.xl }}>
          {t('auth.loginSubtitle')}
        </AppText>
        <Field value={phone} onChangeText={setPhone} placeholder={t('auth.phonePlaceholder')} keyboardType="phone-pad" maxLength={15} error={error} onSubmitEditing={submit} autoFocus />
        <Button title={t('auth.sendOtp')} onPress={submit} loading={loading} disabled={phone.trim().length < 6} style={{ marginTop: spacing.lg }} />
        <Button title={t('auth.browseGuest')} variant="ghost" onPress={() => navigate('/')} style={{ marginTop: spacing.sm }} />
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

  useEffect(() => {
    if (wait <= 0) return undefined;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  if (!state) return <Navigate to="/login" replace />;
  const { phone, e164, length } = state;

  const verify = async (value) => {
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

  return (
    <View style={styles.fill}>
      <ScrollView contentContainerStyle={styles.pad}>
        <AppText variant="h1">{t('auth.otpTitle')}</AppText>
        <AppText color={colors.textMuted} style={{ marginTop: spacing.xs, marginBottom: spacing.xl }}>
          {t('auth.otpSubtitle', { phone: e164 })}
        </AppText>
        <Field
          value={code}
          onChangeText={(v) => {
            const digits = v.replace(/\D/g, '').slice(0, length);
            setCode(digits);
            if (digits.length === length) verify(digits);
          }}
          keyboardType="number-pad"
          autoComplete="sms-otp"
          maxLength={length}
          autoFocus
          style={{ letterSpacing: 8, fontSize: 22, textAlign: 'center' }}
          error={error}
        />
        <Button title={t('auth.verify')} onPress={() => verify(code)} loading={loading} disabled={code.length !== length} style={{ marginTop: spacing.lg }} />
        <View style={styles.row}>
          <Pressable onPress={() => navigate(-1)}>
            <AppText color={colors.primary} variant="bodyStrong">
              {t('auth.changeNumber')}
            </AppText>
          </Pressable>
          {wait > 0 ? (
            <AppText color={colors.textMuted}>{t('auth.resendIn', { sec: wait })}</AppText>
          ) : (
            <Pressable onPress={resend}>
              <AppText color={colors.primary} variant="bodyStrong">
                {t('auth.resend')}
              </AppText>
            </Pressable>
          )}
        </View>
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
  fill: { flex: 1, backgroundColor: colors.white },
  pad: { padding: spacing.xl, paddingTop: spacing.xxxl },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xl },
});
