import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Ban, FileText, ShieldAlert } from 'lucide-react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, View } from '../components/primitives';
import { AppText, Button, Card, Field } from '../components/ui';
import { colors, radius, spacing } from '@theme/tokens';
import { authApi, meApi } from '../api/endpoints';
import { useAppDispatch, useAppSelector, meUpdated } from '../store';
import { kv } from '../services/storage';
import { formatDate } from '../utils/listing';
import { errorText } from '../i18n';
import { openPage } from '../services/dialogs';

const INTRO_KEY = 'intro.seen';

/** Intro slides were shown on this device for this version of them. */
export const introPending = (bootstrap) => Boolean(bootstrap?.onboarding?.slides?.length) && kv.getString(INTRO_KEY) !== String(bootstrap.versions?.onboarding ?? 1);

/** First-run slides from Admin › Settings › Intro Slides. Shown once per device (again only if the admin changes them). */
export const IntroScreen = ({ onDone }) => {
  const { t } = useTranslation();
  const bootstrap = useAppSelector((s) => s.app.bootstrap);
  const slides = bootstrap?.onboarding?.slides ?? [];
  const [i, setI] = useState(0);
  const finish = () => {
    kv.set(INTRO_KEY, String(bootstrap?.versions?.onboarding ?? 1));
    onDone();
  };
  const s = slides[i];
  if (!s) return null;
  const last = i === slides.length - 1;
  return (
    <View style={styles.fill}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: spacing.lg }}>
        {!last && <Button size="md" variant="ghost" title={t('intro.skip')} onPress={finish} />}
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.lg }}>
        {s.image?.url && <Image source={{ uri: s.image.url }} style={{ width: '100%', maxWidth: 360, height: 260 }} resizeMode="contain" />}
        <AppText variant="h1" style={{ textAlign: 'center' }}>{s.title}</AppText>
        {!!s.body && <AppText color={colors.textMuted} style={{ textAlign: 'center', maxWidth: 420 }}>{s.body}</AppText>}
      </View>
      <View style={{ padding: spacing.xl, gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.sm }}>
          {slides.map((_, j) => (
            <Pressable key={j} accessibilityLabel={`${j + 1}`} onPress={() => setI(j)} style={[styles.dot, j === i && styles.dotOn]} />
          ))}
        </View>
        <Button title={last ? t('intro.start') : t('intro.next')} onPress={() => (last ? finish() : setI(i + 1))} />
      </View>
    </View>
  );
};

/** The Terms or Privacy Policy changed since this user accepted them: they must accept the new version to continue. */
export const reconsentNeeded = (me, legal) =>
  Boolean(me?.profileCompleted && legal && ['terms', 'privacy'].some((d) => legal[d]?.version && (me.accepted?.[d] ?? 0) < legal[d].version));

export const ReConsentScreen = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const legal = useAppSelector((s) => s.app.bootstrap?.legal);
  const me = useAppSelector((s) => s.session.me);
  const [busy, setBusy] = useState(false);
  const changed = ['terms', 'privacy'].filter((d) => legal?.[d]?.version && (me?.accepted?.[d] ?? 0) < legal[d].version);
  const accept = async () => {
    setBusy(true);
    try {
      const { data } = await meApi.acceptConsents(changed.map((d) => ({ docType: d, version: legal[d].version })));
      dispatch(meUpdated(data));
    } catch (e) {
      Alert.alert(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={[styles.fill, { justifyContent: 'center' }]}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
        <FileText size={44} color={colors.primary} />
        <AppText variant="h1">{t('reconsent.title')}</AppText>
        <AppText color={colors.textMuted}>{t('reconsent.body')}</AppText>
        {changed.map((d) => (
          <Pressable key={d} onPress={() => openPage(d)} style={styles.docRow}>
            <AppText variant="bodyStrong" style={{ flex: 1 }}>{t(`reconsent.${d}`)}</AppText>
            <AppText color={colors.primary}>{t('reconsent.read')}</AppText>
          </Pressable>
        ))}
        <Button title={t('reconsent.accept')} loading={busy} onPress={accept} />
      </ScrollView>
    </View>
  );
};

/** Why the account is limited or suspended, until when, strikes, and an Appeal button. */
export const AccountStatusScreen = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const authed = useAppSelector((s) => s.session.status === 'authenticated');
  const [info, setInfo] = useState(null);
  useEffect(() => {
    if (authed) meApi.accountStatus().then(({ data }) => setInfo(data)).catch(() => setInfo({ status: 'active', strikes: [] }));
  }, [authed]);
  if (!authed) return <Navigate to="/login" replace />;
  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={t('common.back')} onPress={() => navigate(-1)}><ArrowLeft size={24} color={colors.text} /></Pressable>
        <AppText variant="h2">{t('accountStatus.title')}</AppText>
      </View>
      {!info ? (
        <View style={{ padding: spacing.xxl, alignItems: 'center' }}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <Card style={{ gap: spacing.sm, backgroundColor: info.status === 'active' ? colors.sellSoft : colors.warmSoft }}>
            <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
              <ShieldAlert size={22} color={info.status === 'active' ? colors.sell : colors.danger} />
              <AppText variant="h3">{t(`accountStatus.status_${info.status}`, { defaultValue: info.status })}</AppText>
            </View>
            {info.status !== 'active' && <AppText>{t(`accountStatus.effect_${info.status}`, { defaultValue: '' })}</AppText>}
            {!!info.reason && <AppText>{t('accountStatus.reason', { reason: info.reason })}</AppText>}
            {!!info.suspendedUntil && <AppText>{t('accountStatus.until', { date: new Date(info.suspendedUntil).toLocaleString(i18n.language) })}</AppText>}
          </Card>

          {info.strikes.length > 0 && (
            <View style={{ gap: spacing.sm }}>
              <AppText variant="h3">{t('accountStatus.strikes', { count: info.strikes.length })}</AppText>
              {info.strikes.map((s) => (
                <Card key={s.id} style={{ gap: spacing.xs }}>
                  <AppText variant="bodyStrong">{s.reason || t(`accountStatus.strike_${s.role}`)}</AppText>
                  <AppText variant="caption" color={colors.textMuted}>{t('accountStatus.strikeDates', { from: formatDate(s.createdAt, i18n.language), to: formatDate(s.expiresAt, i18n.language) })}</AppText>
                </Card>
              ))}
            </View>
          )}

          {info.appeal && <AppText color={colors.textMuted}>{t('accountStatus.appealFiled', { no: info.appeal.caseNo, status: t(`help.status_${info.appeal.status}`, { defaultValue: info.appeal.status }) })}</AppText>}
          {(info.status !== 'active' || info.strikes.length > 0) && (
            <Button title={t('accountStatus.appeal')} onPress={() => navigate('/help/new?type=appeal')} />
          )}
          <Button variant="outline" title={t('accountStatus.contact')} onPress={() => navigate('/help/new?type=support')} />
        </ScrollView>
      )}
    </View>
  );
};

/** Shown instead of logging in when the number belongs to a banned account. The pass from login allows one appeal. */
export const BannedScreen = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { state } = useLocation();
  const support = useAppSelector((s) => s.app.bootstrap?.branding);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [filed, setFiled] = useState(null);
  if (!state) return <Navigate to="/login" replace />;
  const send = async () => {
    setBusy(true);
    try {
      const { data } = await authApi.banAppeal(state.appealToken, text.trim());
      setFiled(data.caseNo);
    } catch (e) {
      if (e.code === 'APPEAL_OPEN') setFiled(e.details?.caseNo ?? '');
      else Alert.alert(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.fill}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, paddingTop: spacing.xxxl }}>
        <Ban size={48} color={colors.danger} />
        <AppText variant="h1">{t('accountStatus.bannedTitle')}</AppText>
        <AppText color={colors.textMuted}>{t('accountStatus.effect_banned')}</AppText>
        {!!state.reason && <Card><AppText>{t('accountStatus.reason', { reason: state.reason })}</AppText></Card>}
        {filed !== null ? (
          <Card style={{ backgroundColor: colors.sellSoft }}><AppText>{t('accountStatus.appealSent', { no: filed })}</AppText></Card>
        ) : (
          <View style={{ gap: spacing.sm }}>
            <AppText variant="h3">{t('accountStatus.appeal')}</AppText>
            <Field value={text} onChangeText={setText} multiline placeholder={t('accountStatus.appealHint')} style={{ minHeight: 120 }} />
            <Button title={t('accountStatus.sendAppeal')} loading={busy} disabled={text.trim().length < 20} onPress={send} />
          </View>
        )}
        {(support?.supportEmail || support?.supportPhone) && (
          <AppText variant="caption" color={colors.textMuted}>{t('accountStatus.supportAt', { contact: [support.supportEmail, support.supportPhone].filter(Boolean).join(' · ') })}</AppText>
        )}
        <Button variant="ghost" title={t('common.back')} onPress={() => navigate('/login', { replace: true })} />
      </ScrollView>
    </View>
  );
};

/** Thin bar on top of the tabs while the account is limited or suspended. */
export const AccountStatusBanner = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const status = useAppSelector((s) => s.session.me?.status);
  if (!['limited', 'suspended'].includes(status)) return null;
  return (
    <Pressable onPress={() => navigate('/account-status')} style={styles.banner}>
      <ShieldAlert size={18} color={colors.white} />
      <AppText variant="bodyStrong" color={colors.white} style={{ flex: 1 }}>{t(`accountStatus.banner_${status}`)}</AppText>
      <AppText variant="caption" color={colors.white}>{t('accountStatus.details')}</AppText>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.white, minHeight: '100dvh' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotOn: { width: 22, backgroundColor: colors.primary },
  docRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.danger, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
});
