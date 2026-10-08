import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, BadgeCheck, FileX, ImageOff, MapPin, Share2 } from 'lucide-react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, TextInput, View } from '../components/primitives';
import { AppText, Button, Card, EmptyState } from '../components/ui';
import { FavouriteButton } from '../components/ListingCard';
import { colors, radius, spacing } from '@theme/tokens';
import { listingsApi, chatApi, leadsApi } from '../api/endpoints';
import { useAppSelector } from '../store';
import { formatPrice, formatDate } from '../utils/listing';
import { formatDistance } from '../utils/distance';
import { errorText } from '../i18n';

const Pill = ({ label, tone = 'neutral' }) => (
  <View style={[styles.pill, tone === 'blue' && { backgroundColor: colors.auctionSoft }, tone === 'green' && { backgroundColor: colors.sellSoft }, tone === 'amber' && { backgroundColor: colors.warmSoft }]}>
    <AppText variant="small" color={colors.text}>{label}</AppText>
  </View>
);

/** "Apply" on a job ad, "Send enquiry" on a service ad. */
const LeadBox = ({ ad, authed, onLogin }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const kind = ad.listingType === 'job' ? 'apply' : 'enquire';

  const submit = async () => {
    setBusy(true);
    try {
      await leadsApi.send(ad.id, message.trim());
      setSent(true);
      setOpen(false);
    } catch (e) {
      if (e.code === 'ALREADY_SENT') setSent(true);
      Alert.alert(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (sent) return <Card style={{ backgroundColor: colors.sellSoft }}><AppText variant="bodyStrong">{t(`leads.${kind}_sent`)}</AppText></Card>;
  if (!open) return <Button variant="sell" title={t(`leads.${kind}`)} onPress={() => (authed ? setOpen(true) : onLogin())} />;
  return (
    <Card style={{ gap: spacing.sm }}>
      <AppText variant="bodyStrong">{t(`leads.${kind}_title`)}</AppText>
      <TextInput value={message} onChangeText={setMessage} multiline maxLength={1000} placeholder={t(`leads.${kind}_placeholder`)} style={styles.leadInput} />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button size="md" variant="sell" title={t('leads.submit')} loading={busy} disabled={message.trim().length < 5} onPress={submit} />
        <Button size="md" variant="ghost" title={t('common.cancel')} onPress={() => setOpen(false)} />
      </View>
    </Card>
  );
};

export const ListingDetailScreen = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const current = useAppSelector((s) => s.location.current);
  const unit = useAppSelector((s) => s.app.bootstrap?.location?.distanceUnit);
  const [ad, setAd] = useState(null);
  const [failed, setFailed] = useState(false);
  const [slide, setSlide] = useState(0);
  const gallery = useRef(null);

  const load = () => {
    setFailed(false);
    listingsApi
      .detail(id, current ? { lat: current.lat, lng: current.lng } : undefined)
      .then(({ data }) => setAd(data))
      .catch(() => setFailed(true));
  };

  useEffect(() => {
    setAd(null);
    load();
    listingsApi.view(id).catch(() => {});
  }, [id, i18n.language]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = useAppSelector((s) => s.session.status);
  const [opening, setOpening] = useState(false);
  const startChat = async () => {
    if (status !== 'authenticated') return navigate('/login');
    setOpening(true);
    try {
      const { data } = await chatApi.start(ad.id);
      navigate(`/chat/${data.id}`);
    } catch (e) {
      Alert.alert(errorText(e));
    } finally {
      setOpening(false);
    }
  };

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: ad.title, url });
      else {
        await navigator.clipboard.writeText(url);
        Alert.alert(t('listing.share'), url);
      }
    } catch {
      /* cancelled */
    }
  };

  const act = async (name) => {
    try {
      await listingsApi.action(id, name);
      load();
    } catch (e) {
      Alert.alert(errorText(e));
    }
  };

  if (failed) {
    return (
      <View style={styles.fill}>
        <View style={styles.back}><Pressable onPress={() => navigate(-1)}><ArrowLeft size={24} color={colors.text} /></Pressable></View>
        <EmptyState icon={<FileX size={44} color={colors.textMuted} />} title={t('listing.unavailable')} action={<Button title={t('common.back')} variant="outline" onPress={() => navigate(-1)} />} />
      </View>
    );
  }
  if (!ad) {
    return (
      <View style={[styles.fill, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const photos = ad.media;
  const onScroll = (e) => {
    const el = e.target;
    setSlide(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <View style={styles.fill}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        {/* gallery */}
        <View style={styles.galleryWrap}>
          {photos.length > 0 ? (
            <div ref={gallery} onScroll={onScroll} style={{ display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', height: '100%' }}>
              {photos.map((u) => (
                <img key={u} src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', flex: '0 0 100%', scrollSnapAlign: 'start' }} />
              ))}
            </div>
          ) : (
            <View style={[styles.noImg]}><ImageOff size={40} color={colors.textSubtle} /></View>
          )}
          <View style={styles.overlayLeft}>
            <Pressable accessibilityLabel={t('common.back')} onPress={() => navigate(-1)} style={styles.round}><ArrowLeft size={22} color={colors.text} /></Pressable>
          </View>
          <View style={styles.overlayRight}>
            <Pressable accessibilityLabel={t('listing.share')} onPress={share} style={styles.round}><Share2 size={20} color={colors.text} /></Pressable>
            {!ad.isOwner && <FavouriteButton listing={ad} />}
          </View>
          {photos.length > 1 && (
            <View style={styles.counter}><AppText variant="small" color={colors.white}>{slide + 1}/{photos.length}</AppText></View>
          )}
        </View>

        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <View>
            <AppText style={styles.price}>{formatPrice(ad.price, t, i18n.language)}</AppText>
            {ad.price.type === 'negotiable' && <AppText variant="caption" color={colors.sell}>{t('listing.negotiable')}</AppText>}
          </View>
          <AppText variant="h2">{ad.title}</AppText>

          <View style={styles.pills}>
            {ad.listingType !== 'sell' && <Pill label={t(`listing.type_${ad.listingType}`)} tone="blue" />}
            {ad.condition && <Pill label={t(`listing.condition_${ad.condition}`)} />}
            {['sold', 'pending_review', 'rejected', 'paused', 'expired'].includes(ad.status) && <Pill label={t(`status.${ad.status}`)} tone="amber" />}
          </View>

          <View style={styles.row}>
            <MapPin size={16} color={colors.textMuted} />
            <AppText color={colors.textMuted} style={{ flex: 1 }}>
              {ad.place}
              {ad.distanceKm != null ? ` · ${t('listing.away', { distance: formatDistance(ad.distanceKm, unit) })}` : ''}
            </AppText>
          </View>

          {ad.status === 'rejected' && ad.rejectReason && <Card style={{ backgroundColor: colors.warmSoft }}><AppText>{t('myListings.reason', { reason: ad.rejectReason })}</AppText></Card>}

          {ad.attributes.length > 0 && (
            <View>
              <AppText variant="h3" style={{ marginBottom: spacing.sm }}>{t('listing.details')}</AppText>
              <Card style={{ padding: 0 }}>
                {ad.attributes.map((a, i) => (
                  <View key={a.key} style={[styles.attr, i > 0 && { borderTopWidth: 1, borderTopColor: colors.divider }]}>
                    <AppText color={colors.textMuted} style={{ flex: 1 }}>{a.label}</AppText>
                    <AppText variant="bodyStrong" style={{ flex: 1, textAlign: 'right' }}>
                      {typeof a.value === 'boolean' ? (a.value ? t('listing.yes') : t('listing.no')) : a.value}
                    </AppText>
                  </View>
                ))}
              </Card>
            </View>
          )}

          <View>
            <AppText variant="h3" style={{ marginBottom: spacing.sm }}>{t('listing.description')}</AppText>
            <AppText style={{ lineHeight: 24 }}>{ad.description}</AppText>
          </View>

          <View>
            <AppText variant="h3" style={{ marginBottom: spacing.sm }}>{t('listing.location')}</AppText>
            <Card>
              <AppText variant="bodyStrong">{ad.location.label}</AppText>
              {!ad.isOwner && <AppText variant="caption" color={colors.textMuted}>{t('listing.approxLocation')}</AppText>}
            </Card>
          </View>

          {ad.seller && (
            <View>
              <AppText variant="h3" style={{ marginBottom: spacing.sm }}>{t('listing.seller')}</AppText>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                {ad.seller.avatar ? (
                  <Image source={{ uri: ad.seller.avatar }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }]}>
                    <AppText variant="h3" color={colors.primary}>{(ad.seller.name ?? '?').charAt(0).toUpperCase()}</AppText>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong">{ad.seller.name}</AppText>
                  <AppText variant="caption" color={colors.textMuted}>{t('listing.memberSince', { date: formatDate(ad.seller.memberSince, i18n.language) })}</AppText>
                </View>
                {ad.seller.phoneVerified && <BadgeCheck size={20} color={colors.verified} />}
              </Card>
            </View>
          )}

          {!ad.isOwner && ad.status === 'published' && ['job', 'service'].includes(ad.listingType) && <LeadBox ad={ad} authed={status === 'authenticated'} onLogin={() => navigate('/login')} />}
          {!ad.isOwner && ad.status === 'published' && <Button title={t('chat.chatWithSeller')} variant={['job', 'service'].includes(ad.listingType) ? 'outline' : 'primary'} loading={opening} onPress={startChat} />}
          {ad.isOwner && ['job', 'service'].includes(ad.listingType) && <Button title={t('leads.viewReceived')} variant="outline" onPress={() => navigate(`/leads/received?listing=${ad.id}`)} />}

          {ad.isOwner && (
            <Card style={{ gap: spacing.sm }}>
              <AppText variant="bodyStrong">{t('listing.yourAd')}</AppText>
              {ad.stats && <AppText variant="caption" color={colors.textMuted}>{t('myListings.views', { count: ad.stats.views })} · ♥ {ad.stats.favourites}</AppText>}
              <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                {!['sold', 'removed'].includes(ad.status) && <Button size="md" variant="outline" title={t('myListings.edit')} onPress={() => navigate(`/sell/${ad.id}`)} />}
                {ad.status === 'published' && <Button size="md" variant="outline" title={t('myListings.pause')} onPress={() => act('pause')} />}
                {ad.status === 'paused' && <Button size="md" variant="outline" title={t('myListings.resume')} onPress={() => act('resume')} />}
                {['published', 'paused'].includes(ad.status) && <Button size="md" variant="outline" title={t('myListings.markSold')} onPress={() => act('sold')} />}
                {ad.status === 'expired' && <Button size="md" title={t('myListings.renew')} onPress={() => act('renew')} />}
              </View>
            </Card>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  leadInput: { minHeight: 96, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: 16 },
  fill: { flex: 1, backgroundColor: colors.white },
  back: { padding: spacing.lg },
  galleryWrap: { height: 280, backgroundColor: colors.surface },
  noImg: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  overlayLeft: { position: 'absolute', top: spacing.md, left: spacing.md },
  overlayRight: { position: 'absolute', top: spacing.md, right: spacing.md, flexDirection: 'row', gap: spacing.sm },
  round: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  counter: { position: 'absolute', bottom: spacing.md, right: spacing.md, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  price: { fontSize: 26, lineHeight: 32, fontWeight: '800', color: colors.primary },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pill: { backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  attr: { flexDirection: 'row', padding: spacing.md, gap: spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24 },
});
