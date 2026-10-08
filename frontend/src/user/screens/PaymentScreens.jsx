import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, BadgeCheck, CheckCircle2, CreditCard, FileText, Home, LayoutGrid, MapPin, Rocket, Star } from 'lucide-react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from '../components/primitives';
import { AppText, Button, Card, EmptyState } from '../components/ui';
import { colors, radius, spacing } from '@theme/tokens';
import { paymentsApi, listingsApi } from '../api/endpoints';
import { getAccessToken } from '../api/client';
import { env } from '../config/env';
import { useAppSelector } from '../store';
import { openCheckout } from '../services/checkout';
import { formatMinor } from '../utils/auction';
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

/* ───────── pay: /pay?purpose=…&refId=…&productCode=… ───────── */

export const PayScreen = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const authed = useLoggedIn();
  const brand = useAppSelector((s) => s.app.bootstrap?.branding?.primaryColor);
  const body = { purpose: params.get('purpose'), refId: params.get('refId') || undefined, productCode: params.get('productCode') || undefined };
  const [q, setQ] = useState(null);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(null);

  const load = useCallback(
    async () => {
      try {
        const { data } = await paymentsApi.quote(body);
        setQ(data);
      } catch (e) {
        setError(errorText(e));
      }
    },
    [params.toString()] // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    if (authed) load();
  }, [authed, load]);

  const pay = async () => {
    setPaying(true);
    try {
      const { data } = await paymentsApi.order(body);
      const result = data.checkout ? await openCheckout(data.checkout, brand) : data.payment;
      setDone(result);
    } catch (e) {
      if (!e.cancelled) Alert.alert(e.message === 'CHECKOUT_LOAD_FAILED' ? t('pay.checkoutLoadFailed') : errorText(e));
    } finally {
      setPaying(false);
    }
  };

  const money = (minor) => formatMinor(minor, q?.currency, q?.factor, i18n.language);
  const next = body.purpose === 'listing_fee' || body.purpose === 'promotion' ? `/listing/${body.refId}` : '/payments';

  if (done) {
    return (
      <View style={[styles.fill, { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md }]}>
        <CheckCircle2 size={64} color={colors.sell} />
        <AppText variant="h2" style={{ textAlign: 'center' }}>{t('pay.success')}</AppText>
        <AppText color={colors.textMuted} style={{ textAlign: 'center' }}>{t(`pay.successHint_${body.purpose}`)}</AppText>
        <View style={{ alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.lg }}>
          <Button title={t('pay.continue')} onPress={() => navigate(next, { replace: true })} />
          <Button variant="outline" title={t('pay.viewPayments')} onPress={() => navigate('/payments', { replace: true })} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <Header title={t('pay.title')} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        {error && <EmptyState icon={<CreditCard size={44} color={colors.textMuted} />} title={error} action={<Button variant="outline" title={t('common.back')} onPress={() => navigate(-1)} />} />}
        {!q && !error && <ActivityIndicator style={{ padding: spacing.xl }} color={colors.primary} />}
        {q && (
          <>
            <Card style={{ gap: spacing.sm }}>
              <AppText variant="bodyStrong">{q.description}</AppText>
              <View style={styles.line}><AppText color={colors.textMuted}>{t('pay.price')}</AppText><AppText>{money(q.baseMinor)}</AppText></View>
              {q.includedInPlan && <AppText variant="caption" color={colors.sell}>{t('pay.includedInPlan')}</AppText>}
              {q.taxPercent > 0 && <View style={styles.line}><AppText color={colors.textMuted}>{q.taxLabel} {q.taxPercent}%</AppText><AppText>{money(q.taxMinor)}</AppText></View>}
              <View style={[styles.line, { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm }]}>
                <AppText variant="h3">{t('pay.total')}</AppText>
                <AppText variant="h3" color={colors.primary}>{money(q.totalMinor)}</AppText>
              </View>
            </Card>

            <Button title={q.totalMinor ? t('pay.payNow', { amount: money(q.totalMinor) }) : t('pay.useIncluded')} loading={paying} onPress={pay} />
            <AppText variant="caption" color={colors.textMuted} style={{ textAlign: 'center' }}>{t('pay.secure')}</AppText>
          </>
        )}
      </ScrollView>
    </View>
  );
};

/* ───────── promote an ad ───────── */

const PROMO_ICON = { featured: Star, top: Rocket, homepage: Home, category: LayoutGrid, location: MapPin };

export const PromoteScreen = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const authed = useLoggedIn();
  const [catalog, setCatalog] = useState(null);
  const [ad, setAd] = useState(null);

  useEffect(() => {
    if (!authed) return;
    paymentsApi.catalog().then(({ data }) => setCatalog(data)).catch((e) => Alert.alert(errorText(e)));
    listingsApi.detail(id).then(({ data }) => setAd(data)).catch(() => {});
  }, [authed, id]);

  return (
    <View style={styles.fill}>
      <Header title={t('promote.title')} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        {ad && <AppText color={colors.textMuted}>{t('promote.for', { title: ad.title })}</AppText>}
        {!catalog && <ActivityIndicator style={{ padding: spacing.xl }} color={colors.primary} />}
        {catalog?.promotions.length === 0 && <EmptyState icon={<Rocket size={44} color={colors.textMuted} />} title={t('promote.none')} />}
        {catalog?.promotions.map((p) => {
          const Icon = PROMO_ICON[p.type];
          return (
            <Pressable key={p.code} onPress={() => navigate(`/pay?purpose=promotion&refId=${id}&productCode=${p.code}`)} style={styles.option}>
              <View style={styles.optionIcon}><Icon size={22} color={colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">{p.name}</AppText>
                <AppText variant="caption" color={colors.textMuted}>{t(`promote.what_${p.type}`)} · {t('promote.days', { count: p.days })}</AppText>
                {catalog.myPlan?.credits?.[p.type] > 0 && <AppText variant="caption" color={colors.sell}>{t('promote.included', { count: catalog.myPlan.credits[p.type] })}</AppText>}
              </View>
              <AppText variant="h3" color={colors.primary}>{formatMinor(Math.round(p.price * catalog.factor), catalog.currency, catalog.factor, i18n.language)}</AppText>
            </Pressable>
          );
        })}
        {catalog?.taxPercent > 0 && <AppText variant="caption" color={colors.textMuted}>{t('pay.plusTax', { label: catalog.taxLabel, percent: catalog.taxPercent })}</AppText>}
      </ScrollView>
    </View>
  );
};

/* ───────── seller plans ───────── */

export const PlansScreen = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const authed = useLoggedIn();
  const [catalog, setCatalog] = useState(null);
  useEffect(() => {
    if (authed) paymentsApi.catalog().then(({ data }) => setCatalog(data)).catch((e) => Alert.alert(errorText(e)));
  }, [authed]);

  return (
    <View style={styles.fill}>
      <Header title={t('plans.title')} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        {!catalog && <ActivityIndicator style={{ padding: spacing.xl }} color={colors.primary} />}
        {catalog?.myPlan && (
          <Card style={{ backgroundColor: colors.sellSoft, flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
            <BadgeCheck size={22} color={colors.sell} />
            <AppText style={{ flex: 1 }}>{t('plans.current', { name: catalog.myPlan.name, date: formatDate(catalog.myPlan.endAt, i18n.language) })}</AppText>
          </Card>
        )}
        {catalog?.freePlan && (
          <Card style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText variant="h3">{catalog.freePlan.name}</AppText>
              <AppText variant="h3" color={colors.sell}>{t('plans.free')}</AppText>
            </View>
            <AppText variant="caption" color={colors.textMuted}>{catalog.freePlan.listingFeeOn ? t('plans.freeAds', { count: catalog.freePlan.freeAdsPer30Days }) : t('plans.freeUnlimited')}</AppText>
            {!catalog.myPlan && <AppText variant="caption" color={colors.sell}>{t('plans.yourPlan')}</AppText>}
          </Card>
        )}
        {catalog?.plans.length === 0 && <EmptyState icon={<BadgeCheck size={44} color={colors.textMuted} />} title={t('plans.none')} />}
        {catalog?.plans.map((p) => (
          <Card key={p.code} style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText variant="h3">{p.name}</AppText>
              <AppText variant="h3" color={colors.primary}>{formatMinor(Math.round(p.price * catalog.factor), catalog.currency, catalog.factor, i18n.language)}</AppText>
            </View>
            <AppText variant="caption" color={colors.textMuted}>{t('plans.days', { count: p.days })} · {t('plans.extraAds', { count: p.extraFreeAds })}</AppText>
            {p.includedPromotions?.map((x) => <AppText key={x.type} variant="caption" color={colors.sell}>✓ {t('plans.includes', { count: x.count, name: t(`promote.name_${x.type}`) })}</AppText>)}
            {!!p.description && <AppText>{p.description}</AppText>}
            <Button size="md" title={catalog.myPlan ? t('plans.extend') : t('plans.buy')} onPress={() => navigate(`/pay?purpose=plan&productCode=${p.code}`)} style={{ marginTop: spacing.sm }} />
          </Card>
        ))}
        {catalog?.taxPercent > 0 && catalog.plans.length > 0 && <AppText variant="caption" color={colors.textMuted}>{t('pay.plusTax', { label: catalog.taxLabel, percent: catalog.taxPercent })}</AppText>}
      </ScrollView>
    </View>
  );
};

/* ───────── history, invoices, commissions ───────── */

const STATUS_TONE = { paid: colors.sell, failed: colors.danger, refunded: colors.textMuted, partially_refunded: colors.warning };

/** The invoice needs the login token, so fetch it and open it as a page of its own. */
const openInvoice = async (id) => {
  const w = window.open('', '_blank');
  try {
    const res = await fetch(`${env.apiBaseUrl}/payments/${id}/invoice`, { headers: { Authorization: `Bearer ${getAccessToken()}` } });
    if (!res.ok) throw new Error();
    const url = URL.createObjectURL(new Blob([await res.text()], { type: 'text/html' }));
    if (w) w.location.href = url;
    else window.location.href = url;
  } catch {
    w?.close();
    Alert.alert('Could not open the invoice');
  }
};

export const PaymentsScreen = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const authed = useLoggedIn();
  const [items, setItems] = useState(null);
  const [commissions, setCommissions] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async (p = 1) => {
    try {
      const { data } = await paymentsApi.history({ page: p, limit: 20 });
      setItems((prev) => (p === 1 ? data.items : [...(prev ?? []), ...data.items]));
      setHasMore(data.hasMore);
      setPage(p);
    } catch (e) {
      Alert.alert(errorText(e));
      setItems((prev) => prev ?? []);
    }
  }, []);
  useEffect(() => {
    if (!authed) return;
    load(1);
    paymentsApi.commissions().then(({ data }) => setCommissions(data)).catch(() => {});
  }, [authed, load]);

  const due = commissions.filter((c) => c.status === 'due');

  return (
    <View style={styles.fill}>
      <Header title={t('payments.title')} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxxl }}>
        <Button variant="outline" size="md" title={t('payments.plans')} icon={<BadgeCheck size={16} color={colors.primary} />} onPress={() => navigate('/plans')} />

        {due.map((c) => (
          <Card key={c.id} style={{ gap: spacing.xs, backgroundColor: c.overdue ? colors.primarySoft : colors.warmSoft }}>
            <AppText variant="bodyStrong">{t('payments.commissionDue', { amount: formatMinor(c.amountMinor, c.currency, c.factor, i18n.language) })}</AppText>
            <AppText variant="caption" color={colors.textMuted}>{t(`payments.as_${c.role}`)}</AppText>
            <AppText variant="caption" color={c.overdue ? colors.danger : colors.textMuted}>
              {c.title ? `${c.title} · ` : ''}{c.overdue ? t('payments.overdue') : t('payments.dueBy', { date: formatDate(c.dueAt, i18n.language) })}
            </AppText>
            <Button size="md" title={t('payments.payNow')} onPress={() => navigate(`/pay?purpose=commission&refId=${c.id}`)} />
          </Card>
        ))}

        <AppText variant="h3" style={{ marginTop: spacing.md }}>{t('payments.history')}</AppText>
        {!items && <ActivityIndicator style={{ padding: spacing.xl }} color={colors.primary} />}
        {items?.length === 0 && <EmptyState icon={<CreditCard size={44} color={colors.textMuted} />} title={t('payments.empty')} />}
        {items?.map((p) => (
          <View key={p.id} style={styles.row}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="bodyStrong" numberOfLines={2}>{p.description}</AppText>
              <AppText variant="small" color={colors.textMuted}>{formatDate(p.paidAt || p.createdAt, i18n.language)}{p.invoiceNo ? ` · ${p.invoiceNo}` : ''}</AppText>
              <AppText variant="small" color={STATUS_TONE[p.status]}>{t(`payments.status_${p.status}`)}{p.failureReason && p.status === 'failed' ? ` · ${p.failureReason}` : ''}</AppText>
            </View>
            <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
              <AppText variant="bodyStrong">{formatMinor(p.totalMinor, p.currency, p.factor, i18n.language)}</AppText>
              {p.invoiceNo && (
                <Pressable onPress={() => openInvoice(p.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <FileText size={14} color={colors.primary} />
                  <AppText variant="caption" color={colors.primary}>{t('payments.invoice')}</AppText>
                </Pressable>
              )}
            </View>
          </View>
        ))}
        {hasMore && <Button variant="outline" title={t('search.loadMore')} onPress={() => load(page + 1)} />}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: { flex: 1, height: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 15 },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.lg },
  optionIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.lg },
});
