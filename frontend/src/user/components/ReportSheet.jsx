import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, TextInput, View } from './primitives';
import { AppText, Button } from './ui';
import { Sheet } from './Sheet';
import { colors, radius, spacing } from '@theme/tokens';
import { trustApi } from '../api/endpoints';
import { useAppSelector } from '../store';
import { errorText } from '../i18n';

/** Report an ad, a person or a message. The reasons are set by the admin (Settings › Moderation). */
export const ReportSheet = ({ targetType, targetId, onClose }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const reasons = useAppSelector((s) => s.app.bootstrap?.reportReasons?.[targetType]) ?? [];
  const authed = useAppSelector((s) => s.session.status === 'authenticated');
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const send = async () => {
    if (!authed) return navigate('/login');
    setBusy(true);
    try {
      await trustApi.report({ targetType, targetId, reason, details: details.trim() || undefined });
      setDone(true);
    } catch (e) {
      Alert.alert(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Sheet title={t('report.thanksTitle')} onClose={onClose} footer={<Button title={t('common.done')} onPress={onClose} />}>
        <AppText>{t('report.thanks')}</AppText>
        <Button variant="outline" title={t('report.viewMine')} onPress={() => navigate('/reports')} />
      </Sheet>
    );
  }

  return (
    <Sheet title={t(`report.title_${targetType}`)} onClose={onClose} tall footer={<Button title={t('report.send')} loading={busy} disabled={!reason} onPress={send} />}>
      <View style={{ gap: spacing.sm }}>
        {reasons.map((r) => (
          <Pressable key={r} onPress={() => setReason(r)} style={[styles.reason, reason === r && styles.reasonOn]}>
            <View style={[styles.radio, reason === r && styles.radioOn]} />
            <AppText style={{ flex: 1 }}>{r}</AppText>
          </Pressable>
        ))}
      </View>
      <TextInput value={details} onChangeText={setDetails} multiline maxLength={1000} placeholder={t('report.detailsPlaceholder')} style={styles.input} />
      <AppText variant="caption" color={colors.textMuted}>{t('report.privacy')}</AppText>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  reason: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  reasonOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.border },
  radioOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  input: { minHeight: 80, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: 15 },
});
