import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, BellRing, CalendarClock, Check, ClipboardCheck, MapPin, UserCheck, X } from 'lucide-react';
import { Alert, Pressable, StyleSheet, View } from './primitives';
import { AppText, Button, Card, Checkbox } from './ui';
import { colors, radius, spacing } from '@theme/tokens';
import { auctionsApi } from '../api/endpoints';
import { useAppSelector } from '../store';
import { formatMinor } from '../utils/auction';
import { errorText } from '../i18n';
import { confirmAsync, openPage, promptAsync } from '../services/dialogs';

const when = (iso, lang) => new Date(iso).toLocaleString(lang, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Watch / Remind me: the user hears when it starts and before it ends. */
export const WatchButton = ({ a, onChange }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const authed = useAppSelector((s) => s.session.status === 'authenticated');
  const [busy, setBusy] = useState(false);
  if (a.isSeller || !['scheduled', 'live', 'suspended'].includes(a.status)) {
    return a.watchers > 0 ? <AppText variant="caption" color={colors.textMuted}>{t('auction.watchers', { count: a.watchers })}</AppText> : null;
  }
  const toggle = async () => {
    if (!authed) return navigate('/login');
    setBusy(true);
    try {
      const { data } = a.watching ? await auctionsApi.unwatch(a.id) : await auctionsApi.watch(a.id);
      onChange(data);
    } catch (e) {
      Alert.alert(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const label = a.watching ? t('auction.watching') : a.status === 'scheduled' ? t('auction.remindMe') : t('auction.watch');
  return (
    <Pressable onPress={toggle} disabled={busy} style={[styles.watch, a.watching && { backgroundColor: colors.auction, borderColor: colors.auction }]}>
      {a.watching ? <BellRing size={16} color={colors.white} /> : <Bell size={16} color={colors.auction} />}
      <AppText variant="bodyStrong" color={a.watching ? colors.white : colors.auction}>{label}</AppText>
      {a.watchers > 0 && <AppText variant="caption" color={a.watching ? colors.white : colors.textMuted}>· {a.watchers}</AppText>}
    </Pressable>
  );
};

/** For a bidder on an auction that needs registration: status, terms, fee, Register. */
export const RegistrationBox = ({ a, onChange }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const authed = useAppSelector((s) => s.session.status === 'authenticated');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const r = a.registration;
  if (!r?.required || a.isSeller) return null;
  const mine = r.mine;
  const fee = r.feeMinor > 0 ? formatMinor(r.feeMinor, a.currency, a.factor, i18n.language) : null;
  const open = ['scheduled', 'live'].includes(a.status);

  const go = async () => {
    if (!authed) return navigate('/login');
    setBusy(true);
    try {
      const { data } = await auctionsApi.register(a.id, true);
      if (data.payment) return navigate(`/pay?purpose=participation_fee&refId=${data.payment.refId}&next=${encodeURIComponent(`/auctions/${a.id}`)}`);
      onChange();
    } catch (e) {
      Alert.alert(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const withdraw = async () => {
    if (!(await confirmAsync(t('auction.regWithdrawConfirm')))) return;
    try {
      await auctionsApi.withdrawRegistration(a.id);
      onChange();
    } catch (e) {
      Alert.alert(errorText(e));
    }
  };

  if (mine?.status === 'approved') {
    return (
      <View style={[styles.banner, { backgroundColor: colors.sellSoft }]}>
        <UserCheck size={18} color={colors.sell} />
        <AppText variant="bodyStrong" style={{ flex: 1 }}>{t('auction.regApproved')}</AppText>
      </View>
    );
  }
  return (
    <Card style={{ gap: spacing.sm, borderColor: colors.auction }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <ClipboardCheck size={20} color={colors.auction} />
        <AppText variant="bodyStrong" style={{ flex: 1 }}>{t('auction.regTitle')}</AppText>
      </View>
      <AppText variant="caption" color={colors.textMuted}>
        {r.approval === 'manual' ? t('auction.regManual') : t('auction.regAuto')}
        {fee ? ` ${t('auction.regFee', { amount: fee })}` : ''}
      </AppText>
      {mine?.status === 'pending' && <AppText variant="bodyStrong" color={colors.warning}>{t('auction.regPending')}</AppText>}
      {mine?.status === 'rejected' && <AppText variant="bodyStrong" color={colors.danger}>{t('auction.regRejected', { reason: mine.reason || '—' })}</AppText>}
      {mine?.status === 'awaiting_payment' && (
        <>
          <AppText color={colors.warning}>{t('auction.regAwaitingPayment')}</AppText>
          <Button size="md" title={t('auction.regPay', { amount: fee })} onPress={() => navigate(`/pay?purpose=participation_fee&refId=${mine.id}&next=${encodeURIComponent(`/auctions/${a.id}`)}`)} style={{ backgroundColor: colors.auction }} />
        </>
      )}
      {open && (!mine || mine.status === 'withdrawn') && (
        <>
          <Checkbox checked={agree} onChange={setAgree} label={
            <AppText variant="caption">
              {t('auction.regAccept')}{' '}
              <AppText variant="caption" color={colors.primary} onPress={() => openPage('auctions-guide')}>{t('auction.regRules')}</AppText>
            </AppText>
          } />
          <Button title={fee ? t('auction.regButtonFee', { amount: fee }) : t('auction.regButton')} loading={busy} disabled={!agree} onPress={go} style={{ backgroundColor: colors.auction }} />
        </>
      )}
      {['pending', 'awaiting_payment'].includes(mine?.status) && <Button size="md" variant="ghost" title={t('auction.regWithdraw')} onPress={withdraw} />}
      {!open && !mine && <AppText color={colors.textMuted}>{t('auction.regClosed')}</AppText>}
    </Card>
  );
};

/** Where and when the item can be seen. Locked until the viewer may see it. */
export const InspectionCard = ({ a }) => {
  const { t, i18n } = useTranslation();
  const ins = a.inspection;
  if (!ins) return null;
  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <CalendarClock size={20} color={colors.auction} />
        <AppText variant="bodyStrong" style={{ flex: 1 }}>{t('auction.inspection')}</AppText>
      </View>
      {ins.locked ? (
        <AppText variant="caption" color={colors.textMuted}>{a.registration?.required ? t('auction.inspectionLockedReg', { count: ins.slotCount }) : t('auction.inspectionLockedLogin')}</AppText>
      ) : (
        <>
          {!!ins.address && (
            <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' }}>
              <MapPin size={16} color={colors.textMuted} style={{ marginTop: 2 }} />
              <AppText style={{ flex: 1 }}>{ins.address}</AppText>
            </View>
          )}
          {ins.slots.map((s, i) => (
            <AppText key={i} variant="caption">• {when(s.from, i18n.language)} – {new Date(s.to).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}</AppText>
          ))}
          {!!ins.note && <AppText variant="caption" color={colors.textMuted}>{ins.note}</AppText>}
        </>
      )}
    </Card>
  );
};

/** Seller: people asking to bid, with approve / reject. */
export const SellerRegistrations = ({ a, onChange }) => {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState(null);
  const load = () => auctionsApi.registrations(a.id).then(({ data }) => setItems(data)).catch(() => setItems([]));
  useEffect(() => {
    if (a.isSeller && a.registration?.required) load();
  }, [a.id, a.registration?.waitingCount]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!a.isSeller || !a.registration?.required) return null;
  const decide = async (r, action) => {
    const reason = action === 'reject' ? await promptAsync(t('auction.regRejectReason')) : undefined;
    if (action === 'reject' && !reason?.trim()) return;
    try {
      await auctionsApi.decideRegistration(r.id, action, reason?.trim());
      load();
      onChange();
    } catch (e) {
      Alert.alert(errorText(e));
    }
  };
  return (
    <Card style={{ gap: spacing.sm }}>
      <AppText variant="bodyStrong">{t('auction.regListTitle', { count: items?.length ?? 0 })}</AppText>
      <AppText variant="caption" color={colors.textMuted}>{a.registration.approval === 'manual' ? t('auction.regManualSeller') : t('auction.regAutoSeller')}</AppText>
      {items?.length === 0 && <AppText color={colors.textMuted}>{t('auction.regNone')}</AppText>}
      {items?.map((r) => (
        <View key={r.id} style={styles.regRow}>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">{r.user?.name || '—'}</AppText>
            <AppText variant="small" color={colors.textMuted}>
              {[r.user?.phoneVerified && t('auction.regPhone'), r.user?.idVerified && t('verify.idBadge'), r.user?.businessVerified && t('verify.businessBadge')].filter(Boolean).join(' · ') || t('auction.regNoBadges')}
              {r.user?.memberSince ? ` · ${t('auction.regSince', { date: new Date(r.user.memberSince).toLocaleDateString(i18n.language, { month: 'short', year: 'numeric' }) })}` : ''}
            </AppText>
            <AppText variant="small" color={r.status === 'approved' ? colors.sell : r.status === 'rejected' ? colors.danger : colors.warning}>{t(`auction.regStatus_${r.status}`)}</AppText>
          </View>
          {r.status === 'pending' && (
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              <Pressable accessibilityLabel={t('auction.regApprove')} onPress={() => decide(r, 'approve')} style={[styles.round, { backgroundColor: colors.sell }]}><Check size={16} color={colors.white} /></Pressable>
              <Pressable accessibilityLabel={t('auction.regReject')} onPress={() => decide(r, 'reject')} style={[styles.round, { backgroundColor: colors.danger }]}><X size={16} color={colors.white} /></Pressable>
            </View>
          )}
        </View>
      ))}
    </Card>
  );
};

const styles = StyleSheet.create({
  watch: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.auction },
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: 12 },
  regRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  round: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
