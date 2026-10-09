import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, BadgeCheck, Building2, ChevronRight, Download, FileText, Flag, Headphones, LifeBuoy, ShieldAlert, ShieldCheck, Trash2, UserCheck } from 'lucide-react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from '../components/primitives';
import { AppText, Button, Card, EmptyState } from '../components/ui';
import { colors, radius, spacing } from '@theme/tokens';
import { trustApi, uploadsApi } from '../api/endpoints';
import { useAppDispatch, useAppSelector, logoutThunk } from '../store';
import { formatDate } from '../utils/listing';
import { errorText } from '../i18n';

const Header = ({ title }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <View style={styles.header}>
      <Pressable accessibilityLabel={t('common.back')} onPress={() => navigate(-1)}><ArrowLeft size={24} color={colors.text} /></Pressable>
      <AppText variant="h3" style={{ flex: 1 }}>{title}</AppText>
    </View>
  );
};

const useLoggedIn = () => {
  const navigate = useNavigate();
  const status = useAppSelector((s) => s.session.status);
  useEffect(() => {
    if (status === 'guest') navigate('/login', { replace: true });
  }, [status, navigate]);
  return status === 'authenticated';
};

const Row = ({ icon, title, sub, onPress }) => (
  <Pressable onPress={onPress} style={styles.menuRow}>
    <View style={styles.menuIcon}>{icon}</View>
    <View style={{ flex: 1 }}>
      <AppText variant="bodyStrong">{title}</AppText>
      {!!sub && <AppText variant="caption" color={colors.textMuted}>{sub}</AppText>}
    </View>
    <ChevronRight size={20} color={colors.textMuted} />
  </Pressable>
);

const CASE_TONE = { open: colors.warning, in_progress: colors.auctionBlue, waiting_user: colors.primary, resolved: colors.sell, closed: colors.textMuted };

/* ───────── Help Centre ───────── */

export const HelpScreen = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const authed = useAppSelector((s) => s.session.status === 'authenticated');
  const officer = useAppSelector((s) => s.app.bootstrap?.grievanceOfficer);
  const [cases, setCases] = useState(null);

  useEffect(() => {
    if (authed) trustApi.cases().then(({ data }) => setCases(data)).catch(() => setCases([]));
  }, [authed]);

  return (
    <View style={styles.fill}>
      <Header title={t('help.title')} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}>
        <Card style={{ padding: 0 }}>
          <Row icon={<Headphones size={22} color={colors.text} />} title={t('help.faq')} onPress={() => navigate('/page/support')} />
          <Row icon={<ShieldCheck size={22} color={colors.text} />} title={t('help.safety')} onPress={() => navigate('/page/safety')} />
          <Row icon={<ShieldAlert size={22} color={colors.text} />} title={t('help.prohibited')} onPress={() => navigate('/page/prohibited')} />
          <Row icon={<FileText size={22} color={colors.text} />} title={t('help.terms')} onPress={() => navigate('/page/terms')} />
          {authed && <Row icon={<Flag size={22} color={colors.text} />} title={t('help.myReports')} onPress={() => navigate('/reports')} />}
        </Card>

        {authed && (
          <>
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
              <Button size="md" title={t('help.contact')} icon={<LifeBuoy size={16} color={colors.white} />} onPress={() => navigate('/help/new?type=support')} />
              <Button size="md" variant="outline" title={t('help.reportFraud')} onPress={() => navigate('/help/new?type=fraud')} />
              <Button size="md" variant="outline" title={t('help.grievance')} onPress={() => navigate('/help/new?type=grievance')} />
            </View>
            <AppText variant="h3">{t('help.myCases')}</AppText>
            {!cases && <ActivityIndicator color={colors.primary} />}
            {cases?.length === 0 && <AppText color={colors.textMuted}>{t('help.noCases')}</AppText>}
            {cases?.map((c) => (
              <Pressable key={c.id} onPress={() => navigate(`/help/cases/${c.id}`)} style={styles.row}>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="bodyStrong" numberOfLines={1}>{c.subject}</AppText>
                  <AppText variant="small" color={colors.textMuted}>{c.caseNo} · {t(`help.type_${c.type}`)} · {formatDate(c.updatedAt, i18n.language)}</AppText>
                  <AppText variant="small" color={CASE_TONE[c.status]}>{c.awaitingYou ? t('help.awaitingYou') : t(`help.status_${c.status}`)}</AppText>
                </View>
                <ChevronRight size={18} color={colors.textMuted} />
              </Pressable>
            ))}
          </>
        )}

        {officer?.name && (
          <Card style={{ gap: 2 }}>
            <AppText variant="bodyStrong">{t('help.officer')}</AppText>
            <AppText>{officer.name}</AppText>
            {!!officer.email && <AppText color={colors.textMuted}>{officer.email}</AppText>}
            {!!officer.phone && <AppText color={colors.textMuted}>{officer.phone}</AppText>}
            {!!officer.address && <AppText variant="caption" color={colors.textMuted}>{officer.address}</AppText>}
          </Card>
        )}
      </ScrollView>
    </View>
  );
};

/* ───────── new case ───────── */

export const NewCaseScreen = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const authed = useLoggedIn();
  const [type, setType] = useState(params.get('type') || 'support');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const related = Object.fromEntries(['listingId', 'auctionId', 'dealId', 'paymentId', 'userId'].filter((k) => params.get(k)).map((k) => [k, params.get(k)]));

  const send = async () => {
    setBusy(true);
    try {
      const { data } = await trustApi.newCase({ type, subject: subject.trim(), message: message.trim(), related, ...(type === 'fraud' && amount ? { amountLost: Number(amount) } : {}) });
      navigate(`/help/cases/${data.id}`, { replace: true });
    } catch (e) {
      Alert.alert(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (!authed) return null;
  return (
    <View style={styles.fill}>
      <Header title={t('help.newCase')} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {['support', 'fraud', 'grievance', 'appeal'].map((k) => (
            <Pressable key={k} onPress={() => setType(k)} style={[styles.chip, type === k && styles.chipOn]}>
              <AppText variant="bodyStrong" color={type === k ? colors.white : colors.text}>{t(`help.type_${k}`)}</AppText>
            </Pressable>
          ))}
        </View>
        <AppText variant="caption" color={colors.textMuted}>{t(`help.typeHint_${type}`)}</AppText>
        <TextInput value={subject} onChangeText={setSubject} maxLength={140} placeholder={t('help.subject')} style={styles.input} />
        <TextInput value={message} onChangeText={setMessage} multiline maxLength={4000} placeholder={t('help.message')} style={[styles.input, { minHeight: 140 }]} />
        {type === 'fraud' && <TextInput value={amount} onChangeText={(v) => setAmount(v.replace(/[^\d]/g, ''))} keyboardType="number-pad" placeholder={t('help.amountLost')} style={styles.input} />}
        <Button title={t('help.send')} loading={busy} disabled={subject.trim().length < 5 || message.trim().length < 10} onPress={send} />
      </ScrollView>
    </View>
  );
};

/* ───────── one case ───────── */

export const CaseScreen = () => {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const authed = useLoggedIn();
  const [c, setC] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const bottom = useRef(null);

  const load = useCallback(() => trustApi.getCase(id).then(({ data }) => setC(data)).catch((e) => Alert.alert(errorText(e))), [id]);
  useEffect(() => {
    if (authed) load();
  }, [authed, load]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [c?.messages.length]);

  const reply = async () => {
    setBusy(true);
    try {
      const { data } = await trustApi.replyCase(id, text.trim());
      setC(data);
      setText('');
    } catch (e) {
      Alert.alert(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const close = async () => {
    if (!window.confirm(t('help.confirmClose'))) return;
    try {
      setC((await trustApi.closeCase(id)).data);
    } catch (e) {
      Alert.alert(errorText(e));
    }
  };

  if (!c) return <View style={[styles.fill, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={colors.primary} /></View>;
  return (
    <View style={styles.fill}>
      <Header title={c.subject} />
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: 2 }}>
        <AppText variant="small" color={colors.textMuted}>{c.caseNo} · {t(`help.type_${c.type}`)}</AppText>
        <AppText variant="caption" color={CASE_TONE[c.status]}>{t(`help.status_${c.status}`)}{['open', 'in_progress'].includes(c.status) ? ` · ${t('help.answerBy', { date: new Date(c.resolveBy).toLocaleString(i18n.language) })}` : ''}</AppText>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}>
        {c.messages.map((m) => (
          <View key={m.id} style={[styles.bubble, m.by === 'user' ? styles.mine : m.by === 'system' ? styles.system : styles.theirs]}>
            {m.by === 'admin' && <AppText variant="small" color={colors.primary}>{t('help.supportTeam')}</AppText>}
            <AppText color={m.by === 'user' ? colors.white : colors.text} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.text}</AppText>
            <AppText variant="small" color={m.by === 'user' ? 'rgba(255,255,255,0.8)' : colors.textSubtle}>{new Date(m.at).toLocaleString(i18n.language)}</AppText>
          </View>
        ))}
        <div ref={bottom} />
      </ScrollView>
      {c.status !== 'closed' ? (
        <View style={{ padding: spacing.md, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider }}>
          <TextInput value={text} onChangeText={setText} multiline maxLength={4000} placeholder={t('help.replyPlaceholder')} style={[styles.input, { minHeight: 60 }]} />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button size="md" title={t('help.reply')} loading={busy} disabled={!text.trim()} onPress={reply} style={{ flex: 1 }} />
            <Button size="md" variant="ghost" title={t('help.close')} onPress={close} />
          </View>
        </View>
      ) : (
        <View style={{ padding: spacing.lg, alignItems: 'center' }}><AppText color={colors.textMuted}>{t('help.closedNote')}</AppText></View>
      )}
    </View>
  );
};

/* ───────── my reports ───────── */

const REPORT_TONE = { received: colors.warning, under_review: colors.auctionBlue, action_taken: colors.sell, no_violation: colors.textMuted };

export const MyReportsScreen = () => {
  const { t, i18n } = useTranslation();
  const authed = useLoggedIn();
  const [items, setItems] = useState(null);
  useEffect(() => {
    if (authed) trustApi.myReports().then(({ data }) => setItems(data)).catch(() => setItems([]));
  }, [authed]);
  return (
    <View style={styles.fill}>
      <Header title={t('help.myReports')} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}>
        {!items && <ActivityIndicator style={{ minHeight: 'calc(100dvh - 200px)' }} color={colors.primary} />}
        {items?.length === 0 && <EmptyState icon={<Flag size={44} color={colors.textMuted} />} title={t('report.none')} />}
        {items?.map((r) => (
          <View key={r.id} style={styles.row}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="bodyStrong" numberOfLines={1}>{r.snapshot?.title || r.snapshot?.name || r.snapshot?.text || t(`report.target_${r.targetType}`)}</AppText>
              <AppText variant="small" color={colors.textMuted}>{t(`report.target_${r.targetType}`)} · {r.reason} · {formatDate(r.createdAt, i18n.language)}</AppText>
              <AppText variant="small" color={REPORT_TONE[r.status]}>{t(`report.status_${r.status}`)}</AppText>
              {r.resolutionNote && <AppText variant="caption" color={colors.textMuted}>{r.resolutionNote}</AppText>}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

/* ───────── verification badges ───────── */

const DOC_TYPES = { id: ['PAN card', 'Driving licence', 'Voter ID', 'Passport'], business: ['GST certificate', 'Shop & establishment licence', 'Udyam certificate'] };

function VerifyForm({ type, onDone }) {
  const { t } = useTranslation();
  const [docType, setDocType] = useState(DOC_TYPES[type][0]);
  const [number, setNumber] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [files, setFiles] = useState([]); // { id, name }
  const [busy, setBusy] = useState(false);
  const input = useRef(null);

  const upload = async (list) => {
    for (const file of Array.from(list).slice(0, 5 - files.length)) {
      try {
        const { data } = await uploadsApi.document(file, 'kyc');
        setFiles((f) => [...f, { id: data.id, name: file.name }]);
      } catch (e) {
        Alert.alert(errorText(e));
      }
    }
  };
  const send = async () => {
    setBusy(true);
    try {
      await trustApi.submitVerification({ type, docType, docNumber: number.trim() || undefined, businessName: type === 'business' ? businessName.trim() : undefined, mediaIds: files.map((f) => f.id) });
      onDone();
    } catch (e) {
      Alert.alert(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {DOC_TYPES[type].map((d) => (
          <Pressable key={d} onPress={() => setDocType(d)} style={[styles.chip, docType === d && styles.chipOn]}>
            <AppText variant="caption" color={docType === d ? colors.white : colors.text}>{d}</AppText>
          </Pressable>
        ))}
      </View>
      {type === 'business' && <TextInput value={businessName} onChangeText={setBusinessName} maxLength={120} placeholder={t('verify.businessName')} style={styles.input} />}
      <TextInput value={number} onChangeText={setNumber} maxLength={30} placeholder={t('verify.docNumber')} style={styles.input} />
      <Button size="md" variant="outline" title={t('verify.upload')} onPress={() => input.current?.click()} />
      <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png" multiple style={{ display: 'none' }} onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
      {files.map((f) => <AppText key={f.id} variant="caption" color={colors.sell}>✓ {f.name}</AppText>)}
      <AppText variant="caption" color={colors.textMuted}>{t('verify.privacy')}</AppText>
      <Button title={t('verify.submit')} loading={busy} disabled={!files.length || (type === 'business' && businessName.trim().length < 2)} onPress={send} />
    </View>
  );
}

export const VerificationScreen = () => {
  const { t } = useTranslation();
  const authed = useLoggedIn();
  const [v, setV] = useState(null);
  const [open, setOpen] = useState(null);
  const load = useCallback(() => trustApi.verification().then(({ data }) => setV(data)).catch((e) => Alert.alert(errorText(e))), []);
  useEffect(() => {
    if (authed) load();
  }, [authed, load]);

  const Block = ({ type, icon, title, info }) => {
    const latest = info.latest;
    return (
      <Card style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          {icon}
          <AppText variant="bodyStrong" style={{ flex: 1 }}>{title}</AppText>
          {info.verified && <BadgeCheck size={22} color={colors.verified} />}
        </View>
        {info.verified ? (
          <AppText color={colors.sell}>{t('verify.done')}</AppText>
        ) : latest?.status === 'pending' ? (
          <AppText color={colors.warning}>{t('verify.pending')}</AppText>
        ) : (
          <>
            {latest?.status === 'rejected' && <AppText color={colors.danger}>{t('verify.rejected', { reason: latest.reason })}</AppText>}
            {open === type ? <VerifyForm type={type} onDone={() => { setOpen(null); load(); }} /> : <Button size="md" title={t('verify.start')} onPress={() => setOpen(type)} />}
          </>
        )}
      </Card>
    );
  };

  return (
    <View style={styles.fill}>
      <Header title={t('verify.title')} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <AppText color={colors.textMuted}>{t('verify.intro')}</AppText>
        {!v && <ActivityIndicator color={colors.primary} />}
        {v && (
          <>
            <Card style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
              <BadgeCheck size={22} color={v.phone ? colors.verified : colors.textSubtle} />
              <AppText style={{ flex: 1 }}>{t('verify.phone')}</AppText>
              <AppText color={v.phone ? colors.sell : colors.textMuted}>{v.phone ? t('verify.yes') : t('verify.no')}</AppText>
            </Card>
            <Block type="id" icon={<UserCheck size={22} color={colors.text} />} title={t('verify.idTitle')} info={v.id} />
            <Block type="business" icon={<Building2 size={22} color={colors.text} />} title={t('verify.businessTitle')} info={v.business} />
            <AppText variant="caption" color={colors.textMuted}>{t('verify.meaning')}</AppText>
          </>
        )}
      </ScrollView>
    </View>
  );
};

/* ───────── my data & account deletion ───────── */

export const AccountScreen = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const authed = useLoggedIn();
  const [d, setD] = useState(null);
  const load = useCallback(() => trustApi.deletionInfo().then(({ data }) => setD(data)).catch((e) => Alert.alert(errorText(e))), []);
  useEffect(() => {
    if (authed) load();
  }, [authed, load]);

  const download = async () => {
    try {
      const { data } = await trustApi.exportData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `my-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      Alert.alert(errorText(e));
    }
  };
  const remove = async () => {
    if (!window.confirm(t('account.confirmDelete', { days: d.graceDays }))) return;
    try {
      const { data } = await trustApi.requestDeletion();
      Alert.alert(t('account.scheduled', { date: new Date(data.deleteAfter).toLocaleDateString(i18n.language) }));
      dispatch(logoutThunk());
      navigate('/', { replace: true });
    } catch (e) {
      Alert.alert(errorText(e));
    }
  };
  const keep = async () => {
    try {
      await trustApi.cancelDeletion();
      load();
    } catch (e) {
      Alert.alert(errorText(e));
    }
  };

  return (
    <View style={styles.fill}>
      <Header title={t('account.title')} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <Card style={{ gap: spacing.sm }}>
          <AppText variant="bodyStrong">{t('account.dataTitle')}</AppText>
          <AppText variant="caption" color={colors.textMuted}>{t('account.dataHint')}</AppText>
          <Button size="md" variant="outline" title={t('account.download')} icon={<Download size={16} color={colors.primary} />} onPress={download} />
        </Card>
        {d && (
          <Card style={{ gap: spacing.sm }}>
            <AppText variant="bodyStrong">{t('account.deleteTitle')}</AppText>
            {d.pending ? (
              <>
                <AppText color={colors.warning}>{t('account.pending')}</AppText>
                <Button size="md" title={t('account.keep')} onPress={keep} />
              </>
            ) : (
              <>
                <AppText variant="caption" color={colors.textMuted}>{t('account.deleteHint', { days: d.graceDays })}</AppText>
                {d.blockers.length > 0 && (
                  <View style={{ gap: 2 }}>
                    <AppText variant="caption" color={colors.danger}>{t('account.blocked')}</AppText>
                    {d.blockers.map((b) => <AppText key={b} variant="caption" color={colors.danger}>• {b}</AppText>)}
                  </View>
                )}
                <Button size="md" variant="outline" title={t('account.delete')} icon={<Trash2 size={16} color={colors.primary} />} disabled={d.blockers.length > 0} onPress={remove} />
              </>
            )}
          </Card>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.white, minHeight: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  menuIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.lg },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: 15, minHeight: 48 },
  bubble: { maxWidth: '85%', padding: spacing.md, borderRadius: radius.lg, gap: 2 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primary },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface },
  system: { alignSelf: 'center', backgroundColor: colors.warmSoft },
});
