import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CheckCircle2, ChevronRight, ImagePlus, MapPin, X } from 'lucide-react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from '../components/primitives';
import { AppText, Button, Card, Field } from '../components/ui';
import { DynamicFields } from '../components/DynamicFields';
import { PlacePicker } from '../components/PlacePicker';
import { Sheet } from '../components/Sheet';
import { colors, radius, spacing } from '@theme/tokens';
import { categoriesApi, listingsApi, uploadsApi } from '../api/endpoints';
import { ApiError } from '../api/client';
import { useAppSelector } from '../store';
import { errorText } from '../i18n';

const PRICE_TYPES = ['fixed', 'negotiable', 'on_request', 'free'];
const CONDITIONS = ['new', 'used', 'refurbished'];

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

/** Post an ad (/sell) or edit one (/sell/:id). Form fields come from the chosen category. */
export const SellScreen = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const editing = Boolean(id);
  const current = useAppSelector((s) => s.location.current);
  const settings = useAppSelector((s) => s.app.bootstrap?.location);

  const [tree, setTree] = useState(null);
  const [category, setCategory] = useState(null); // category detail: fields, listingTypes, rules
  const [loading, setLoading] = useState(editing);
  const [sheet, setSheet] = useState(null); // 'category' | 'place'
  const [photos, setPhotos] = useState([]); // { key, url, mediaId, uploading, error }
  const [form, setForm] = useState({ listingType: '', title: '', description: '', condition: '', priceType: 'fixed', amount: '', attributes: {} });
  const [place, setPlace] = useState(current ? { ...current, scope: undefined } : null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null); // { id, status }
  const fileInput = useRef(null);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setAttr = (key, value) => setForm((f) => ({ ...f, attributes: { ...f.attributes, [key]: value } }));

  useEffect(() => {
    categoriesApi.tree().then(({ data }) => setTree(data)).catch(() => setTree([]));
  }, []);

  const chooseCategory = async (c) => {
    setSheet(null);
    const { data } = await categoriesApi.detail(c.id);
    setCategory(data);
    const types = data.listingTypes.filter((x) => x !== 'auction');
    set({ listingType: types.includes(form.listingType) ? form.listingType : types[0] ?? 'sell', attributes: {} });
  };

  // editing: load the ad and its category
  useEffect(() => {
    if (!editing) return;
    (async () => {
      try {
        const { data } = await listingsApi.forEdit(id);
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
        setPhotos(data.media.map((m) => ({ key: m.mediaId, mediaId: m.mediaId, url: m.url })));
        setPlace(data.location);
      } catch (e) {
        setFormError(errorText(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id, editing]);

  const maxPhotos = category?.rules.maxPhotos ?? 10;

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

    const body = {
      categoryId: category.id,
      listingType: form.listingType,
      title: form.title.trim(),
      description: form.description.trim(),
      condition: form.condition || undefined,
      price: { type: form.priceType, ...(['fixed', 'negotiable'].includes(form.priceType) ? { amount: Number(form.amount) } : {}) },
      attributes: Object.fromEntries(Object.entries(form.attributes).filter(([, v]) => v !== undefined && v !== '')),
      mediaIds: photos.filter((p) => p.mediaId).map((p) => p.mediaId),
      location: { label: place.label, name: place.name, placeId: place.placeId, lat: place.lat, lng: place.lng, address: place.address ?? {} },
    };

    setSaving(true);
    try {
      const { data } = editing ? await listingsApi.update(id, body) : await listingsApi.create(body);
      setDone(data);
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
        <AppText variant="h2" style={{ textAlign: 'center' }}>{done.status === 'published' ? t('sell.success_published') : t('sell.success_review')}</AppText>
        <View style={{ alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.lg }}>
          <Button title={t('sell.viewAd')} onPress={() => navigate(`/listing/${done.id}`, { replace: true })} />
          {!editing && <Button variant="outline" title={t('sell.postAnother')} onPress={() => window.location.assign('/sell')} />}
        </View>
      </View>
    );
  }

  if (loading) return <View style={[styles.fill, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={colors.primary} /></View>;

  const types = category?.listingTypes.filter((x) => x !== 'auction') ?? [];
  const needsAmount = ['fixed', 'negotiable'].includes(form.priceType);

  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={t('common.back')} onPress={() => navigate(-1)}><ArrowLeft size={24} color={colors.text} /></Pressable>
        <AppText variant="h3">{editing ? t('sell.editTitle') : t('sell.title')}</AppText>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxxl }}>
        {editing && <Card style={{ backgroundColor: colors.warmSoft }}><AppText variant="caption">{t('sell.reviewNote')}</AppText></Card>}

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

            {/* price */}
            <Section title={t('sell.price')} error={errors['price.amount']}>
              <View style={styles.chips}>
                {PRICE_TYPES.map((p) => <Chip key={p} label={t(`sell.priceType_${p}`)} active={form.priceType === p} onPress={() => set({ priceType: p })} />)}
              </View>
              {needsAmount && <Field value={form.amount} onChangeText={(v) => set({ amount: v.replace(/[^\d.]/g, '') })} placeholder={t('sell.amount')} keyboardType="number-pad" />}
            </Section>

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

            {/* location */}
            <Section title={t('sell.location')} error={errors.location || errors['location.label']}>
              <Pressable onPress={() => setSheet('place')} style={styles.picker}>
                <MapPin size={18} color={colors.primary} />
                <AppText variant="bodyStrong" color={place ? colors.text : colors.textSubtle} style={{ flex: 1 }}>{place?.label ?? t('sell.chooseLocation')}</AppText>
                <ChevronRight size={18} color={colors.textMuted} />
              </Pressable>
            </Section>

            {!!formError && <AppText color={colors.danger}>{formError}</AppText>}
            <Button title={editing ? t('sell.saveChanges') : t('sell.publish')} loading={saving} disabled={photos.some((p) => p.uploading)} onPress={submit} />
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
  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
});
