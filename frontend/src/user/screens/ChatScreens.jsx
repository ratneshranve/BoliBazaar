import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, MessageSquare, Send } from 'lucide-react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, TextInput, View } from '../components/primitives';
import { AppText, Button, EmptyState } from '../components/ui';
import { colors, radius, spacing } from '@theme/tokens';
import { chatApi } from '../api/endpoints';
import { useAppDispatch, useAppSelector, fetchUnread } from '../store';
import { emitRealtime, onRealtime } from '../services/realtime';
import { ReportSheet } from '../components/ReportSheet';
import { formatPrice, formatChatTime } from '../utils/listing';
import { useGoBack } from '../utils/goBack';
import { errorText } from '../i18n';

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

  const load = useCallback(() => {
    chatApi.list().then(({ data }) => setItems(data)).catch((e) => { Alert.alert(errorText(e)); setItems((p) => p ?? []); });
  }, []);

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
        <AppText variant="h3">{t('chat.title')}</AppText>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxxl }}>
        {!items && <ActivityIndicator style={{ padding: spacing.xl }} color={colors.primary} />}
        {items?.length === 0 && <EmptyState icon={<MessageSquare size={44} color={colors.textMuted} />} title={t('chat.empty')} body={t('chat.emptyBody')} />}
        {items?.map((c) => (
          <Pressable key={c.id} onPress={() => navigate(`/chat/${c.id}`)} style={styles.row}>
            <Avatar peer={c.peer} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                <AppText variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>{c.peer.name ?? t('chat.unknownUser')}</AppText>
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
      </ScrollView>
    </View>
  );
};

/** One conversation: history, live messages, typing, read ticks, block. */
export const ChatScreen = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const goBack = useGoBack('/chats');
  const dispatch = useAppDispatch();
  const { id } = useParams();
  const authed = useRequireLogin();
  const myId = useAppSelector((s) => s.session.me?.id);
  const [info, setInfo] = useState(null);
  const [messages, setMessages] = useState(null); // oldest → newest
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const bottom = useRef(null);
  const lastTypingSent = useRef(0);
  const typingTimer = useRef(null);
  const [reporting, setReporting] = useState(false);

  const markRead = useCallback(() => {
    chatApi.read(id).then(() => dispatch(fetchUnread())).catch(() => {});
  }, [id, dispatch]);

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
        setMessages((prev) => (prev && !prev.some((x) => x.id === m.id) ? [...prev, m] : prev));
        setTyping(false);
        if (m.senderId !== myId) markRead();
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
  }, [authed, id, myId, markRead, navigate]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages?.length, typing]);

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

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const { data } = await chatApi.send(id, body);
      setText('');
      setMessages((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data]));
    } catch (e) {
      Alert.alert(errorText(e));
    } finally {
      setSending(false);
    }
  };

  const toggleBlock = async () => {
    const blocking = !info.iBlockedThem;
    if (blocking && !window.confirm(t('chat.confirmBlock', { name: info.peer.name ?? '' }))) return;
    try {
      await (blocking ? chatApi.block(info.peer.id) : chatApi.unblock(info.peer.id));
      setInfo({ ...info, iBlockedThem: blocking });
    } catch (e) {
      Alert.alert(errorText(e));
    }
  };

  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={t('common.back')} onPress={goBack}><ArrowLeft size={24} color={colors.text} /></Pressable>
        {info && <Avatar peer={info.peer} size={36} />}
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong" numberOfLines={1}>{info?.peer.name ?? ''}</AppText>
          {typing && <AppText variant="small" color={colors.sell}>{t('chat.typing')}</AppText>}
        </View>
        {info?.peer?.id && <Pressable onPress={() => setReporting(true)}><AppText variant="caption" color={colors.textMuted}>{t('report.short')}</AppText></Pressable>}
        {info && <Pressable onPress={toggleBlock}><AppText variant="caption" color={colors.danger}>{info.iBlockedThem ? t('chat.unblock') : t('chat.block')}</AppText></Pressable>}
      </View>

      {info?.listing && (
        <Pressable onPress={() => navigate(`/listing/${info.listing.id}`)} style={styles.adBar}>
          {info.listing.cover ? <Image source={{ uri: info.listing.cover }} style={styles.adThumb} /> : <View style={[styles.adThumb, { backgroundColor: colors.surface }]} />}
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong" numberOfLines={1}>{info.listing.title}</AppText>
            <AppText variant="caption" color={colors.primary}>{formatPrice(info.listing.price, t, i18n.language)}</AppText>
          </View>
        </Pressable>
      )}

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.xs }}>
        <AppText variant="small" color={colors.textMuted} style={{ textAlign: 'center', marginBottom: spacing.sm }} onPress={() => navigate('/page/safety')}>{t('safety.chat')}</AppText>
        {!messages && <ActivityIndicator style={{ padding: spacing.xl }} color={colors.primary} />}
        {hasMore && <Button size="md" variant="ghost" title={t('chat.older')} onPress={older} />}
        {messages?.map((m) => {
          const mine = m.senderId === myId;
          return (
            <View key={m.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
              <AppText color={mine ? colors.white : colors.text} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.text}</AppText>
              <AppText variant="small" color={mine ? 'rgba(255,255,255,0.8)' : colors.textSubtle} style={{ alignSelf: 'flex-end' }}>
                {formatChatTime(m.createdAt, i18n.language)}{mine ? (m.readAt ? ' ✓✓' : ' ✓') : ''}
              </AppText>
            </View>
          );
        })}
        <div ref={bottom} />
      </ScrollView>

      {reporting && <ReportSheet targetType="user" targetId={info.peer.id} onClose={() => setReporting(false)} />}
      {info?.iBlockedThem ? (
        <View style={styles.composerNote}><AppText color={colors.textMuted}>{t('chat.youBlocked')}</AppText></View>
      ) : (
        <View style={styles.composer}>
          <TextInput
            value={text}
            onChangeText={onChange}
            onSubmitEditing={send}
            placeholder={t('chat.placeholder')}
            maxLength={1000}
            style={styles.input}
          />
          <Pressable accessibilityLabel={t('chat.send')} onPress={send} disabled={!text.trim() || sending} style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.5 }]}>
            <Send size={20} color={colors.white} />
          </Pressable>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.white, minHeight: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.divider },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  adBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  adThumb: { width: 44, height: 44, borderRadius: radius.md },
  bubble: { maxWidth: '78%', padding: spacing.md, borderRadius: radius.lg, gap: 2 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primary },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface },
  composer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  composerNote: { padding: spacing.lg, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.divider },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 10, fontSize: 16 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
