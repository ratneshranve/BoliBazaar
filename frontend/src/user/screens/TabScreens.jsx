import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Package, Gavel, ShoppingBag, Heart, MessageSquare, Wallet, MapPin, FileText, ShieldCheck, Headphones, ChevronRight, BadgeCheck, Languages, LogOut, Inbox, Bookmark,
  UserX, Camera, Trash2, AlertCircle, AlertTriangle,
} from 'lucide-react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, View } from '../components/primitives';
import { AppText, Button, Card, Field } from '../components/ui';
import { BrandHeader } from '../components/BrandHeader';
import { Sheet } from '../components/Sheet';
import { Dialog } from '../components/Dialog';
import { colors, radius, spacing, shadow } from '@theme/tokens';
import { useAppDispatch, useAppSelector, logoutThunk, meUpdated } from '../store';
import { meApi, uploadsApi, trustApi } from '../api/endpoints';
import { pickImages } from '../services/files';
import { errorText } from '../i18n';

const Row = ({ item, last }) => (
  <Pressable onPress={item.onPress} style={[styles.menuRow, !last && styles.menuDivider]}>
    <View style={styles.menuIcon}>{item.icon}</View>
    <View style={{ flex: 1 }}>
      <AppText variant="bodyStrong">{item.title}</AppText>
      <AppText variant="caption" color={colors.textMuted}>
        {item.sub}
      </AppText>
    </View>
    <ChevronRight size={20} color={colors.textMuted} />
  </Pressable>
);

const EditProfileSheet = ({ me, onClose }) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [name, setName] = useState(me?.name || '');
  const [about, setAbout] = useState(me?.about || '');
  const [avatarPreview, setAvatarPreview] = useState(me?.avatar?.url || '');
  const [avatarMediaId, setAvatarMediaId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const chooseAvatar = async () => {
    try {
      const [f] = await pickImages({ multiple: false });
      if (!f) return;
      setAvatarPreview(f.preview);
      setUploading(true);
      const { data } = await uploadsApi.image(f.upload, 'avatar');
      setAvatarMediaId(data.id);
    } catch (e) {
      Alert.alert(errorText(e));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (name.trim().length < 2) {
      setError(t('profile.nameTooShort'));
      return;
    }
    setError('');
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        about: about.trim() || null,
      };
      if (avatarMediaId) {
        payload.avatarMediaId = avatarMediaId;
      }
      const { data } = await meApi.update(payload);
      dispatch(meUpdated(data));
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={t('profile.editProfile')}
      onClose={onClose}
      footer={
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Button title={t('common.cancel')} variant="outline" onPress={onClose} style={{ flex: 1 }} />
          <Button title={t('common.save')} variant="primary" loading={saving || uploading} onPress={save} style={{ flex: 2 }} />
        </View>
      }
    >
      <View style={{ alignItems: 'center', marginBottom: spacing.md }}>
        <Pressable onPress={chooseAvatar} style={styles.editAvatarWrap}>
          {avatarPreview ? (
            <Image source={{ uri: avatarPreview }} style={styles.editAvatarImg} />
          ) : (
            <View style={[styles.editAvatarImg, styles.avatarEmpty]}>
              <AppText variant="h1" color={colors.primary}>
                {(name || me?.name || '?').charAt(0).toUpperCase()}
              </AppText>
            </View>
          )}
          <View style={styles.editAvatarBadge}>
            {uploading ? <ActivityIndicator size="small" color={colors.white} /> : <Camera size={16} color={colors.white} />}
          </View>
        </Pressable>
        <Pressable onPress={chooseAvatar} style={{ marginTop: spacing.xs }}>
          <AppText variant="caption" color={colors.primary} style={{ fontWeight: '600' }}>
            {t('profile.changePhoto')}
          </AppText>
        </Pressable>
      </View>

      <View style={{ gap: spacing.xs }}>
        <AppText variant="caption" color={colors.textMuted}>{t('profile.nameLabel')}</AppText>
        <Field value={name} onChangeText={(v) => { setName(v); setError(''); }} placeholder={t('profile.namePlaceholder')} error={error} />
      </View>

      <View style={{ gap: spacing.xs }}>
        <AppText variant="caption" color={colors.textMuted}>{t('profile.aboutLabel')}</AppText>
        <Field value={about} onChangeText={setAbout} placeholder={t('profile.aboutPlaceholder')} multiline numberOfLines={3} style={{ minHeight: 70 }} />
      </View>

      {me?.phone?.e164 && (
        <View style={{ gap: spacing.xs }}>
          <AppText variant="caption" color={colors.textMuted}>{t('profile.phoneLabel')}</AppText>
          <View style={styles.readOnlyBox}>
            <AppText color={colors.textMuted}>{me.phone.e164}</AppText>
            {me.phone.verified && <BadgeCheck size={16} color={colors.verified} />}
          </View>
        </View>
      )}
    </Sheet>
  );
};

/** Delete my account: checks what must be finished first, then schedules the deletion (the user can still change their mind). */
const DeleteAccountModal = ({ visible, onClose, onDeleted }) => {
  const { t, i18n } = useTranslation();
  const [info, setInfo] = useState(null); // { graceDays, blockers, pending }
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successDate, setSuccessDate] = useState(null);

  useEffect(() => {
    setInfo(null);
    setError(null);
    setSuccessDate(null);
    setSubmitting(false);
    if (!visible) return;
    trustApi.deletionInfo().then(({ data }) => setInfo(data)).catch((err) => setError(errorText(err)));
  }, [visible]);

  if (!visible) return null;

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await trustApi.requestDeletion();
      setSuccessDate(new Date(data.deleteAfter).toLocaleDateString(i18n.language));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeep = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await trustApi.cancelDeletion();
      onClose();
    } catch (err) {
      setError(errorText(err));
      setSubmitting(false);
    }
  };

  const close = successDate ? () => onDeleted?.() : onClose;
  const errorLine = error && (
    <AppText variant="caption" color={colors.danger} style={{ textAlign: 'center' }}>
      {error}
    </AppText>
  );

  return (
    <Dialog onClose={close}>
      {successDate ? (
        <View style={styles.modalBody}>
          <View style={[styles.modalIconWrap, { backgroundColor: colors.sellSoft }]}>
            <BadgeCheck size={32} color={colors.verified} />
          </View>
          <AppText variant="h2" style={{ textAlign: 'center' }}>{t('account.scheduledTitle')}</AppText>
          <AppText color={colors.textMuted} style={{ textAlign: 'center' }}>{t('account.scheduled', { date: successDate })}</AppText>
          <View style={{ width: '100%', marginTop: spacing.sm }}>
            <Button title={t('common.ok')} variant="primary" onPress={close} />
          </View>
        </View>
      ) : !info ? (
        <View style={[styles.modalBody, { paddingVertical: spacing.xl }]}>
          {errorLine || <ActivityIndicator color={colors.brand} />}
        </View>
      ) : info.pending ? (
        <View style={styles.modalBody}>
          <View style={[styles.modalIconWrap, { backgroundColor: colors.warmSoft }]}>
            <AlertTriangle size={30} color={colors.warm} />
          </View>
          <AppText variant="h2" style={{ textAlign: 'center' }}>{t('account.pending')}</AppText>
          <AppText color={colors.textMuted} style={{ textAlign: 'center' }}>{t('account.pendingBody')}</AppText>
          {errorLine}
          <View style={{ width: '100%', gap: spacing.sm, marginTop: spacing.sm }}>
            <Button title={t('account.keep')} variant="primary" loading={submitting} onPress={handleKeep} />
            <Button title={t('common.cancel')} variant="outline" disabled={submitting} onPress={onClose} />
          </View>
        </View>
      ) : info.blockers?.length > 0 ? (
        <View style={styles.modalBody}>
          <View style={[styles.modalIconWrap, { backgroundColor: colors.primarySoft }]}>
            <AlertCircle size={30} color={colors.danger} />
          </View>
          <AppText variant="h2" style={{ textAlign: 'center' }}>{t('account.blockedTitle')}</AppText>
          <AppText color={colors.textMuted} style={{ textAlign: 'center' }}>{t('account.blocked')}</AppText>
          <View style={styles.blockerBox}>
            {info.blockers.map((b) => (
              <AppText key={b} variant="caption" color={colors.danger}>• {b}</AppText>
            ))}
          </View>
          <View style={{ width: '100%', marginTop: spacing.sm }}>
            <Button title={t('common.close')} variant="outline" onPress={onClose} />
          </View>
        </View>
      ) : (
        <View style={styles.modalBody}>
          <View style={[styles.modalIconWrap, { backgroundColor: colors.primarySoft }]}>
            <Trash2 size={30} color={colors.danger} />
          </View>
          <AppText variant="h2" style={{ textAlign: 'center' }}>{t('account.confirmTitle')}</AppText>
          <AppText color={colors.textMuted} style={{ textAlign: 'center', lineHeight: 22 }}>{t('account.confirmDelete', { days: info.graceDays })}</AppText>
          {errorLine}
          <View style={styles.modalActionRow}>
            <Button title={t('common.cancel')} variant="outline" disabled={submitting} onPress={onClose} style={{ flex: 1 }} />
            <Button title={t('common.delete')} variant="danger" loading={submitting} icon={<Trash2 size={16} color={colors.white} />} onPress={handleConfirm} style={{ flex: 1 }} />
          </View>
        </View>
      )}
    </Dialog>
  );
};

export const ProfileScreen = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { status, me } = useAppSelector((s) => s.session);
  const bootstrapLanguages = useAppSelector((s) => s.app.bootstrap?.languages?.items);
  const [editingProfile, setEditingProfile] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const handleDeletionDone = () => {
    setDeleteModalOpen(false);
    dispatch(logoutThunk());
    navigate('/', { replace: true });
  };

  // guests go straight to the login screen
  if (status !== 'authenticated' || !me) return <Navigate to="/login" replace />;

  const currentLang = (bootstrapLanguages ?? []).find((l) => l.code === i18n.language);

  const tiles = [
    { icon: <Package size={26} color={colors.primary} />, bg: colors.primarySoft, title: t('profile.myListings'), sub: t('profile.myListingsSub'), go: () => navigate('/my-listings') },
    { icon: <Gavel size={26} color={colors.brand} />, bg: colors.brandSoft, title: t('profile.myAuctions'), sub: t('profile.myAuctionsSub'), go: () => navigate('/my-auctions') },
    { icon: <ShoppingBag size={26} color={colors.auctionBlue} />, bg: colors.auctionSoft, title: t('profile.myPurchases'), sub: t('profile.myPurchasesSub'), go: () => navigate('/deals') },
    { icon: <Heart size={26} color={colors.warm} />, bg: colors.warmSoft, title: t('profile.favourites'), sub: t('profile.favouritesSub'), go: () => navigate('/favourites') },
  ];

  const menu = [
    { icon: <MessageSquare size={22} color={colors.text} />, title: t('profile.messages'), sub: t('profile.messagesSub'), onPress: () => navigate('/chats') },
    { icon: <Bookmark size={22} color={colors.text} />, title: t('saved.title'), sub: t('saved.sub'), onPress: () => navigate('/saved-searches') },
    { icon: <Inbox size={22} color={colors.text} />, title: t('profile.leads'), sub: t('profile.leadsSub'), onPress: () => navigate('/leads/received') },
    { icon: <Wallet size={22} color={colors.text} />, title: t('profile.payments'), sub: t('profile.paymentsSub'), onPress: () => navigate('/payments') },
    { icon: <MapPin size={22} color={colors.text} />, title: t('profile.addresses'), sub: t('profile.addressesSub'), onPress: () => navigate('/location') },
    { icon: <FileText size={22} color={colors.text} />, title: t('profile.verification'), sub: t('profile.verificationSub'), onPress: () => navigate('/verification') },
    { icon: <ShieldCheck size={22} color={colors.text} />, title: t('profile.security'), sub: t('profile.securitySub'), onPress: () => navigate('/security') },
    { icon: <UserX size={22} color={colors.text} />, title: t('chat.blockedTitle'), sub: t('chat.blockedSub'), onPress: () => navigate('/blocked') },
    { icon: <Languages size={22} color={colors.text} />, title: t('profile.language'), sub: currentLang?.nativeName ?? i18n.language, onPress: () => navigate('/language') },
    { icon: <Headphones size={22} color={colors.text} />, title: t('profile.help'), sub: t('profile.helpSub'), onPress: () => navigate('/help') },
  ];

  return (
    <View style={styles.fill}>
      <BrandHeader right="bell" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        <View style={styles.profileCard}>
          {me.avatar?.url ? (
            <Image source={{ uri: me.avatar.url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarEmpty]}>
              <AppText variant="h1" color={colors.primary}>
                {(me.name ?? '?').charAt(0).toUpperCase()}
              </AppText>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <AppText variant="h2" numberOfLines={1}>
              {me.name}
            </AppText>
            {me.phone.verified && (
              <View style={styles.verified}>
                <BadgeCheck size={16} color={colors.verified} />
                <AppText variant="caption" color={colors.textMuted}>
                  {t('profile.verifiedPhone')}
                </AppText>
              </View>
            )}
          </View>
          <Button title={t('profile.editProfile')} variant="outline" size="md" onPress={() => setEditingProfile(true)} />
        </View>

        <View style={styles.tiles}>
          {tiles.map((tile) => (
            <Pressable key={tile.title} onPress={tile.go} style={[styles.tile, { backgroundColor: tile.bg }]}>
              {tile.icon}
              <AppText variant="bodyStrong" style={{ marginTop: spacing.sm }}>
                {tile.title}
              </AppText>
              <AppText variant="small" color={colors.textMuted}>
                {tile.sub}
              </AppText>
            </Pressable>
          ))}
        </View>

        <Card style={{ padding: 0, marginTop: spacing.lg }}>
          {menu.map((m, i) => (
            <Row key={m.title} item={m} last={i === menu.length - 1} />
          ))}
        </Card>

        <Button title={t('common.logout')} variant="outline" icon={<LogOut size={18} color={colors.primary} />} onPress={() => dispatch(logoutThunk())} style={{ marginTop: spacing.xl }} />
        <Button
          title={t('account.delete')}
          variant="outline-danger"
          icon={<Trash2 size={18} color={colors.danger} />}
          onPress={() => setDeleteModalOpen(true)}
          style={{ marginTop: spacing.md }}
        />
      </ScrollView>
      {editingProfile && <EditProfileSheet me={me} onClose={() => setEditingProfile(false)} />}
      <DeleteAccountModal
        visible={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onDeleted={handleDeletionDone}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.white },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: spacing.lg },
  avatar: { width: 68, height: 68, borderRadius: 34 },
  avatarEmpty: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.lg },
  tile: { width: 'calc(50% - 6px)', borderRadius: radius.lg, padding: spacing.lg, minHeight: 112, ...shadow.card },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  menuDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  menuIcon: { width: 28, alignItems: 'center' },
  editAvatarWrap: { position: 'relative', width: 84, height: 84 },
  editAvatarImg: { width: 84, height: 84, borderRadius: 42, overflow: 'hidden' },
  editAvatarBadge: { position: 'absolute', right: 0, bottom: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white },
  readOnlyBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, height: 50, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider },
  modalBody: { gap: spacing.md, alignItems: 'center' },
  modalIconWrap: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  blockerBox: { width: '100%', backgroundColor: colors.primarySoft, padding: spacing.md, borderRadius: radius.md, gap: 6 },
  modalActionRow: { flexDirection: 'row', gap: spacing.md, width: '100%', marginTop: spacing.sm },
});
