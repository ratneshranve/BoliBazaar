import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Camera, Image as ImageIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from './ui';
import { Sheet } from './Sheet';
import { colors, radius, spacing } from '@theme/tokens';

/**
 * "Take photo" or "Choose from gallery", asked in the app's own bottom card instead of Android's plain pop-up.
 * askPhotoSource() resolves 'camera' | 'gallery' | null (closed). PhotoSourceHost is mounted once at the root.
 */
let open = null;
export const askPhotoSource = () => new Promise((resolve) => (open ? open(resolve) : resolve('gallery')));

export const PhotoSourceHost = () => {
  const { t } = useTranslation();
  const [answer, setAnswer] = useState(null); // the pending promise's resolve
  useEffect(() => {
    open = (resolve) => setAnswer(() => resolve);
    return () => (open = null);
  }, []);
  const done = (value) => {
    answer?.(value);
    setAnswer(null);
  };
  if (!answer) return null;
  return (
    <Sheet title={t('files.addPhoto')} onClose={() => done(null)}>
      <Pressable accessibilityLabel={t('files.camera')} onPress={() => done('camera')} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
        <View style={styles.icon}>
          <Camera size={24} color={colors.brand} />
        </View>
        <AppText variant="bodyStrong" style={{ flex: 1 }}>{t('files.camera')}</AppText>
      </Pressable>
      <Pressable accessibilityLabel={t('files.gallery')} onPress={() => done('gallery')} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
        <View style={styles.icon}>
          <ImageIcon size={24} color={colors.brand} />
        </View>
        <AppText variant="bodyStrong" style={{ flex: 1 }}>{t('files.gallery')}</AppText>
      </Pressable>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider },
  icon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
});
