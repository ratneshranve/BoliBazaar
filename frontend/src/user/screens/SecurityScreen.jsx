import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CheckCircle2, Mail, Phone, Smartphone } from 'lucide-react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Switch, View } from '../components/primitives';
import { AppText, Button, Card, Field } from '../components/ui';
import { colors, radius, spacing } from '@theme/tokens';
import { meApi } from '../api/endpoints';
import { errorText } from '../i18n';
import { meUpdated, useAppDispatch, useAppSelector } from '../store';

/** Optional email: enter address → a code is emailed → enter code → saved as verified. Never used for login. */
const EmailCard = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const saved = useAppSelector((s) => s.session.me?.email);
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      Alert.alert(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const send = (address) =>
    run(async () => {
      const { data } = await meApi.sendEmailCode(address);
      setSentTo(data.email);
      setCode('');
    });
  const verify = () =>
    run(async () => {
      dispatch(meUpdated((await meApi.verifyEmail(sentTo, code.trim())).data));
      setEditing(false);
      setSentTo(null);
      setEmail('');
    });
  const remove = () => {
    if (!window.confirm(t('security.removeEmailConfirm'))) return;
    run(async () => dispatch(meUpdated((await meApi.removeEmail()).data)));
  };
  const cancel = () => {
    setEditing(false);
    setSentTo(null);
  };

  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={styles.titleRow}>
        <Mail size={20} color={colors.text} />
        <AppText variant="bodyStrong">{t('security.email')}</AppText>
      </View>
      <AppText variant="caption" color={colors.textMuted}>{t('security.emailHelp')}</AppText>
      {saved && !editing && !sentTo ? (
        <View style={styles.titleRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText numberOfLines={1}>{saved.address}</AppText>
            {saved.verified && (
              <View style={styles.titleRow}>
                <CheckCircle2 size={14} color={colors.verified} />
                <AppText variant="small" color={colors.verified}>{t('security.emailVerified')}</AppText>
              </View>
            )}
          </View>
          <Button size="md" variant="outline" title={t('security.changeEmail')} onPress={() => setEditing(true)} />
          <Button size="md" variant="ghost" title={t('security.removeEmail')} loading={busy} onPress={remove} />
        </View>
      ) : sentTo ? (
        <View style={{ gap: spacing.sm }}>
          <AppText variant="caption">{t('security.codeSent', { email: sentTo })}</AppText>
          <Field value={code} onChangeText={setCode} placeholder={t('security.codePlaceholder')} keyboardType="number-pad" maxLength={8} autoComplete="one-time-code" />
          <View style={styles.titleRow}>
            <Button size="md" title={t('security.verify')} loading={busy} disabled={code.trim().length < 4} onPress={verify} />
            <Button size="md" variant="ghost" title={t('security.sendCode')} disabled={busy} onPress={() => send(sentTo)} />
            <Button size="md" variant="ghost" title={t('common.cancel')} onPress={cancel} />
          </View>
        </View>
      ) : (
        <View style={{ gap: spacing.sm }}>
          <Field value={email} onChangeText={setEmail} placeholder={t('security.emailPlaceholder')} keyboardType="email-address" autoComplete="email" maxLength={120} />
          <View style={styles.titleRow}>
            <Button size="md" title={t('security.sendCode')} loading={busy} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())} onPress={() => send(email.trim())} />
            {saved && <Button size="md" variant="ghost" title={t('common.cancel')} onPress={cancel} />}
          </View>
        </View>
      )}
    </Card>
  );
};

const SHOW_PHONE = ['never', 'verified_users', 'everyone'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Who may reveal the phone number from an ad, the WhatsApp button and calling hours. */
const PhonePrivacyCard = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const p = useAppSelector((s) => s.session.me?.privacy) || {};
  const [from, setFrom] = useState(p.callHours?.from || '');
  const [to, setTo] = useState(p.callHours?.to || '');

  const save = async (body) => {
    try {
      dispatch(meUpdated((await meApi.setPrivacy(body)).data));
    } catch (e) {
      Alert.alert(errorText(e));
    }
  };
  const hoursValid = (!from && !to) || (HHMM.test(from) && HHMM.test(to));
  const showPhone = p.showPhone || 'never';

  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={styles.titleRow}>
        <Phone size={20} color={colors.text} />
        <AppText variant="bodyStrong">{t('security.phonePrivacy')}</AppText>
      </View>
      <AppText variant="caption" color={colors.textMuted}>{t('security.phoneHelp')}</AppText>
      <View style={styles.chips}>
        {SHOW_PHONE.map((v) => (
          <Pressable key={v} onPress={() => save({ showPhone: v })} style={[styles.chip, showPhone === v && styles.chipOn]}>
            <AppText variant="caption" color={showPhone === v ? colors.white : colors.text}>{t(`security.showPhone_${v}`)}</AppText>
          </Pressable>
        ))}
      </View>
      {showPhone !== 'never' && (
        <>
          <View style={styles.titleRow}>
            <AppText style={{ flex: 1 }}>{t('security.allowWhatsApp')}</AppText>
            <Switch activeColor={colors.primary} value={Boolean(p.allowWhatsApp)} onValueChange={(on) => save({ allowWhatsApp: on })} />
          </View>
          <AppText variant="caption">{t('security.callHours')} · {p.callHours?.from ? `${p.callHours.from}–${p.callHours.to}` : t('security.callHoursAny')}</AppText>
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}><Field value={from} onChangeText={setFrom} placeholder={`${t('security.callFrom')} 09:00`} maxLength={5} /></View>
            <View style={{ flex: 1 }}><Field value={to} onChangeText={setTo} placeholder={`${t('security.callTo')} 20:00`} maxLength={5} /></View>
            <Button size="md" variant="outline" title={t('security.save')} disabled={!hoursValid} onPress={() => save({ callHours: from && to ? { from, to } : null })} />
          </View>
        </>
      )}
    </Card>
  );
};

export const SecurityScreen = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);

  const load = useCallback(async () => {
    try {
      setItems((await meApi.sessions()).data);
    } catch (e) {
      Alert.alert(errorText(e));
      setItems([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn) => {
    try {
      await fn();
      load();
    } catch (e) {
      Alert.alert(errorText(e));
    }
  };

  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={t('common.back')} onPress={() => navigate(-1)}>
          <ArrowLeft size={24} color={colors.text} />
        </Pressable>
        <AppText variant="h3">{t('security.title')}</AppText>
      </View>
      {!items ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          ListHeaderComponent={
            <View style={{ gap: spacing.md }}>
              <EmailCard />
              <PhonePrivacyCard />
              <AppText variant="h3" style={{ marginTop: spacing.sm }}>{t('security.sessions')}</AppText>
            </View>
          }
          renderItem={({ item }) => (
            <Card style={styles.row}>
              <Smartphone size={24} color={colors.text} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {item.deviceName || item.platform}
                </AppText>
                <AppText variant="caption" color={colors.textMuted}>
                  {item.current ? t('security.thisDevice') : t('security.lastActive', { time: item.lastUsedAt ? new Date(item.lastUsedAt).toLocaleString(i18n.language) : '' })}
                </AppText>
              </View>
              {!item.current && <Button title={t('security.logoutDevice')} variant="outline" size="md" onPress={() => run(() => meApi.revokeSession(item.id))} />}
            </Card>
          )}
          ListFooterComponent={
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {items.length > 1 && <Button title={t('security.logoutOthers')} variant="outline" onPress={() => run(() => meApi.revokeOtherSessions())} />}
              <Button title={t('account.title')} variant="ghost" onPress={() => navigate('/account')} />
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.divider },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
});
