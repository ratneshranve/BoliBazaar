import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CheckCircle2, ChevronRight, FileClock, ImagePlus, MapPin, Plus, Trash2, Video, X } from 'lucide-react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from '../components/primitives';
import { AppText, Button, Card, Field } from '../components/ui';
import { DynamicFields } from '../components/DynamicFields';
import { PlacePicker } from '../components/PlacePicker';
import { Sheet } from '../components/Sheet';
import { colors, radius, spacing } from '@theme/tokens';
import { auctionsApi, categoriesApi, listingsApi, paymentsApi, uploadsApi } from '../api/endpoints';
import { ApiError } from '../api/client';
import { useAppSelector } from '../store';
import { errorText } from '../i18n';

const PRICE_TYPES = ['fixed', 'negotiable', 'on_request', 'free'];
const CONDITIONS = ['new', 'used', 'refurbished'];
const SHIP_COVERAGE = ['city', 'state', 'country', 'worldwide'];
const SHIP_FEE_TYPES = ['free', 'paid', 'discuss'];
const SHIPPABLE = ['sell', 'auction', 'business'];
const NO_SHIPPING = { delivery: false, coverage: '', feeType: '', fee: '', note: '' };
/** Duration presets in hours (1, 3, 5, 7 and 10 days). */
const DURATIONS = [24, 72, 120, 168, 240];
const MAX_QUESTIONS = 5;
/** Length of a picked video file, read in the browser. */
const videoSeconds = (file) =>
  new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(v.src);
      resolve(v.duration);
    };
    v.onerror = () => resolve(null);
    v.src = URL.createObjectURL(file);
  });
const EMPTY_AUCTION = { startingBid: '', reservePrice: '', buyNowPrice: '', increment: '', startAt: '', durationHours: 72, registrationRequired: false, registrationApproval: 'auto', inspection: { address: '', note: '', slots: [] } };

/** Date → value for <input type="datetime-local"> in the viewer's own time zone. */
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const Chip = ({ label, active, onPress }) => (
  <Pressable onPress={onPress} style={[styles.chip, active && styles.chipOn]}>
    <AppText variant="bodyStrong" color={active ? colors.white : colors.text}>{label}</AppText>
  </Pressable>
);

const Section = ({ title, children, error }) => (
  <View style={{ gap: spacing.sm }}>
    <AppText variant="h3">{title}</AppText>
    {children}
    {!!error && <AppText variant="caption" color={colors.danger}>{error}</AppText>}
  </View>
);

/** Drill down the category tree and pick a leaf (the most specific category). */
function CategorySheet({ tree, onPick, onClose }) {
  const { t } = useTranslation();
  const [trail, setTrail] = useState([]);
  const level = trail.length ? trail[trail.length - 1].children : tree;
  return (
    <Sheet title={trail.length ? trail[trail.length - 1].name : t('sell.chooseCategory')} onClose={onClose} tall>
      {trail.length > 0 && (
        <Pressable onPress={() => setTrail(trail.slice(0, -1))} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <ArrowLeft size={18} color={colors.primary} />
          <AppText variant="bodyStrong" color={colors.primary}>{t('common.back')}</AppText>
        </Pressable>
      )}
      <View style={{ gap: 0 }}>
        {level.map((c) => (
          <Pressable key={c.id} onPress={() => (c.children.length ? setTrail([...trail, c]) : onPick(c))} style={styles.catRow}>
            <AppText variant="bodyStrong" style={{ flex: 1 }}>{c.name}</AppText>
            {c.children.length > 0 && <ChevronRight size={18} color={colors.textMuted} />}
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

/**
 * Post an ad (/sell) or edit one (/sell/:id). Form fields come from the chosen category.
 * Choosing the "Auction" type swaps the price for auction settings (/sell?type=auction, edit at /auctions/:auctionId/edit).
 */
export const SellScreen = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id, auctionId } = useParams();
  const [query] = useSearchParams();
  const editing = Boolean(id || auctionId);
  const auctionsOn = useAppSelector((s) => s.app.bootstrap?.auctions?.enabled);
  const current = useAppSelector((s) => s.location.current);
  const settings = useAppSelector((s) => s.app.bootstrap?.location);

  const [tree, setTree] = useState(null);
  const [category, setCategory] = useState(null); // category detail: fields, listingTypes, rules
  const [loading, setLoading] = useState(editing);
  const [sheet, setSheet] = useState(null); // 'category' | 'place'
  const [photos, setPhotos] = useState([]); // { key, url, mediaId, uploading, error }
  const [form, setForm] = useState({ listingType: query.get('type') === 'auction' ? 'auction' : '', title: '', description: '', condition: '', priceType: 'fixed', amount: '', attributes: {} });
  const [auction, setAuction] = useState(EMPTY_AUCTION);
  const [shipping, setShipping] = useState(NO_SHIPPING);
  const ship = (patch) => setShipping((v) => ({ ...v, ...patch }));
  const setA = (patch) => setAuction((a) => ({ ...a, ...patch }));
  const [commission, setCommission] = useState(null);
  useEffect(() => {
    if (form.listingType === 'auction' && commission === null) paymentsApi.catalog().then(({ data }) => setCommission(data.auctionCommission || '')).catch(() => setCommission(''));
  }, [form.listingType]); // eslint-disable-line react-hooks/exhaustive-deps
  const [place, setPlace] = useState(current ? { ...current, scope: undefined } : null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null); // { id, status }
  const fileInput = useRef(null);
  const videoInput = useRef(null);
  const [video, setVideo] = useState(null); // { url, mediaId, uploading }
  const [screening, setScreening] = useState([]); // job ads: questions for applicants
  const uploadLimits = useAppSelector((s) => s.app.bootstrap?.uploads);
  const participationFee = useAppSelector((s) => s.app.bootstrap?.auctions?.participationFee) || 0;
  const currencyCode = useAppSelector((s) => s.app.bootstrap?.marketplace?.currency);
  const participationFeeText = participationFee && currencyCode ? new Intl.NumberFormat(currencyCode === 'INR' ? 'en-IN' : undefined, { style: 'currency', currency: currencyCode, maximumFractionDigits: 0 }).format(participationFee) : '';
  // drafts: unfinished ads are saved while typing (new ads only)
  const [draftId, setDraftId] = useState(query.get('draft'));
  const [drafts, setDrafts] = useState(null);
  const [draftState, setDraftState] = useState(''); // '' | 'saving' | 'saved'
  const restoring = useRef(Boolean(query.get('draft')));

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setAttr = (key, value) => setForm((f) => ({ ...f, attributes: { ...f.attributes, [key]: value } }));

  useEffect(() => {
    categoriesApi.tree().then(({ data }) => setTree(data)).catch(() => setTree([]));
  }, []);

  const chooseCategory = async (c) => {
    setSheet(null);
    const { data } = await categoriesApi.detail(c.id);
    setCategory(data);
    const types = data.listingTypes.filter((x) => x !== 'auction' || auctionsOn);
    set({ listingType: types.includes(form.listingType) ? form.listingType : types[0] ?? 'sell', attributes: {} });
  };

  // editing: load the ad and its category
  useEffect(() => {
    if (!editing) return;
    (async () => {
      try {
        const auctionData = auctionId ? (await auctionsApi.forEdit(auctionId)).data : null;
        const { data } = await listingsApi.forEdit(auctionData ? auctionData.listingId : id);
        if (auctionData) {
          const a = auctionData.auction;
          const str = (v) => (v == null ? '' : String(v));
          setAuction({
            startingBid: str(a.startingBid), reservePrice: str(a.reservePrice), buyNowPrice: str(a.buyNowPrice), increment: str(a.increment), startAt: toLocalInput(a.startAt), durationHours: a.durationHours,
            registrationRequired: Boolean(a.registrationRequired), registrationApproval: a.registrationApproval || 'auto',
            inspection: { address: a.inspection?.address || '', note: a.inspection?.note || '', slots: (a.inspection?.slots || []).map((s) => ({ from: toLocalInput(s.from), to: toLocalInput(s.to) })) },
          });
        }
        const cat = (await categoriesApi.detail(data.categoryId)).data;
        setCategory(cat);
        setForm({
          listingType: data.listingType,
          title: data.title,
          description: data.description,
          condition: data.condition ?? '',
          priceType: data.price.type,
          amount: data.price.amount != null ? String(data.price.amount) : '',
          attributes: data.attributes,
        });
        if (data.shipping?.delivery) setShipping({ delivery: true, coverage: data.shipping.coverage, feeType: data.shipping.feeType, fee: data.shipping.fee != null ? String(data.shipping.fee) : '', note: data.shipping.note || '' });
        setPhotos(data.media.map((m) => ({ key: m.mediaId, mediaId: m.mediaId, url: m.url })));
        setVideo(data.video || null);
        setScreening(data.screening || []);
        setPlace(data.location);
      } catch (e) {
        setFormError(errorText(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id, auctionId, editing]);

  const maxPhotos = category?.rules.maxPhotos ?? 10;

  /* ───── drafts ───── */
  useEffect(() => {
    if (editing) return;
    listingsApi.drafts().then(({ data }) => setDrafts(data)).catch(() => setDrafts([]));
  }, [editing]);

  const restoreDraft = async (d) => {
    restoring.current = true;
    const x = d.data || {};
    setDraftId(d.id);
    if (x.categoryId) {
      try {
        setCategory((await categoriesApi.detail(x.categoryId)).data);
      } catch {
        /* category no longer available: the seller picks again */
      }
    }
    if (x.form) setForm(x.form);
    if (x.auction) setAuction(x.auction);
    if (x.shipping) setShipping(x.shipping);
    if (x.place) setPlace(x.place);
    setPhotos((x.photos || []).map((p) => ({ key: p.mediaId, mediaId: p.mediaId, url: p.url })));
    setVideo(x.video || null);
    setScreening(x.screening || []);
    setTimeout(() => (restoring.current = false), 0);
  };

  // open /sell?draft=<id> straight into that draft
  useEffect(() => {
    const want = query.get('draft');
    if (!want || !drafts) return;
    const d = drafts.find((x) => x.id === want);
    if (d) restoreDraft(d);
    else restoring.current = false;
  }, [drafts]); // eslint-disable-line react-hooks/exhaustive-deps

  // autosave 1.5 s after the last change, once there is something worth keeping
  useEffect(() => {
    if (editing || done || restoring.current) return undefined;
    if (!category && !form.title.trim()) return undefined;
    const data = {
      categoryId: category?.id,
      form,
      auction,
      shipping,
      place,
      photos: photos.filter((p) => p.mediaId).map((p) => ({ mediaId: p.mediaId, url: p.url })),
      video: video?.mediaId ? { mediaId: video.mediaId, url: video.url } : null,
      screening,
    };
    const title = form.title.trim() || category?.name || '';
    const timer = setTimeout(async () => {
      setDraftState('saving');
      try {
        if (draftId) await listingsApi.saveDraft(draftId, { title, data });
        else setDraftId((await listingsApi.createDraft({ title, data })).data.id);
        setDraftState('saved');
      } catch {
        setDraftState('');
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [category, form, auction, shipping, place, photos, video, screening]); // eslint-disable-line react-hooks/exhaustive-deps

  const removeDraft = async (d) => {
    if (!window.confirm(t('sell.deleteDraftConfirm'))) return;
    await listingsApi.deleteDraft(d.id).catch(() => {});
    setDrafts((x) => x.filter((y) => y.id !== d.id));
  };

  /* ───── video ───── */
  const addVideo = async (file) => {
    if (!file) return;
    setFormError('');
    const maxMb = uploadLimits?.maxVideoMb ?? 50;
    const maxSec = uploadLimits?.maxVideoSeconds ?? 60;
    if (file.size > maxMb * 1024 * 1024) return setFormError(t('sell.videoTooBig', { mb: maxMb }));
    const secs = await videoSeconds(file);
    if (secs && secs > maxSec + 0.5) return setFormError(t('sell.videoTooLong', { seconds: maxSec }));
    setVideo({ url: URL.createObjectURL(file), uploading: true });
    try {
      const { data } = await uploadsApi.video(file);
      setVideo({ url: data.url, mediaId: data.id });
    } catch (e) {
      setVideo(null);
      setFormError(errorText(e));
    }
  };

  const addPhotos = async (files) => {
    const room = maxPhotos - photos.length;
    for (const file of Array.from(files).slice(0, Math.max(0, room))) {
      const key = `${Date.now()}-${Math.random()}`;
      setPhotos((p) => [...p, { key, url: URL.createObjectURL(file), uploading: true }]);
      try {
        const { data } = await uploadsApi.image(file);
        setPhotos((p) => p.map((x) => (x.key === key ? { key, url: data.url, mediaId: data.id } : x)));
      } catch (e) {
        setPhotos((p) => p.filter((x) => x.key !== key));
        setFormError(errorText(e));
      }
    }
  };

  const submit = async () => {
    setErrors({});
    setFormError('');
    const local = {};
    if (!category) local.category = t('sell.pickLeaf');
    if (!place) local.location = t('sell.chooseLocation');
    if (Object.keys(local).length) return setErrors(local);

    const isAuction = form.listingType === 'auction';
    const num = (v) => (v === '' || v == null ? null : Number(v));
    const body = {
      categoryId: category.id,
      listingType: form.listingType,
      title: form.title.trim(),
      description: form.description.trim(),
      condition: form.condition || undefined,
      price: { type: form.priceType, ...(['fixed', 'negotiable'].includes(form.priceType) ? { amount: Number(form.amount) } : {}) },
      attributes: Object.fromEntries(Object.entries(form.attributes).filter(([, v]) => v !== undefined && v !== '')),
      mediaIds: photos.filter((p) => p.mediaId).map((p) => p.mediaId),
      videoId: video?.mediaId || null,
      ...(form.listingType === 'job' ? { screening: screening.map((q) => q.trim()).filter(Boolean) } : {}),
      location: { label: place.label, name: place.name, placeId: place.placeId, lat: place.lat, lng: place.lng, address: place.address ?? {} },
      shipping:
        shipping.delivery && SHIPPABLE.includes(form.listingType)
          ? { delivery: true, coverage: shipping.coverage || undefined, feeType: shipping.feeType || undefined, ...(shipping.feeType === 'paid' ? { fee: Number(shipping.fee) } : {}), note: shipping.note.trim() || undefined }
          : { delivery: false },
    };
    if (isAuction) {
      delete body.listingType;
      delete body.price;
      body.auction = {
        startingBid: num(auction.startingBid),
        reservePrice: num(auction.reservePrice),
        buyNowPrice: num(auction.buyNowPrice),
        increment: num(auction.increment),
        startAt: auction.startAt ? new Date(auction.startAt).toISOString() : null,
        durationHours: Number(auction.durationHours),
        registrationRequired: Boolean(auction.registrationRequired),
        registrationApproval: auction.registrationApproval,
        inspection: {
          address: auction.inspection.address.trim() || undefined,
          note: auction.inspection.note.trim() || undefined,
          slots: auction.inspection.slots.filter((s) => s.from && s.to).map((s) => ({ from: new Date(s.from).toISOString(), to: new Date(s.to).toISOString() })),
        },
      };
    }

    setSaving(true);
    try {
      let result;
      if (isAuction) {
        const { data } = auctionId ? await auctionsApi.update(auctionId, body) : await auctionsApi.create(body);
        result = { id: data.id, status: data.status, auction: true };
      } else {
        const { data } = editing ? await listingsApi.update(id, body) : await listingsApi.create(body);
        result = data;
      }
      if (draftId) await listingsApi.deleteDraft(draftId).catch(() => {}); // posted: the draft is done
      setDone(result);
    } catch (e) {
      if (e instanceof ApiError && e.details?.fields) {
        const fe = {};
        for (const [k, v] of Object.entries(e.details.fields)) fe[k.replace(/^attributes\./, 'attr.')] = v;
        setErrors(fe);
        setFormError(errorText(e));
      } else setFormError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  /* ───── success ───── */
  if (done) {
    return (
      <View style={[styles.fill, { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md }]}>
        <CheckCircle2 size={64} color={colors.sell} />
        <AppText variant="h2" style={{ textAlign: 'center' }}>{done.auction ? t('sell.success_auction') : done.status === 'payment_pending' ? t('sell.success_payment') : done.status === 'published' ? t('sell.success_published') : t('sell.success_review')}</AppText>
        {done.status === 'payment_pending' && <Button title={t('myListings.payFee')} onPress={() => navigate(`/pay?purpose=listing_fee&refId=${done.id}`, { replace: true })} style={{ alignSelf: 'stretch' }} />}
        <View style={{ alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.lg }}>
          <Button title={done.auction ? t('auction.view') : t('sell.viewAd')} onPress={() => navigate(done.auction ? `/auctions/${done.id}` : `/listing/${done.id}`, { replace: true })} />
          {!editing && <Button variant="outline" title={t('sell.postAnother')} onPress={() => window.location.assign('/sell')} />}
        </View>
      </View>
    );
  }

  if (loading) return <View style={[styles.fill, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={colors.primary} /></View>;

  const types = (category?.listingTypes.filter((x) => x !== 'auction' || auctionsOn) ?? []).filter((x) => !editing || (x === 'auction') === Boolean(auctionId));
  const isAuction = form.listingType === 'auction';
  const aErr = (k) => errors[`auction.${k}`];
  const needsAmount = ['fixed', 'negotiable'].includes(form.priceType);

  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={t('common.back')} onPress={() => navigate(-1)}><ArrowLeft size={24} color={colors.text} /></Pressable>
        <AppText variant="h3">{auctionId ? t('auction.editTitle') : editing ? t('sell.editTitle') : isAuction ? t('auction.createTitle') : t('sell.title')}</AppText>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxxl }}>
        {editing && <Card style={{ backgroundColor: colors.warmSoft }}><AppText variant="caption">{t('sell.reviewNote')}</AppText></Card>}
        {!editing && !category && !draftId && drafts?.length > 0 && (
          <Section title={t('sell.drafts')}>
            {drafts.map((d) => (
              <View key={d.id} style={styles.draftRow}>
                <FileClock size={20} color={colors.textMuted} />
                <Pressable onPress={() => restoreDraft(d)} style={{ flex: 1 }}>
                  <AppText variant="bodyStrong" numberOfLines={1}>{d.title || t('sell.untitledDraft')}</AppText>
                  <AppText variant="caption" color={colors.textMuted}>{t('sell.draftSaved', { time: new Date(d.updatedAt).toLocaleString() })}</AppText>
                </Pressable>
                <Pressable accessibilityLabel={t('sell.deleteDraft')} onPress={() => removeDraft(d)}><Trash2 size={18} color={colors.textMuted} /></Pressable>
              </View>
            ))}
          </Section>
        )}
        {!editing && draftState === 'saved' && <AppText variant="caption" color={colors.textMuted}>{t('sell.draftAutosaved')}</AppText>}

        {/* category */}
        <Section title={t('sell.category')} error={errors.category}>
          <Pressable disabled={editing} onPress={() => setSheet('category')} style={styles.picker}>
            <AppText variant="bodyStrong" color={category ? colors.text : colors.textSubtle} style={{ flex: 1 }}>{category?.name ?? t('sell.chooseCategory')}</AppText>
            {!editing && <AppText variant="bodyStrong" color={colors.primary}>{category ? t('sell.change') : ''}</AppText>}
            {!editing && <ChevronRight size={18} color={colors.textMuted} />}
          </Pressable>
        </Section>

        {category && (
          <>
            {/* photos */}
            <Section title={t('sell.photos')} error={errors.mediaIds}>
              <AppText variant="caption" color={colors.textMuted}>{t('sell.photosHint', { max: maxPhotos })}</AppText>
              <View style={styles.photoGrid}>
                {photos.map((p, i) => (
                  <View key={p.key} style={styles.photo}>
                    <Image source={{ uri: p.url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    {p.uploading && <View style={styles.photoBusy}><ActivityIndicator color={colors.white} /></View>}
                    {i === 0 && !p.uploading && <View style={styles.cover}><AppText variant="small" color={colors.white}>1</AppText></View>}
                    <Pressable accessibilityLabel="Remove" onPress={() => setPhotos((x) => x.filter((y) => y.key !== p.key))} style={styles.photoX}><X size={14} color={colors.white} /></Pressable>
                  </View>
                ))}
                {photos.length < maxPhotos && (
                  <Pressable onPress={() => fileInput.current?.click()} style={[styles.photo, styles.addPhoto]}>
                    <ImagePlus size={24} color={colors.primary} />
                    <AppText variant="small" color={colors.primary}>{t('sell.addPhoto')}</AppText>
                  </Pressable>
                )}
              </View>
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: 'none' }} onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
            </Section>

            {/* video (one per ad, unless the category turns it off) */}
            {category.rules.allowVideo !== false && (
              <Section title={t('sell.video')}>
                <AppText variant="caption" color={colors.textMuted}>{t('sell.videoHint', { seconds: uploadLimits?.maxVideoSeconds ?? 60, mb: uploadLimits?.maxVideoMb ?? 50 })}</AppText>
                {video ? (
                  <View style={styles.videoBox}>
                    <video src={video.url} controls preload="metadata" style={{ width: '100%', maxHeight: 220, borderRadius: 12, background: '#000' }} />
                    {video.uploading && <View style={styles.photoBusy}><ActivityIndicator color={colors.white} /></View>}
                    {!video.uploading && <Pressable accessibilityLabel={t('sell.removeVideo')} onPress={() => setVideo(null)} style={styles.photoX}><X size={14} color={colors.white} /></Pressable>}
                  </View>
                ) : (
                  <Pressable onPress={() => videoInput.current?.click()} style={[styles.picker, { borderStyle: 'dashed', borderColor: colors.primary }]}>
                    <Video size={20} color={colors.primary} />
                    <AppText variant="bodyStrong" color={colors.primary}>{t('sell.addVideo')}</AppText>
                  </Pressable>
                )}
                <input ref={videoInput} type="file" accept="video/mp4,video/webm,video/quicktime" style={{ display: 'none' }} onChange={(e) => { addVideo(e.target.files?.[0]); e.target.value = ''; }} />
              </Section>
            )}

            {/* type */}
            {types.length > 1 && (
              <Section title={t('sell.type')} error={errors.listingType}>
                <View style={styles.chips}>
                  {types.map((x) => <Chip key={x} label={t(`listing.type_${x}`)} active={form.listingType === x} onPress={() => set({ listingType: x })} />)}
                </View>
              </Section>
            )}

            {/* basics */}
            <Section title={t('sell.adTitle')} error={errors.title}>
              <Field value={form.title} onChangeText={(v) => set({ title: v })} maxLength={80} error={errors.title ? ' ' : undefined} />
            </Section>
            <Section title={t('sell.adDescription')} error={errors.description}>
              <Field value={form.description} onChangeText={(v) => set({ description: v })} maxLength={2000} multiline style={{ minHeight: 110 }} error={errors.description ? ' ' : undefined} />
            </Section>

            {/* auction settings */}
            {isAuction && (
              <Section title={t('auction.settings')}>
                <AppText variant="caption" color={colors.textMuted}>{t('auction.settingsHint')}</AppText>
                <Field value={auction.startingBid} onChangeText={(v) => setA({ startingBid: v.replace(/\D/g, '') })} placeholder={t('auction.startingBid')} keyboardType="number-pad" error={aErr('startingBid')} />
                <Field value={auction.reservePrice} onChangeText={(v) => setA({ reservePrice: v.replace(/\D/g, '') })} placeholder={t('auction.reserveOptional')} keyboardType="number-pad" error={aErr('reservePrice')} />
                <Field value={auction.buyNowPrice} onChangeText={(v) => setA({ buyNowPrice: v.replace(/\D/g, '') })} placeholder={t('auction.buyNowOptional')} keyboardType="number-pad" error={aErr('buyNowPrice')} />
                <Field value={auction.increment} onChangeText={(v) => setA({ increment: v.replace(/\D/g, '') })} placeholder={t('auction.stepOptional')} keyboardType="number-pad" error={aErr('increment')} />
                <AppText variant="bodyStrong" style={{ marginTop: spacing.sm }}>{t('auction.duration')}</AppText>
                <View style={styles.chips}>
                  {DURATIONS.map((h) => <Chip key={h} label={t('auction.days', { count: h / 24 })} active={Number(auction.durationHours) === h} onPress={() => setA({ durationHours: h })} />)}
                </View>
                {!!aErr('durationHours') && <AppText variant="caption" color={colors.danger}>{aErr('durationHours')}</AppText>}
                <AppText variant="bodyStrong" style={{ marginTop: spacing.sm }}>{t('auction.startAt')}</AppText>
                <input type="datetime-local" value={auction.startAt} onChange={(e) => setA({ startAt: e.target.value })} style={{ height: 48, border: `1px solid ${aErr('startAt') ? colors.danger : colors.border}`, borderRadius: 10, padding: '0 12px', fontSize: 16 }} />
                <AppText variant="caption" color={aErr('startAt') ? colors.danger : colors.textMuted}>{aErr('startAt') || t('auction.startAtHint')}</AppText>
                {!!commission && <AppText variant="caption" color={colors.text} style={{ marginTop: spacing.sm }}>{commission}</AppText>}
              </Section>
            )}

            {/* who may bid: registration */}
            {isAuction && (
              <Section title={t('auction.regSettings')}>
                <View style={styles.chips}>
                  <Chip label={t('auction.regOpen')} active={!auction.registrationRequired} onPress={() => setA({ registrationRequired: false })} />
                  <Chip label={t('auction.regRequired')} active={auction.registrationRequired} onPress={() => setA({ registrationRequired: true })} />
                </View>
                {auction.registrationRequired && (
                  <>
                    <AppText variant="caption" color={colors.textMuted}>{t('auction.regSettingsHint', { fee: participationFee ? participationFeeText : t('auction.regNoFee') })}</AppText>
                    <View style={styles.chips}>
                      <Chip label={t('auction.regApprovalAuto')} active={auction.registrationApproval === 'auto'} onPress={() => setA({ registrationApproval: 'auto' })} />
                      <Chip label={t('auction.regApprovalManual')} active={auction.registrationApproval === 'manual'} onPress={() => setA({ registrationApproval: 'manual' })} />
                    </View>
                  </>
                )}
              </Section>
            )}

            {/* viewing the item */}
            {isAuction && (
              <Section title={t('auction.inspection')} error={errors['auction.inspection']}>
                <AppText variant="caption" color={colors.textMuted}>{t('auction.inspectionHint')}</AppText>
                <Field value={auction.inspection.address} onChangeText={(v) => setA({ inspection: { ...auction.inspection, address: v } })} maxLength={300} placeholder={t('auction.inspectionAddress')} />
                {auction.inspection.slots.map((s, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                    <input type="datetime-local" value={s.from} onChange={(e) => setA({ inspection: { ...auction.inspection, slots: auction.inspection.slots.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)) } })} style={styles.dt} aria-label={t('auction.slotFrom')} />
                    <AppText>–</AppText>
                    <input type="datetime-local" value={s.to} onChange={(e) => setA({ inspection: { ...auction.inspection, slots: auction.inspection.slots.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)) } })} style={styles.dt} aria-label={t('auction.slotTo')} />
                    <Pressable accessibilityLabel={t('auction.removeSlot')} onPress={() => setA({ inspection: { ...auction.inspection, slots: auction.inspection.slots.filter((_, j) => j !== i) } })}><Trash2 size={18} color={colors.textMuted} /></Pressable>
                  </View>
                ))}
                {auction.inspection.slots.length < 10 && <Button size="md" variant="outline" title={t('auction.addSlot')} icon={<Plus size={16} color={colors.primary} />} onPress={() => setA({ inspection: { ...auction.inspection, slots: [...auction.inspection.slots, { from: '', to: '' }] } })} />}
                <Field value={auction.inspection.note} onChangeText={(v) => setA({ inspection: { ...auction.inspection, note: v } })} maxLength={300} placeholder={t('auction.inspectionNote')} />
              </Section>
            )}

            {/* price */}
            {!isAuction && (
            <Section title={t('sell.price')} error={errors['price.amount']}>
              <View style={styles.chips}>
                {PRICE_TYPES.map((p) => <Chip key={p} label={t(`sell.priceType_${p}`)} active={form.priceType === p} onPress={() => set({ priceType: p })} />)}
              </View>
              {needsAmount && <Field value={form.amount} onChangeText={(v) => set({ amount: v.replace(/[^\d.]/g, '') })} placeholder={t('sell.amount')} keyboardType="number-pad" />}
            </Section>
            )}

            {/* delivery (physical goods only) */}
            {SHIPPABLE.includes(form.listingType) && (
              <Section title={t('sell.delivery')} error={errors['shipping.coverage'] || errors['shipping.feeType'] || errors['shipping.fee']}>
                <View style={styles.chips}>
                  <Chip label={t('sell.pickupOnly')} active={!shipping.delivery} onPress={() => ship({ delivery: false })} />
                  <Chip label={t('sell.canDeliver')} active={shipping.delivery} onPress={() => ship({ delivery: true })} />
                </View>
                {shipping.delivery && (
                  <>
                    <AppText variant="caption" color={colors.textMuted}>{t('sell.deliverWhere')}</AppText>
                    <View style={styles.chips}>
                      {SHIP_COVERAGE.map((c) => <Chip key={c} label={t(`sell.shipCoverage_${c}`)} active={shipping.coverage === c} onPress={() => ship({ coverage: c })} />)}
                    </View>
                    <AppText variant="caption" color={colors.textMuted}>{t('sell.deliveryCharge')}</AppText>
                    <View style={styles.chips}>
                      {SHIP_FEE_TYPES.map((f) => <Chip key={f} label={t(`listing.shipFee_${f}`)} active={shipping.feeType === f} onPress={() => ship({ feeType: f })} />)}
                    </View>
                    {shipping.feeType === 'paid' && <Field value={shipping.fee} onChangeText={(v) => ship({ fee: v.replace(/[^\d.]/g, '') })} placeholder={t('sell.deliveryFee')} keyboardType="number-pad" />}
                    <Field value={shipping.note} onChangeText={(v) => ship({ note: v })} placeholder={t('sell.deliveryNotePh')} maxLength={200} />
                  </>
                )}
              </Section>
            )}

            {/* condition */}
            <Section title={t('sell.condition')}>
              <View style={styles.chips}>
                {CONDITIONS.map((c) => <Chip key={c} label={t(`listing.condition_${c}`)} active={form.condition === c} onPress={() => set({ condition: form.condition === c ? '' : c })} />)}
              </View>
            </Section>

            {/* category-specific fields */}
            {category.attributes.length > 0 && (
              <Section title={t('sell.details')}>
                <DynamicFields
                  fields={category.attributes}
                  values={form.attributes}
                  errors={Object.fromEntries(Object.entries(errors).filter(([k]) => k.startsWith('attr.')).map(([k, v]) => [k.slice(5), v]))}
                  onChange={setAttr}
                />
              </Section>
            )}

            {/* job ads: questions every applicant must answer */}
            {form.listingType === 'job' && (
              <Section title={t('sell.screening')} error={errors.screening}>
                <AppText variant="caption" color={colors.textMuted}>{t('sell.screeningHint', { max: MAX_QUESTIONS })}</AppText>
                {screening.map((q, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <View style={{ flex: 1 }}>
                      <Field value={q} onChangeText={(v) => setScreening((s) => s.map((x, j) => (j === i ? v : x)))} maxLength={200} placeholder={t('sell.screeningPh')} error={errors[`screening.${i}`]} />
                    </View>
                    <Pressable accessibilityLabel={t('sell.removeQuestion')} onPress={() => setScreening((s) => s.filter((_, j) => j !== i))}><Trash2 size={18} color={colors.textMuted} /></Pressable>
                  </View>
                ))}
                {screening.length < MAX_QUESTIONS && <Button size="md" variant="outline" title={t('sell.addQuestion')} icon={<Plus size={16} color={colors.primary} />} onPress={() => setScreening((s) => [...s, ''])} />}
              </Section>
            )}

            {/* location */}
            <Section title={t('sell.location')} error={errors.location || errors['location.label']}>
              <Pressable onPress={() => setSheet('place')} style={styles.picker}>
                <MapPin size={18} color={colors.primary} />
                <AppText variant="bodyStrong" color={place ? colors.text : colors.textSubtle} style={{ flex: 1 }}>{place?.label ?? t('sell.chooseLocation')}</AppText>
                <ChevronRight size={18} color={colors.textMuted} />
              </Pressable>
            </Section>

            <AppText variant="caption" color={colors.primary} onPress={() => navigate('/page/prohibited')}>{t('sell.prohibitedLink')}</AppText>
            {!!formError && <AppText color={colors.danger}>{formError}</AppText>}
            <Button title={editing ? t('sell.saveChanges') : isAuction ? t('auction.submit') : t('sell.publish')} loading={saving} disabled={photos.some((p) => p.uploading) || Boolean(video?.uploading)} onPress={submit} />
          </>
        )}
      </ScrollView>

      {sheet === 'category' && tree && <CategorySheet tree={tree} onPick={chooseCategory} onClose={() => setSheet(null)} />}
      {sheet === 'place' && (
        <Sheet title={t('sell.location')} onClose={() => setSheet(null)} tall footer={<Button title={t('common.done')} disabled={!place} onPress={() => setSheet(null)} />}>
          <PlacePicker value={place} onChange={setPlace} popular={settings?.popularPlaces} />
        </Sheet>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  picker: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photo: { width: 84, height: 84, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface },
  addPhoto: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary, backgroundColor: colors.white },
  photoBusy: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  cover: { position: 'absolute', left: 4, bottom: 4, backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 6 },
  photoX: { position: 'absolute', right: 4, top: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  dt: { height: 44, border: `1px solid ${colors.border}`, borderRadius: 10, padding: '0 10px', fontSize: 15, flex: 1, minWidth: 180 },
  videoBox: { position: 'relative', borderRadius: 12, overflow: 'hidden' },
  draftRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
});
