import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Archive, ArrowLeft, BellOff, FileText, IndianRupee, MapPin, MessageSquare, MoreVertical, Paperclip, Send, UserX, X } from 'lucide-react';
import { Sheet } from '../components/Sheet';
import { getPosition } from '../services/geolocation';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, TextInput, View } from '../components/primitives';
import { AppText, Button, EmptyState } from '../components/ui';
import { colors, radius, spacing } from '@theme/tokens';
import { chatApi, listingsApi, placesApi, uploadsApi } from '../api/endpoints';
import { useAppDispatch, useAppSelector, fetchUnread } from '../store';
import { emitRealtime, onRealtime } from '../services/realtime';
import { ReportSheet } from '../components/ReportSheet';
import { formatPrice, formatChatTime } from '../utils/listing';
import { useGoBack } from '../utils/goBack';
import { errorText } from '../i18n';
import { confirmAsync, openAuthFile, openUrl } from '../services/dialogs';
import { pickFiles as chooseFiles, releasePreview } from '../services/files';


const useRequireLogin = () => {
  const navigate = useNavigate();
  const status = useAppSelector((s) => s.session.status);
  useEffect(() => {
    if (status === 'guest') navigate('/login', { replace: true });
  }, [status, navigate]);
  return status === 'authenticated';
};

const Avatar = ({ peer, size = 44 }) =>
  peer?.avatar ? (
    <Image source={{ uri: peer.avatar }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
      <AppText variant="bodyStrong" color={colors.primary}>{(peer?.name ?? '?').charAt(0).toUpperCase()}</AppText>
    </View>
  );

/** All of the user's conversations, newest first. */
export const ChatsScreen = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const authed = useRequireLogin();
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('all');
  const [archived, setArchived] = useState(false);
  const [archivedCount, setArchivedCount] = useState(0);

  const load = useCallback(() => {
    chatApi
      .list({ filter, ...(archived ? { archived: '1' } : {}) })
      .then(({ data, meta }) => {
        setItems(data);
        setArchivedCount(meta?.archivedCount ?? 0);
      })
      .catch((e) => { Alert.alert(errorText(e)); setItems((p) => p ?? []); });
  }, [filter, archived]);

  useEffect(() => {
    if (!authed) return undefined;
    load();
    const off = [onRealtime('chat:message', load), onRealtime('chat:read', load)];
    return () => off.forEach((f) => f());
  }, [authed, load]);

  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={t('common.back')} onPress={() => navigate(-1)}><ArrowLeft size={24} color={colors.text} /></Pressable>
        <AppText variant="h3" style={{ flex: 1 }}>{archived ? t('chat.archived') : t('chat.title')}</AppText>
        {archived && <Pressable onPress={() => setArchived(false)}><AppText variant="bodyStrong" color={colors.primary}>{t('chat.backToInbox')}</AppText></Pressable>}
      </View>
      {!archived && (
        <View style={styles.filters}>
          {['all', 'buying', 'selling', 'unread'].map((k) => (
            <Pressable key={k} onPress={() => setFilter(k)} style={[styles.chip, filter === k && styles.chipOn]}>
              <AppText variant="caption" color={filter === k ? colors.white : colors.text}>{t(`chat.filter_${k}`)}</AppText>
            </Pressable>
          ))}
        </View>
      )}
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxxl }}>
        {!items && <ActivityIndicator style={{ minHeight: 'calc(100dvh - 200px)' }} color={colors.brand} />}
        {items?.length === 0 && <EmptyState icon={<MessageSquare size={44} color={colors.textMuted} />} title={archived ? t('chat.noArchived') : t('chat.empty')} body={archived ? undefined : t('chat.emptyBody')} />}
        {items?.map((c) => (
          <Pressable key={c.id} onPress={() => navigate(`/chat/${c.id}`)} style={styles.row}>
            <Avatar peer={c.peer} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                <AppText variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>{c.peer.name ?? t('chat.unknownUser')}</AppText>
                {c.muted && <BellOff size={14} color={colors.textSubtle} />}
                <AppText variant="small" color={colors.textSubtle}>{formatChatTime(c.lastMessageAt, i18n.language)}</AppText>
              </View>
              {c.listing && <AppText variant="small" color={colors.primary} numberOfLines={1}>{c.listing.title}</AppText>}
              <AppText color={c.unread ? colors.text : colors.textMuted} numberOfLines={1}>
                {c.lastMessage?.mine ? `${t('chat.you')}: ` : ''}{c.lastMessage?.text}
              </AppText>
            </View>
            {c.unread > 0 && (
              <View style={styles.badge}><AppText variant="small" color={colors.white}>{c.unread > 99 ? '99+' : c.unread}</AppText></View>
            )}
          </Pressable>
        ))}
        {!archived && archivedCount > 0 && (
          <Pressable onPress={() => setArchived(true)} style={styles.archivedLink}>
            <Archive size={18} color={colors.textMuted} />
            <AppText color={colors.textMuted}>{t('chat.archivedCount', { count: archivedCount })}</AppText>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
};

/** One conversation: history, live messages, typing, read ticks, block. */

const fileSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const offerPrice = (o) => ({ type: 'fixed', amountMinor: o.amountMinor, currency: o.currency, factor: o.factor });
const OFFER_TONE = { pending: colors.warning, accepted: colors.sell, declined: colors.danger, countered: colors.textMuted, withdrawn: colors.textMuted, expired: colors.textMuted };

/** Photos (tap to open) and private files (downloaded with the login token). */
const Attachments = ({ m, conversationId, mine }) => {
  const { t } = useTranslation();
  const openFile = async (a) => {
    try {
      await openAuthFile(`/chats/${conversationId}/files/${a.mediaId}`);
    } catch (e) {
      Alert.alert(errorText(e));
    }
  };
  const images = m.attachments.filter((a) => a.kind === 'image');
  const files = m.attachments.filter((a) => a.kind === 'file');
  return (
    <View style={{ gap: spacing.xs }}>
      {images.length > 0 && (
        <View style={styles.imageGrid}>
          {images.map((a) => (
            <Pressable key={a.mediaId} accessibilityLabel={t('chat.photo')} onPress={() => openUrl(a.url)}>
              <Image source={{ uri: a.url }} style={[styles.chatImage, images.length === 1 && styles.chatImageOne]} />
            </Pressable>
          ))}
        </View>
      )}
      {files.map((a) => (
        <Pressable key={a.mediaId} onPress={() => openFile(a)} style={[styles.fileChip, mine && { backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.4)' }]}>
          <FileText size={22} color={mine ? colors.white : colors.primary} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText variant="caption" color={mine ? colors.white : colors.text} numberOfLines={1}>{a.name || t('chat.file')}</AppText>
            {a.size ? <AppText variant="small" color={mine ? 'rgba(255,255,255,0.8)' : colors.textMuted}>{fileSize(a.size)} · {t('chat.tapToOpen')}</AppText> : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
};

/** Price offer card with the actions the viewer may take. */
const OfferCard = ({ m, mine, onAnswer, busy }) => {
  const { t, i18n } = useTranslation();
  const [countering, setCountering] = useState(false);
  const [amount, setAmount] = useState('');
  const o = m.offer;
  const pending = o.status === 'pending';
  return (
    <View style={styles.offerCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <IndianRupee size={16} color={colors.primary} />
        <AppText variant="caption" color={colors.textMuted}>{o.replyTo ? t('chat.counterOffer') : t('chat.offer')}</AppText>
      </View>
      <AppText variant="h3">{formatPrice(offerPrice(o), t, i18n.language)}</AppText>
      <AppText variant="small" color={OFFER_TONE[o.status]}>
        {t(`chat.offer_${o.status}`)}
        {pending ? ` · ${t('chat.offerExpires', { time: new Date(o.expiresAt).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }) })}` : ''}
      </AppText>
      {pending && !mine && !countering && (
        <View style={styles.offerActions}>
          <Button size="md" title={t('chat.accept')} loading={busy} onPress={() => onAnswer(m, 'accept')} />
          <Button size="md" variant="outline" title={t('chat.counter')} disabled={busy} onPress={() => setCountering(true)} />
          <Button size="md" variant="ghost" title={t('chat.decline')} disabled={busy} onPress={() => onAnswer(m, 'decline')} />
        </View>
      )}
      {pending && !mine && countering && (
        <View style={styles.offerActions}>
          <TextInput value={amount} onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, ''))} placeholder={t('chat.counterPlaceholder')} keyboardType="numeric" style={[styles.input, { flex: 1, minWidth: 120 }]} />
          <Button size="md" title={t('chat.sendOffer')} loading={busy} disabled={!(Number(amount) > 0)} onPress={() => onAnswer(m, 'counter', Number(amount)).then((ok) => ok && setCountering(false))} />
          <Button size="md" variant="ghost" title={t('common.cancel')} onPress={() => setCountering(false)} />
        </View>
      )}
      {pending && mine && (
        <View style={styles.offerActions}>
          <Button size="md" variant="ghost" title={t('chat.withdraw')} loading={busy} onPress={() => onAnswer(m, 'withdraw')} />
        </View>
      )}
    </View>
  );
};

/** One conversation: history, live messages, photos/files, offers, quick replies, typing, read ticks, block. */
export const ChatScreen = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const goBack = useGoBack('/chats');
  const dispatch = useAppDispatch();
  const { id } = useParams();
  const authed = useRequireLogin();
  const myId = useAppSelector((s) => s.session.me?.id);
  const chatCfg = useAppSelector((s) => s.app.bootstrap?.chat) || {};
  const [info, setInfo] = useState(null);
  const [messages, setMessages] = useState(null); // oldest → newest
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]); // { key, name, kind, preview?, mediaId?, error? }
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const [answering, setAnswering] = useState(null);
  const scroller = useRef(null);
  const lastTypingSent = useRef(0);
  const typingTimer = useRef(null);
  const [reporting, setReporting] = useState(false);

  const markRead = useCallback(() => {
    chatApi.read(id).then(() => dispatch(fetchUnread())).catch(() => {});
  }, [id, dispatch]);

  const upsert = useCallback((m) => setMessages((prev) => {
    if (!prev) return prev;
    const i = prev.findIndex((x) => x.id === m.id);
    if (i === -1) return [...prev, m];
    const next = [...prev];
    next[i] = m;
    return next;
  }), []);

  useEffect(() => {
    if (!authed) return undefined;
    setInfo(null);
    setMessages(null);
    chatApi.detail(id).then(({ data }) => setInfo(data)).catch(() => navigate('/chats', { replace: true }));
    chatApi.messages(id, { limit: 30 }).then(({ data }) => {
      setMessages([...data.items].reverse());
      setHasMore(data.hasMore);
      markRead();
    }).catch((e) => { Alert.alert(errorText(e)); setMessages([]); });

    const off = [
      onRealtime('chat:message', (m) => {
        if (m.conversationId !== id) return;
        upsert(m);
        setTyping(false);
        if (m.senderId !== myId) markRead();
      }),
      onRealtime('chat:message:update', (m) => {
        if (m.conversationId === id) upsert(m);
      }),
      onRealtime('chat:read', (e) => {
        if (e.conversationId === id) setMessages((prev) => prev?.map((m) => (m.senderId === myId && !m.readAt ? { ...m, readAt: e.readAt } : m)));
      }),
      onRealtime('chat:typing', (e) => {
        if (e.conversationId !== id) return;
        setTyping(true);
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTyping(false), 3000);
      }),
    ];
    return () => { off.forEach((f) => f()); clearTimeout(typingTimer.current); };
  }, [authed, id, myId, markRead, navigate, upsert]);

  useEffect(() => {
    setTimeout(() => scroller.current?.scrollToEnd?.({ animated: false }), 50);
  }, [messages?.length, typing]);

  useEffect(() => () => pendingFiles.forEach((f) => releasePreview(f.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const older = async () => {
    const first = messages[0];
    const { data } = await chatApi.messages(id, { before: first.id, limit: 30 });
    setMessages((prev) => [...[...data.items].reverse(), ...prev]);
    setHasMore(data.hasMore);
  };

  const onChange = (v) => {
    setText(v);
    if (Date.now() - lastTypingSent.current > 2000) {
      lastTypingSent.current = Date.now();
      emitRealtime('chat:typing', { conversationId: id });
    }
  };

  /* ── attachments: uploaded as soon as they are picked, sent with the next message ── */
  const pickFiles = async (list) => {
    const max = chatCfg.maxAttachments || 5;
    const chosen = [...list].slice(0, Math.max(0, max - pendingFiles.length));
    if (list.length > chosen.length) Alert.alert(t('chat.maxFiles', { count: max }));
    for (const file of chosen) {
      const isImage = file.type.startsWith('image/') && file.type !== 'image/heic';
      const kind = isImage ? 'image' : 'file';
      if (kind === 'image' && chatCfg.photosEnabled === false) { Alert.alert(t('chat.photosOff')); continue; }
      if (kind === 'file' && chatCfg.filesEnabled === false) { Alert.alert(t('chat.filesOff')); continue; }
      const key = `${file.name}-${file.size}-${Math.random()}`;
      setPendingFiles((p) => [...p, { key, name: file.name, kind, preview: isImage ? file.preview : null }]);
      try {
        const { data } = isImage ? await uploadsApi.image(file, 'chat') : await uploadsApi.document(file, 'chat_file');
        setPendingFiles((p) => p.map((f) => (f.key === key ? { ...f, mediaId: data.id } : f)));
      } catch (e) {
        setPendingFiles((p) => p.filter((f) => f.key !== key));
        Alert.alert(errorText(e));
      }
    }
  };
  const removeFile = (key) => setPendingFiles((p) => {
    const f = p.find((x) => x.key === key);
    releasePreview(f?.preview);
    return p.filter((x) => x.key !== key);
  });
  const uploading = pendingFiles.some((f) => !f.mediaId);

  const send = async (override) => {
    const body = (override ?? text).trim();
    const mediaIds = override ? [] : pendingFiles.map((f) => f.mediaId).filter(Boolean);
    if ((!body && !mediaIds.length) || sending || (!override && uploading)) return;
    setSending(true);
    try {
      const { data } = await chatApi.send(id, body, mediaIds);
      if (!override) {
        setText('');
        pendingFiles.forEach((f) => releasePreview(f.preview));
        setPendingFiles([]);
      }
      upsert(data);
    } catch (e) {
      Alert.alert(errorText(e));
    } finally {
      setSending(false);
    }
  };

  /* ── offers ── */
  const listing = info?.listing;
  const canOffer = chatCfg.offersEnabled !== false && info?.side === 'buyer' && listing?.status === 'published' && ['fixed', 'negotiable'].includes(listing?.price?.type) && listing.price.amountMinor > 0;
  const askingMajor = listing?.price?.amountMinor ? listing.price.amountMinor / (listing.price.factor || 1) : 0;
  const minOffer = Math.ceil((askingMajor * (chatCfg.offerMinPercent ?? 0)) / 100);

  const sendOffer = async () => {
    const amount = Number(offerAmount);
    if (!(amount > 0)) return;
    setSending(true);
    try {
      upsert((await chatApi.offer(id, amount)).data);
      setOfferOpen(false);
      setOfferAmount('');
    } catch (e) {
      Alert.alert(errorText(e));
    } finally {
      setSending(false);
    }
  };

  const answer = async (m, action, amount) => {
    setAnswering(m.id);
    try {
      const { data } = await chatApi.answerOffer(id, m.id, action, amount);
      upsert(data.offer);
      if (data.counter) upsert(data.counter);
      if (action === 'accept' && info?.side === 'seller' && listing?.status === 'published' && (await confirmAsync(t('chat.markSoldPrompt')))) {
        await listingsApi.action(listing.id, 'sold');
        setInfo((i) => ({ ...i, listing: { ...i.listing, status: 'sold' } }));
      }
      return true;
    } catch (e) {
      Alert.alert(errorText(e));
      return false;
    } finally {
      setAnswering(null);
    }
  };

  const [menu, setMenu] = useState(false);
  const setPrefs = async (body) => {
    try {
      const { data } = await chatApi.prefs(id, body);
      setInfo((i) => ({ ...i, mutedUntil: data.mutedUntil, archived: data.archived }));
      setMenu(false);
      if (body.archived) navigate('/chats');
    } catch (e) {
      Alert.alert(errorText(e));
    }
  };
  const [locating, setLocating] = useState(false);
  const shareLocation = async () => {
    if (!(await confirmAsync(t('chat.shareLocationConfirm')))) return;
    setLocating(true);
    try {
      const point = await getPosition();
      let label;
      try {
        label = (await placesApi.reverse(point.lat, point.lng)).data?.label;
      } catch {
        /* the point alone is enough */
      }
      await chatApi.location(id, { ...point, ...(label ? { label } : {}) });
    } catch (e) {
      Alert.alert(e.message === 'denied' ? t('chat.locationDenied') : errorText(e));
    } finally {
      setLocating(false);
    }
  };

  const toggleBlock = async () => {
    const blocking = !info.iBlockedThem;
    if (blocking && !(await confirmAsync(t('chat.confirmBlock', { name: info.peer.name ?? '' })))) return;
    try {
      await (blocking ? chatApi.block(info.peer.id) : chatApi.unblock(info.peer.id));
      setInfo({ ...info, iBlockedThem: blocking });
    } catch (e) {
      Alert.alert(errorText(e));
    }
  };

  const quickReplies = info?.side === 'buyer' && !text && !pendingFiles.length ? chatCfg.quickReplies || [] : [];
  const canSend = (text.trim() || pendingFiles.length) && !sending && !uploading;

  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={t('common.back')} onPress={goBack}><ArrowLeft size={24} color={colors.text} /></Pressable>
        {info && <Avatar peer={info.peer} size={36} />}
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong" numberOfLines={1}>{info?.peer.name ?? ''}</AppText>
          {typing && <AppText variant="small" color={colors.sell}>{t('chat.typing')}</AppText>}
        </View>
        {info?.mutedUntil && <BellOff size={18} color={colors.textSubtle} />}
        {info && <Pressable accessibilityLabel={t('chat.options')} onPress={() => setMenu(true)} style={{ padding: 4 }}><MoreVertical size={22} color={colors.text} /></Pressable>}
      </View>

      {listing && (
        <View style={styles.adBar}>
          <Pressable onPress={() => navigate(`/listing/${listing.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1, minWidth: 0 }}>
            {listing.cover ? <Image source={{ uri: listing.cover }} style={styles.adThumb} /> : <View style={[styles.adThumb, { backgroundColor: colors.white }]} />}
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="bodyStrong" numberOfLines={1}>{listing.title}</AppText>
              <AppText variant="caption" color={colors.primary}>{formatPrice(listing.price, t, i18n.language)}{listing.status === 'sold' ? ` · ${t('chat.sold')}` : ''}</AppText>
            </View>
          </Pressable>
          {canOffer && !info.iBlockedThem && <Button size="md" variant="outline" title={t('chat.makeOffer')} onPress={() => setOfferOpen((v) => !v)} />}
        </View>
      )}

      {offerOpen && canOffer && (
        <View style={styles.offerPanel}>
          <AppText variant="caption" color={colors.textMuted}>{t('chat.offerHint', { min: formatPrice({ ...listing.price, amountMinor: minOffer * (listing.price.factor || 1) }, t, i18n.language) })}</AppText>
          <View style={styles.chips}>
            {[5, 10, 15].map((pct) => {
              const v = Math.floor((askingMajor * (100 - pct)) / 100);
              return (
                <Pressable key={pct} onPress={() => setOfferAmount(String(v))} style={styles.chip}>
                  <AppText variant="caption">−{pct}% · {formatPrice({ ...listing.price, amountMinor: v * (listing.price.factor || 1) }, t, i18n.language)}</AppText>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
            <TextInput value={offerAmount} onChangeText={(v) => setOfferAmount(v.replace(/[^\d.]/g, ''))} placeholder={t('chat.offerPlaceholder')} keyboardType="numeric" style={[styles.input, { flex: 1 }]} />
            <Button size="md" title={t('chat.sendOffer')} loading={sending} disabled={!(Number(offerAmount) > 0)} onPress={sendOffer} />
          </View>
        </View>
      )}

      <ScrollView ref={scroller} contentContainerStyle={{ padding: spacing.lg, gap: spacing.xs }}>
        <AppText variant="small" color={colors.textMuted} style={{ textAlign: 'center', marginBottom: spacing.sm }} onPress={() => navigate('/page/safety')}>{t('safety.chat')}</AppText>
        {!messages && <ActivityIndicator style={{ minHeight: 'calc(100dvh - 200px)' }} color={colors.primary} />}
        {hasMore && <Button size="md" variant="ghost" title={t('chat.older')} onPress={older} />}
        {messages?.map((m) => {
          const mine = m.senderId === myId;
          if (m.kind === 'offer' && m.offer) {
            return (
              <View key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                <OfferCard m={m} mine={mine} onAnswer={answer} busy={answering === m.id} />
                <AppText variant="small" color={colors.textSubtle} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', marginTop: 2 }}>{formatChatTime(m.createdAt, i18n.language)}</AppText>
              </View>
            );
          }
          return (
            <View key={m.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
              {m.attachments?.length > 0 && <Attachments m={m} conversationId={id} mine={mine} />}
              {m.kind === 'location' && m.location && (
                <Pressable onPress={() => openUrl(`https://www.google.com/maps?q=${m.location.lat},${m.location.lng}`)} style={styles.locCard}>
                  <MapPin size={22} color={mine ? colors.white : colors.primary} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong" color={mine ? colors.white : colors.text}>{m.location.label || t('chat.sharedLocation')}</AppText>
                    <AppText variant="small" color={mine ? 'rgba(255,255,255,0.85)' : colors.primary}>{t('chat.openInMaps')}</AppText>
                  </View>
                </Pressable>
              )}
              {!!m.text && <AppText color={mine ? colors.white : colors.text} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.text}</AppText>}
              <AppText variant="small" color={mine ? 'rgba(255,255,255,0.8)' : colors.textSubtle} style={{ alignSelf: 'flex-end' }}>
                {formatChatTime(m.createdAt, i18n.language)}{mine ? (m.readAt ? ' ✓✓' : ' ✓') : ''}
              </AppText>
            </View>
          );
        })}
      </ScrollView>

      {reporting && <ReportSheet targetType="user" targetId={info.peer.id} onClose={() => setReporting(false)} />}
      {menu && info && (
        <Sheet title={t('chat.options')} onClose={() => setMenu(false)}>
          <View style={{ gap: spacing.xs }}>
            <AppText variant="bodyStrong">{info.mutedUntil ? t('chat.mutedUntil', { time: new Date(info.mutedUntil).getFullYear() > 9000 ? t('chat.muteAlwaysShort') : new Date(info.mutedUntil).toLocaleString(i18n.language, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) }) : t('chat.muteTitle')}</AppText>
            <View style={styles.chips}>
              {['1h', '8h', '1w', 'always'].map((k) => (
                <Pressable key={k} onPress={() => setPrefs({ mute: k })} style={styles.chip}><AppText variant="caption">{t(`chat.mute_${k}`)}</AppText></Pressable>
              ))}
              {info.mutedUntil && <Pressable onPress={() => setPrefs({ mute: 'off' })} style={styles.chip}><AppText variant="caption" color={colors.primary}>{t('chat.unmute')}</AppText></Pressable>}
            </View>
            <Pressable onPress={() => setPrefs({ archived: !info.archived })} style={styles.menuRow}>
              <Archive size={20} color={colors.text} />
              <AppText>{info.archived ? t('chat.unarchive') : t('chat.archive')}</AppText>
            </Pressable>
            {listing && (
              <Pressable onPress={() => navigate(`/listing/${listing.id}`)} style={styles.menuRow}>
                <FileText size={20} color={colors.text} />
                <AppText>{t('chat.viewAd')}</AppText>
              </Pressable>
            )}
            <Pressable onPress={() => { setMenu(false); toggleBlock(); }} style={styles.menuRow}>
              <UserX size={20} color={colors.danger} />
              <AppText color={colors.danger}>{info.iBlockedThem ? t('chat.unblock') : t('chat.block')}</AppText>
            </Pressable>
            {info.peer?.id && (
              <Pressable onPress={() => { setMenu(false); setReporting(true); }} style={styles.menuRow}>
                <AppText color={colors.danger}>{t('report.title_user')}</AppText>
              </Pressable>
            )}
          </View>
        </Sheet>
      )}
      {info?.iBlockedThem ? (
        <View style={styles.composerNote}><AppText color={colors.textMuted}>{t('chat.youBlocked')}</AppText></View>
      ) : (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.divider }}>
          {quickReplies.length > 0 && (
            <View style={styles.quickRow}>
              {quickReplies.map((q) => (
                <Pressable key={q} disabled={sending} onPress={() => send(q)} style={styles.chip}>
                  <AppText variant="caption">{q}</AppText>
                </Pressable>
              ))}
            </View>
          )}
          {pendingFiles.length > 0 && (
            <View style={styles.pendingRow}>
              {pendingFiles.map((f) => (
                <View key={f.key} style={styles.pendingItem}>
                  {f.preview ? <Image source={{ uri: f.preview }} style={styles.pendingThumb} /> : <View style={[styles.pendingThumb, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }]}><FileText size={20} color={colors.primary} /></View>}
                  {!f.mediaId && <View style={styles.pendingOverlay}><ActivityIndicator color={colors.white} /></View>}
                  <Pressable accessibilityLabel={t('chat.removeFile')} onPress={() => removeFile(f.key)} style={styles.pendingRemove}><X size={12} color={colors.white} /></Pressable>
                  {!f.preview && <AppText variant="small" numberOfLines={1} style={{ width: 56 }}>{f.name}</AppText>}
                </View>
              ))}
            </View>
          )}
          <View style={styles.composer}>
            {(chatCfg.photosEnabled !== false || chatCfg.filesEnabled !== false) && (
              <Pressable
                accessibilityLabel={t('chat.attach')}
                onPress={async () => pickFiles(await chooseFiles({ images: chatCfg.photosEnabled !== false, pdf: chatCfg.filesEnabled !== false }))}
                style={styles.attachBtn}>
                <Paperclip size={20} color={colors.textMuted} />
              </Pressable>
            )}
            <Pressable accessibilityLabel={t('chat.shareLocation')} onPress={shareLocation} disabled={locating} style={styles.attachBtn}>
              {locating ? <ActivityIndicator color={colors.brand} /> : <MapPin size={20} color={colors.textMuted} />}
            </Pressable>
            <TextInput
              value={text}
              onChangeText={onChange}
              onSubmitEditing={() => send()}
              placeholder={t('chat.placeholder')}
              maxLength={1000}
              style={styles.input}
            />
            <Pressable accessibilityLabel={t('chat.send')} onPress={() => send()} disabled={!canSend} style={[styles.sendBtn, !canSend && { opacity: 0.5 }]}>
              <Send size={20} color={colors.white} />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.white, minHeight: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.divider },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  adBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  adThumb: { width: 44, height: 44, borderRadius: radius.md },
  offerPanel: { padding: spacing.md, gap: spacing.sm, backgroundColor: colors.primarySoft, borderBottomWidth: 1, borderBottomColor: colors.divider },
  bubble: { maxWidth: '78%', padding: spacing.md, borderRadius: radius.lg, gap: spacing.xs },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.brand },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chatImage: { width: 110, height: 110, borderRadius: radius.md },
  chatImageOne: { width: 220, height: 180 },
  fileChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, minWidth: 200 },
  offerCard: { padding: spacing.md, gap: spacing.xs, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, minWidth: 220 },
  offerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs, alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  quickRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.sm, paddingBottom: 0, overflowX: 'auto' },
  pendingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  pendingItem: { position: 'relative', alignItems: 'center', gap: 2 },
  pendingThumb: { width: 56, height: 56, borderRadius: radius.md },
  pendingOverlay: { position: 'absolute', top: 0, left: 0, width: 56, height: 56, borderRadius: radius.md, backgroundColor: 'rgba(17,24,39,0.45)', alignItems: 'center', justifyContent: 'center' },
  pendingRemove: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  composer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  composerNote: { padding: spacing.lg, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.divider },
  filters: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, flexWrap: 'wrap' },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  archivedLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  locCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 200, paddingVertical: spacing.xs },
  attachBtn: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 10, fontSize: 16 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
});
