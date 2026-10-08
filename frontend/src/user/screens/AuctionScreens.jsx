import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Clock, Gavel, Handshake, ImageOff, MapPin, Phone, MessageSquare, Plus, Trophy } from 'lucide-react';
import { ActivityIndicator, Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from '../components/primitives';
import { AppText, Button, Card, EmptyState } from '../components/ui';
import { BrandHeader } from '../components/BrandHeader';
import { colors, radius, spacing } from '@theme/tokens';
import { auctionsApi, listingsApi } from '../api/endpoints';
import { ApiError } from '../api/client';
import { useAppSelector } from '../store';
import { onRealtime, watchAuction } from '../services/realtime';
import { ReportSheet } from '../components/ReportSheet';
import { factorOf, formatMinor, formatLeft, syncServerTime, useCountdown } from '../utils/auction';
import { formatDate } from '../utils/listing';
import { errorText } from '../i18n';

const Header = ({ title, right }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <View style={styles.header}>
      <Pressable accessibilityLabel={t('common.back')} onPress={() => navigate(-1)}><ArrowLeft size={24} color={colors.text} /></Pressable>
      <AppText variant="h3" style={{ flex: 1 }} numberOfLines={1}>{title}</AppText>
      {right}
    </View>
  );
};

/** "Ends in 3h 12m" / "Starts in 2d 4h" / "Ended". */
const TimeLeft = ({ a, color = colors.text }) => {
  const { t } = useTranslation();
  const target = a.status === 'scheduled' ? a.startAt : a.endAt;
  const ms = useCountdown(['scheduled', 'live'].includes(a.status) ? target : null);
  if (a.status === 'live') return <AppText variant="caption" color={ms < 3600_000 ? colors.live : color}>{t('auction.endsIn', { time: formatLeft(ms) })}</AppText>;
  if (a.status === 'scheduled') return <AppText variant="caption" color={color}>{t('auction.startsIn', { time: formatLeft(ms) })}</AppText>;
  return <AppText variant="caption" color={colors.textMuted}>{t(`auction.status_${a.status}`)}</AppText>;
};

/** Card for an auction item (a listing card that carries an `auction` summary). */
export const AuctionCard = ({ listing }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const a = listing.auction;
  if (!a) return null;
  const amount = a.currentMinor ?? a.startingMinor;
  return (
    <Pressable onPress={() => navigate(`/auctions/${a.id}`)} style={styles.card}>
      <View style={styles.cardImg}>
        {listing.cover ? <Image source={{ uri: listing.cover }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <View style={styles.noImg}><ImageOff size={28} color={colors.textSubtle} /></View>}
        {a.status === 'live' && <View style={styles.liveTag}><AppText variant="small" color={colors.white}>● {t('auction.live')}</AppText></View>}
      </View>
      <View style={{ padding: spacing.sm, gap: 2 }}>
        <AppText variant="bodyStrong" numberOfLines={1}>{listing.title}</AppText>
        <AppText variant="small" color={colors.textMuted}>{a.currentMinor != null ? t('auction.currentBid') : t('auction.startingBid')}</AppText>
        <AppText variant="h3" color={colors.auction}>{formatMinor(amount, listing.price.currency, listing.price.factor, i18n.language)}</AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Clock size={12} color={colors.textMuted} />
          <TimeLeft a={a} color={colors.textMuted} />
        </View>
        <AppText variant="small" color={colors.textMuted}>{t('auction.bidsCount', { count: a.bidCount })}</AppText>
      </View>
    </Pressable>
  );
};

/* ───────── Auctions tab ───────── */

const TABS = ['live', 'scheduled', 'ended'];

export const AuctionsScreen = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const enabled = useAppSelector((s) => s.app.bootstrap?.auctions?.enabled);
  const authed = useAppSelector((s) => s.session.status === 'authenticated');
  const current = useAppSelector((s) => s.location.current);
  const [tab, setTab] = useState('live');
  const [items, setItems] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const near = current?.scope?.type === 'radius' ? { lat: current.lat, lng: current.lng, radiusKm: current.scope.km } : {};
  const load = useCallback(
    async (p = 1) => {
      try {
        const { data } = await auctionsApi.browse({ status: tab, page: p, limit: 20, ...near });
        setItems((prev) => (p === 1 ? data.items : [...(prev ?? []), ...data.items]));
        setHasMore(data.hasMore);
        setPage(p);
      } catch (e) {
        Alert.alert(errorText(e));
        setItems((prev) => prev ?? []);
      }
    },
    [tab, near.lat, near.lng, near.radiusKm] // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    setItems(null);
    load(1);
  }, [load]);

  return (
    <View style={styles.fill}>
      <BrandHeader />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, gap: spacing.sm }}>
        <AppText variant="h2" style={{ flex: 1 }}>{t('auction.title')}</AppText>
        {enabled && <Button size="md" variant="auction" title={t('auction.create')} icon={<Plus size={16} color={colors.white} />} onPress={() => navigate(authed ? '/sell?type=auction' : '/login')} style={{ backgroundColor: colors.auction }} />}
      </View>
      <View style={styles.tabs}>
        {TABS.map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[styles.tab, tab === k && styles.tabOn]}>
            <AppText variant="bodyStrong" color={tab === k ? colors.white : colors.text}>{t(`auction.tab_${k}`)}</AppText>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xxxl }}>
        {!items && <ActivityIndicator style={{ padding: spacing.xl }} color={colors.auction} />}
        {items?.length === 0 && <EmptyState icon={<Gavel size={44} color={colors.textMuted} />} title={t(`auction.empty_${tab}`)} />}
        <View style={styles.grid}>
          {items?.map((l) => (
            <View key={l.id} style={{ width: 'calc(50% - 6px)' }}><AuctionCard listing={l} /></View>
          ))}
        </View>
        {hasMore && <Button title={t('search.loadMore')} variant="outline" onPress={() => load(page + 1)} style={{ marginTop: spacing.lg }} />}
      </ScrollView>
    </View>
  );
};

/* ───────── auction detail ───────── */

const OUTCOME_KEY = { won: 'auction.outcome_won', no_bids: 'auction.outcome_no_bids', reserve_not_met: 'auction.outcome_reserve', bought_now: 'auction.outcome_bought' };

export const AuctionDetailScreen = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const authed = useAppSelector((s) => s.session.status === 'authenticated');
  const [a, setA] = useState(null);
  const [item, setItem] = useState(null);
  const [bids, setBids] = useState([]);
  const [failed, setFailed] = useState(false);
  const [amount, setAmount] = useState('');
  const [useMax, setUseMax] = useState(false);
  const [max, setMax] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [reporting, setReporting] = useState(false);

  const money = (minor) => (a ? formatMinor(minor, a.currency, a.factor, i18n.language) : '');
  const major = (minor) => (a && minor != null ? String(Math.round(minor / a.factor)) : '');

  const load = useCallback(async () => {
    try {
      const { data } = await auctionsApi.detail(id);
      syncServerTime(data.serverTime);
      setA(data);
      setAmount((v) => v || (data.nextMinimumMinor != null ? String(Math.round(data.nextMinimumMinor / data.factor)) : ''));
      auctionsApi.bids(id).then((r) => setBids(r.data)).catch(() => {});
      if (!item || item.id !== data.listingId) listingsApi.detail(data.listingId).then((r) => setItem(r.data)).catch(() => {});
    } catch {
      setFailed(true);
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setA(null);
    setAmount('');
    load();
    const unwatch = watchAuction(id);
    const off = [
      onRealtime('auction:update', (s) => {
        if (s.auctionId !== id) return;
        setA((prev) => (prev ? { ...prev, ...s } : prev));
        auctionsApi.bids(id).then((r) => setBids(r.data)).catch(() => {});
      }),
      onRealtime('auction:extended', (e) => e.auctionId === id && setA((prev) => (prev ? { ...prev, endAt: e.endAt } : prev))),
      onRealtime('auction:ended', (e) => e.auctionId === id && load()),
    ];
    // guests have no live connection: refresh now and then instead
    const poll = setInterval(() => !authed && load(), 15000);
    return () => {
      unwatch();
      off.forEach((f) => f());
      clearInterval(poll);
    };
  }, [id, load, authed]);

  // my standing changes with every bid: refresh it after live updates
  useEffect(() => {
    if (authed && a?.status === 'live') {
      const tmo = setTimeout(() => auctionsApi.detail(id).then(({ data }) => setA((p) => ({ ...p, me: data.me, buyNowMinor: data.buyNowMinor, stepMinor: data.stepMinor }))).catch(() => {}), 300);
      return () => clearTimeout(tmo);
    }
    return undefined;
  }, [a?.bidCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const placeBid = async (confirmHigh = false) => {
    if (!authed) return navigate('/login');
    setBusy(true);
    try {
      const body = { amount: Number(amount), ...(useMax && max ? { maxAmount: Number(max) } : {}), ...(confirmHigh ? { confirmHigh: true } : {}) };
      const { data } = await auctionsApi.bid(id, body);
      setA((prev) => ({ ...prev, ...data }));
      setAmount(data.nextMinimumMinor != null ? major(data.nextMinimumMinor) : '');
      setMax('');
      load();
      if (!data.isLeading) Alert.alert(t('auction.outbidByAuto'));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'BID_TOO_HIGH_CONFIRM') {
        if (window.confirm(t('auction.confirmHigh', { amount: money(Number(amount) * a.factor) }))) return placeBid(true);
      } else {
        if (e instanceof ApiError && e.details?.nextMinimumMinor) setAmount(major(e.details.nextMinimumMinor));
        Alert.alert(errorText(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const buyNow = async () => {
    if (!authed) return navigate('/login');
    if (!window.confirm(t('auction.confirmBuyNow', { amount: money(a.buyNowMinor) }))) return;
    try {
      const { data } = await auctionsApi.buyNow(id);
      navigate(`/deals/${data.id}`);
    } catch (e) {
      Alert.alert(errorText(e));
      load();
    }
  };

  const sellerAction = async (fn, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    try {
      const r = await fn();
      if (r?.data?.id && r.data.source === 'offer') Alert.alert(t('auction.offerSent'));
      load();
    } catch (e) {
      Alert.alert(errorText(e));
    }
  };

  if (failed) {
    return (
      <View style={styles.fill}>
        <Header title="" />
        <EmptyState icon={<Gavel size={44} color={colors.textMuted} />} title={t('auction.unavailable')} />
      </View>
    );
  }
  if (!a) return <View style={[styles.fill, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={colors.auction} /></View>;

  const photos = item?.media ?? [];
  const shown = a.currentMinor ?? a.startingMinor;
  const myDealRoute = a.deal ? `/deals/${a.deal.id}` : null;

  return (
    <View style={styles.fill}>
      <Header title={item?.title ?? ''} />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        <View style={styles.gallery}>
          {photos.length ? (
            <div style={{ display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', height: '100%' }}>
              {photos.map((u) => <img key={u} src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', flex: '0 0 100%', scrollSnapAlign: 'start' }} />)}
            </div>
          ) : (
            <View style={styles.noImg}><ImageOff size={40} color={colors.textSubtle} /></View>
          )}
          {a.status === 'live' && <View style={[styles.liveTag, { top: spacing.md, left: spacing.md }]}><AppText variant="caption" color={colors.white}>● {t('auction.live')}</AppText></View>}
        </View>

        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <AppText variant="h2">{item?.title}</AppText>
          {item?.place && (
            <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
              <MapPin size={14} color={colors.textMuted} />
              <AppText variant="caption" color={colors.textMuted}>{item.place}</AppText>
            </View>
          )}

          {/* standing */}
          <Card style={{ backgroundColor: colors.auctionSoft, gap: spacing.xs }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <View>
                <AppText variant="caption" color={colors.textMuted}>{a.currentMinor != null ? t('auction.currentBid') : t('auction.startingBid')}</AppText>
                <AppText style={{ fontSize: 28, lineHeight: 34, fontWeight: '800' }} color={colors.auction}>{money(a.status === 'ended' && a.finalMinor != null ? a.finalMinor : shown)}</AppText>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <TimeLeft a={a} />
                <AppText variant="caption" color={colors.textMuted}>{t('auction.bidsCount', { count: a.bidCount })} · {t('auction.biddersCount', { count: a.bidderCount })}</AppText>
              </View>
            </View>
            {a.hasReserve && <AppText variant="caption" color={a.reserveMet ? colors.sell : colors.warning}>{a.reserveMet ? t('auction.reserveMet') : t('auction.reserveNotMet')}</AppText>}
            {a.me && (
              <AppText variant="bodyStrong" color={a.me.won || a.me.isLeading ? colors.sell : colors.live}>
                {a.me.won ? t('auction.youWon') : a.me.isLeading ? t('auction.youLead', { alias: a.me.alias }) : a.status === 'live' ? t('auction.youOutbid', { amount: money(a.me.highestMinor) }) : t('auction.youLost')}
              </AppText>
            )}
            {a.me?.maxMinor != null && a.status === 'live' && <AppText variant="caption" color={colors.textMuted}>{t('auction.yourMax', { amount: money(a.me.maxMinor) })}</AppText>}
            {a.status === 'ended' && a.outcome && <AppText variant="bodyStrong">{t(OUTCOME_KEY[a.outcome])}</AppText>}
          </Card>

          {myDealRoute && <Button title={t('auction.openDeal')} icon={<Handshake size={18} color={colors.white} />} onPress={() => navigate(myDealRoute)} style={{ backgroundColor: colors.auction }} />}

          {/* bid box */}
          {a.status === 'live' && !a.isSeller && (
            <Card style={{ gap: spacing.sm }}>
              <AppText variant="bodyStrong">{t('auction.yourBid')}</AppText>
              <AppText variant="caption" color={colors.textMuted}>{t('auction.minimumIs', { amount: money(a.nextMinimumMinor) })}</AppText>
              <View style={styles.amountBox}>
                <TextInput value={amount} onChangeText={(v) => setAmount(v.replace(/\D/g, ''))} keyboardType="number-pad" style={{ flex: 1, fontSize: 20, fontWeight: '700', height: 48 }} placeholder={major(a.nextMinimumMinor)} />
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                {[0, 1, 2].map((k) => {
                  const v = a.nextMinimumMinor + k * a.stepMinor;
                  return (
                    <Pressable key={k} onPress={() => setAmount(major(v))} style={styles.quick}>
                      <AppText variant="caption" color={colors.auction}>{money(v)}</AppText>
                    </Pressable>
                  );
                })}
              </View>
              {a.rules.proxyBidding && (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <AppText style={{ flex: 1 }}>{t('auction.autoBid')}</AppText>
                    <Switch value={useMax} onValueChange={setUseMax} activeColor={colors.auction} />
                  </View>
                  {useMax && (
                    <>
                      <View style={styles.amountBox}>
                        <TextInput value={max} onChangeText={(v) => setMax(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder={t('auction.maxPlaceholder')} style={{ flex: 1, fontSize: 18, height: 48 }} />
                      </View>
                      <AppText variant="caption" color={colors.textMuted}>{t('auction.autoBidHelp')}</AppText>
                    </>
                  )}
                </>
              )}
              <Button title={t('auction.placeBid')} icon={<Gavel size={18} color={colors.white} />} loading={busy} disabled={!amount} onPress={() => placeBid(false)} style={{ backgroundColor: colors.auction }} />
              {a.buyNowMinor != null && <Button variant="sell" title={t('auction.buyNowFor', { amount: money(a.buyNowMinor) })} onPress={buyNow} />}
            </Card>
          )}
          {a.status === 'scheduled' && !a.isSeller && <Card><AppText>{t('auction.notStarted', { date: new Date(a.startAt).toLocaleString(i18n.language) })}</AppText></Card>}

          {/* seller tools */}
          {a.isSeller && (
            <Card style={{ gap: spacing.sm }}>
              <AppText variant="bodyStrong">{t('auction.yourAuction')} · {t(`auction.status_${a.status}`)}</AppText>
              {a.rejectReason && <AppText color={colors.danger}>{t('myListings.reason', { reason: a.rejectReason })}</AppText>}
              {a.reserveMinor != null && <AppText variant="caption" color={colors.textMuted}>{t('auction.yourReserve', { amount: money(a.reserveMinor) })}</AppText>}
              <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                {['pending_review', 'rejected'].includes(a.status) && <Button size="md" variant="outline" title={t('myListings.edit')} onPress={() => navigate(`/auctions/${id}/edit`)} />}
                {['pending_review', 'rejected', 'scheduled', 'live'].includes(a.status) && a.bidCount === 0 && (
                  <Button size="md" variant="ghost" title={t('auction.cancel')} onPress={() => sellerAction(() => auctionsApi.cancel(id), t('auction.confirmCancel'))} />
                )}
                {a.canOffer && <Button size="md" title={t('auction.offerNext')} onPress={() => sellerAction(() => auctionsApi.offer(id), t('auction.confirmOffer'))} />}
              </View>
              {['scheduled', 'live'].includes(a.status) && (
                <View style={{ gap: spacing.xs }}>
                  <TextInput value={note} onChangeText={setNote} placeholder={t('auction.notePlaceholder')} maxLength={500} style={styles.noteInput} multiline />
                  <Button size="md" variant="outline" title={t('auction.addNote')} disabled={note.trim().length < 3} onPress={() => sellerAction(async () => { await auctionsApi.note(id, note.trim()); setNote(''); })} />
                </View>
              )}
            </Card>
          )}

          {/* rules */}
          <Card style={{ gap: 4 }}>
            <AppText variant="bodyStrong">{t('auction.rulesTitle')}</AppText>
            <AppText variant="caption" color={colors.textMuted}>• {t('auction.ruleStep', { amount: money(a.stepMinor) })}</AppText>
            {a.rules.antiSniping?.enabled && <AppText variant="caption" color={colors.textMuted}>• {t('auction.ruleSnipe', { window: Math.round(a.rules.antiSniping.windowSec / 60), extend: Math.round(a.rules.antiSniping.extendSec / 60) })}</AppText>}
            {a.rules.proxyBidding && <AppText variant="caption" color={colors.textMuted}>• {t('auction.ruleProxy')}</AppText>}
            <AppText variant="caption" color={colors.textMuted}>• {t('auction.ruleConfirm', { hours: a.rules.paymentWindowHours })}</AppText>
            <AppText variant="caption" color={colors.textMuted}>• {t('auction.ruleHighest')}</AppText>
          </Card>

          {a.notes?.length > 0 && (
            <Card style={{ gap: spacing.xs, backgroundColor: colors.warmSoft }}>
              <AppText variant="bodyStrong">{t('auction.sellerNotes')}</AppText>
              {a.notes.map((n, i) => <AppText key={i} variant="caption">{formatDate(n.at, i18n.language)} — {n.text}</AppText>)}
            </Card>
          )}

          {item && (
            <View style={{ gap: spacing.sm }}>
              <AppText variant="h3">{t('listing.description')}</AppText>
              <AppText style={{ lineHeight: 24, whiteSpace: 'pre-wrap' }}>{item.description}</AppText>
              {item.attributes?.length > 0 && (
                <Card style={{ padding: 0 }}>
                  {item.attributes.map((x, i) => (
                    <View key={x.key} style={[styles.attr, i > 0 && { borderTopWidth: 1, borderTopColor: colors.divider }]}>
                      <AppText color={colors.textMuted} style={{ flex: 1 }}>{x.label}</AppText>
                      <AppText variant="bodyStrong">{typeof x.value === 'boolean' ? (x.value ? t('listing.yes') : t('listing.no')) : x.value}</AppText>
                    </View>
                  ))}
                </Card>
              )}
              {item.seller && <AppText variant="caption" color={colors.textMuted}>{t('listing.seller')}: {item.seller.name}</AppText>}
              {!a.isSeller && <AppText variant="caption" color={colors.primary} onPress={() => setReporting(true)}>{t('report.title_listing')}</AppText>}
            </View>
          )}

          {/* history */}
          <View style={{ gap: spacing.xs }}>
            <AppText variant="h3">{t('auction.history')}</AppText>
            {bids.length === 0 && <AppText color={colors.textMuted}>{t('auction.noBids')}</AppText>}
            {bids.map((b) => (
              <View key={b.id} style={styles.bidRow}>
                <AppText variant="bodyStrong" style={{ flex: 1 }} color={b.mine ? colors.auction : colors.text}>
                  {b.mine ? t('auction.you') : t('auction.bidder', { n: b.alias })}
                  {b.kind === 'auto' ? ` · ${t('auction.auto')}` : b.kind === 'buy_now' ? ` · ${t('auction.buyNow')}` : ''}
                </AppText>
                <AppText variant="bodyStrong">{money(b.amountMinor)}</AppText>
                <AppText variant="small" color={colors.textMuted} style={{ width: 70, textAlign: 'right' }}>{new Date(b.at).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}</AppText>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
      {reporting && <ReportSheet targetType="listing" targetId={a.listingId} onClose={() => setReporting(false)} />}
    </View>
  );
};

/* ───────── my auctions ───────── */

const STANDING_TONE = { leading: colors.sell, won: colors.sell, outbid: colors.live, lost: colors.textMuted, cancelled: colors.textMuted };

export const MyAuctionsScreen = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const status = useAppSelector((s) => s.session.status);
  const currency = useAppSelector((s) => s.app.bootstrap?.marketplace?.currency);
  const [role, setRole] = useState('bidding');
  const [items, setItems] = useState(null);

  useEffect(() => {
    if (status === 'guest') return navigate('/login', { replace: true });
    if (status !== 'authenticated') return;
    setItems(null);
    auctionsApi.mine(role).then(({ data }) => setItems(data)).catch((e) => { Alert.alert(errorText(e)); setItems([]); });
  }, [role, status, navigate]);

  return (
    <View style={styles.fill}>
      <Header title={t('auction.mine')} right={<Pressable onPress={() => navigate('/deals')}><AppText variant="bodyStrong" color={colors.auction}>{t('auction.deals')}</AppText></Pressable>} />
      <View style={styles.tabs}>
        {['bidding', 'selling'].map((k) => (
          <Pressable key={k} onPress={() => setRole(k)} style={[styles.tab, role === k && styles.tabOn]}>
            <AppText variant="bodyStrong" color={role === k ? colors.white : colors.text}>{t(`auction.role_${k}`)}</AppText>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.sm, paddingBottom: spacing.xxxl }}>
        {!items && <ActivityIndicator style={{ padding: spacing.xl }} color={colors.auction} />}
        {items?.length === 0 && (
          <EmptyState
            icon={<Gavel size={44} color={colors.textMuted} />}
            title={t(`auction.mineEmpty_${role}`)}
            action={role === 'selling' ? <Button title={t('auction.create')} onPress={() => navigate('/sell?type=auction')} /> : <Button title={t('auction.browse')} onPress={() => navigate('/auctions')} />}
          />
        )}
        {items?.map((a) => (
          <Pressable key={a.id} onPress={() => navigate(`/auctions/${a.id}`)} style={styles.row}>
            {a.cover ? <Image source={{ uri: a.cover }} style={styles.thumb} /> : <View style={[styles.thumb, { backgroundColor: colors.surface }]} />}
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="bodyStrong" numberOfLines={1}>{a.title}</AppText>
              <AppText variant="bodyStrong" color={colors.auction}>{formatMinor(a.currentMinor ?? a.startingMinor, currency, factorOf(currency), i18n.language)}</AppText>
              <TimeLeft a={a} color={colors.textMuted} />
              {role === 'bidding' ? (
                <AppText variant="small" color={STANDING_TONE[a.standing]}>{t(`auction.standing_${a.standing}`)}</AppText>
              ) : (
                <AppText variant="small" color={colors.textMuted}>{t(`auction.status_${a.status}`)}{a.outcome ? ` · ${t(OUTCOME_KEY[a.outcome])}` : ''}</AppText>
              )}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
};

/* ───────── deals ───────── */

const DEAL_TONE = { awaiting_confirmation: colors.warning, in_progress: colors.auctionBlue, completed: colors.sell, buyer_defaulted: colors.danger, seller_defaulted: colors.danger, cancelled: colors.textMuted, disputed: colors.danger };

export const DealsScreen = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const status = useAppSelector((s) => s.session.status);
  const [items, setItems] = useState(null);

  useEffect(() => {
    if (status === 'guest') return navigate('/login', { replace: true });
    if (status !== 'authenticated') return;
    auctionsApi.deals('all').then(({ data }) => setItems(data)).catch((e) => { Alert.alert(errorText(e)); setItems([]); });
  }, [status, navigate]);

  return (
    <View style={styles.fill}>
      <Header title={t('auction.deals')} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxxl }}>
        {!items && <ActivityIndicator style={{ padding: spacing.xl }} color={colors.auction} />}
        {items?.length === 0 && <EmptyState icon={<Handshake size={44} color={colors.textMuted} />} title={t('auction.dealsEmpty')} />}
        {items?.map((d) => (
          <Pressable key={d.id} onPress={() => navigate(`/deals/${d.id}`)} style={styles.row}>
            {d.listing?.cover ? <Image source={{ uri: d.listing.cover }} style={styles.thumb} /> : <View style={[styles.thumb, { backgroundColor: colors.surface }]} />}
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="bodyStrong" numberOfLines={1}>{d.listing?.title}</AppText>
              <AppText variant="bodyStrong" color={colors.auction}>{formatMinor(d.amountMinor, d.currency, factorOf(d.currency), i18n.language)}</AppText>
              <AppText variant="small" color={colors.textMuted}>{t(`auction.role_${d.role === 'buyer' ? 'buyer' : 'seller'}`)}</AppText>
              <AppText variant="small" color={DEAL_TONE[d.status]}>{t(`auction.deal_${d.status}`)}</AppText>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
};

const DealCountdown = ({ until }) => {
  const { t } = useTranslation();
  const ms = useCountdown(until);
  return <AppText variant="caption" color={colors.warning}>{t('auction.confirmWithin', { time: formatLeft(ms) })}</AppText>;
};

export const DealScreen = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const status = useAppSelector((s) => s.session.status);
  const [d, setD] = useState(null);

  const load = useCallback(() => auctionsApi.deal(id).then(({ data }) => setD(data)).catch((e) => Alert.alert(errorText(e))), [id]);
  useEffect(() => {
    if (status === 'guest') return navigate('/login', { replace: true });
    if (status === 'authenticated') load();
    return undefined;
  }, [status, load, navigate]);

  const act = async (action, ask) => {
    let reason;
    if (ask) {
      reason = window.prompt(ask);
      if (!reason) return;
    }
    try {
      const { data } = await auctionsApi.dealAction(id, action, reason);
      setD(data);
    } catch (e) {
      Alert.alert(errorText(e));
    }
  };

  if (!d) return <View style={[styles.fill, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={colors.auction} /></View>;
  const buyer = d.role === 'buyer';

  return (
    <View style={styles.fill}>
      <Header title={t('auction.deal')} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}>
        <Pressable onPress={() => navigate(`/auctions/${d.auctionId}`)} style={styles.row}>
          {d.listing?.cover ? <Image source={{ uri: d.listing.cover }} style={styles.thumb} /> : <View style={[styles.thumb, { backgroundColor: colors.surface }]} />}
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="bodyStrong">{d.listing?.title}</AppText>
            <AppText style={{ fontSize: 22, fontWeight: '800' }} color={colors.auction}>{formatMinor(d.amountMinor, d.currency, factorOf(d.currency), i18n.language)}</AppText>
            <AppText variant="small" color={colors.textMuted}>{t(`auction.source_${d.source}`)}</AppText>
          </View>
        </Pressable>

        <Card style={{ gap: spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            {d.status === 'completed' ? <Trophy size={20} color={colors.sell} /> : <Handshake size={20} color={DEAL_TONE[d.status]} />}
            <AppText variant="bodyStrong" color={DEAL_TONE[d.status]}>{t(`auction.deal_${d.status}`)}</AppText>
          </View>
          <AppText variant="caption" color={colors.textMuted}>{t(`auction.dealHelp_${d.status}_${buyer ? 'buyer' : 'seller'}`)}</AppText>
          {d.confirmBy && <DealCountdown until={d.confirmBy} />}
        </Card>

        {d.counterpart && (
          <Card style={{ gap: spacing.sm }}>
            <AppText variant="bodyStrong">{buyer ? t('auction.seller') : t('auction.buyer')}: {d.counterpart.name}</AppText>
            {d.counterpart.phone && <Button size="md" variant="outline" title={`${t('leads.call')} ${d.counterpart.phone}`} icon={<Phone size={16} color={colors.primary} />} onPress={() => Linking.openURL(`tel:${d.counterpart.phone}`)} />}
            {d.conversationId && <Button size="md" variant="outline" title={t('auction.openChat')} icon={<MessageSquare size={16} color={colors.primary} />} onPress={() => navigate(`/chat/${d.conversationId}`)} />}
            {d.pickup && (
              <Button size="md" variant="outline" title={t('auction.pickupMap')} icon={<MapPin size={16} color={colors.primary} />} onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${d.pickup.lat},${d.pickup.lng}`)} />
            )}
          </Card>
        )}

        <View style={{ gap: spacing.sm }}>
          {buyer && d.status === 'awaiting_confirmation' && <Button title={t('auction.confirmDeal')} onPress={() => act('confirm')} style={{ backgroundColor: colors.auction }} />}
          {d.status === 'in_progress' && !d.iMarkedComplete && <Button variant="sell" title={t('auction.markComplete')} onPress={() => act('complete')} />}
          {d.status === 'in_progress' && d.iMarkedComplete && <AppText color={colors.textMuted}>{t('auction.waitingOther')}</AppText>}
          {d.status === 'in_progress' && <Button variant="outline" title={t('auction.dispute')} onPress={() => act('dispute', t('auction.disputeAsk'))} />}
          {['awaiting_confirmation', 'in_progress'].includes(d.status) && <Button variant="ghost" title={buyer ? t('auction.backOut') : t('auction.cancelSale')} onPress={() => act('cancel', t('auction.cancelAsk'))} />}
        </View>

        <View style={{ gap: spacing.xs }}>
          <AppText variant="h3">{t('auction.timeline')}</AppText>
          {d.timeline.map((e, i) => (
            <AppText key={i} variant="caption" color={colors.textMuted}>{new Date(e.at).toLocaleString(i18n.language)} — {t(`auction.event_${e.event}`, { defaultValue: e.event.replace(/_/g, ' ') })}</AppText>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  tabs: { flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, flexWrap: 'wrap' },
  tab: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  tabOn: { backgroundColor: colors.auction, borderColor: colors.auction },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.divider, overflow: 'hidden', backgroundColor: colors.white },
  cardImg: { height: 130, backgroundColor: colors.surface },
  noImg: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  liveTag: { position: 'absolute', top: 6, left: 6, backgroundColor: colors.live, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  gallery: { height: 260, backgroundColor: colors.surface },
  amountBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md },
  quick: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.auction },
  noteInput: { minHeight: 60, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, fontSize: 15 },
  attr: { flexDirection: 'row', padding: spacing.md, gap: spacing.md },
  bidRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  row: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.lg },
  thumb: { width: 72, height: 72, borderRadius: radius.md },
});
