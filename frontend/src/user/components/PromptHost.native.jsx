import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from './ui';
import { TextInput } from './primitives';
import { colors, radius, spacing } from '@theme/tokens';

/** Android has no text prompt, so promptAsync() shows this small box (mounted once at the root). */
let open = null;
export const showPrompt = (message, initial) => new Promise((resolve) => (open ? open({ message, initial, resolve }) : resolve(null)));

export const PromptHost = () => {
  const { t } = useTranslation();
  const [req, setReq] = useState(null);
  const [text, setText] = useState('');
  useEffect(() => {
    open = (r) => {
      setText(r.initial || '');
      setReq(r);
    };
    return () => (open = null);
  }, []);
  const done = (value) => {
    req?.resolve(value);
    setReq(null);
  };
  return (
    <Modal visible={Boolean(req)} transparent animationType="fade" onRequestClose={() => done(null)}>
      <View style={styles.dim}>
        <View style={styles.box}>
          <AppText variant="bodyStrong">{req?.message}</AppText>
          <TextInput value={text} onChangeText={setText} autoFocus style={styles.input} />
          <View style={styles.row}>
            <Pressable onPress={() => done(null)} style={styles.btn}><AppText color={colors.textMuted}>{t('common.cancel')}</AppText></Pressable>
            <Pressable onPress={() => done(text)} style={styles.btn}><AppText variant="bodyStrong" color={colors.primary}>OK</AppText></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: spacing.xl },
  box: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 48 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md },
  btn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
});
