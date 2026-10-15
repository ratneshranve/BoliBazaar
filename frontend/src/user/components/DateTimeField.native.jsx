import { Pressable } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { AppText } from './ui';
import { colors } from '@theme/tokens';

const pad = (n) => String(n).padStart(2, '0');
const toValue = (d, mode) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}${mode === 'date' ? '' : `T${pad(d.getHours())}:${pad(d.getMinutes())}`}`;
const parse = (v) => (v ? new Date(v.length === 10 ? `${v}T00:00` : v) : new Date());

/** Phone picker: the system date dialog, then the time dialog (same value strings as the website). */
export const DateTimeField = ({ mode = 'datetime', value, onChange, style, label, invalid }) => {
  const { i18n } = useTranslation();
  const open = () => {
    const start = parse(value);
    DateTimePickerAndroid.open({
      value: start,
      mode: 'date',
      onChange: (e, day) => {
        if (e.type !== 'set' || !day) return;
        if (mode === 'date') {
          onChange(toValue(day, 'date'));
          return;
        }
        DateTimePickerAndroid.open({
          value: start,
          mode: 'time',
          onChange: (e2, time) => {
            if (e2.type !== 'set' || !time) return;
            const d = new Date(day);
            d.setHours(time.getHours(), time.getMinutes(), 0, 0);
            onChange(toValue(d, 'datetime'));
          },
        });
      },
    });
  };
  const shown = value ? parse(value).toLocaleString(i18n.language, mode === 'date' ? { dateStyle: 'medium' } : { dateStyle: 'medium', timeStyle: 'short' }) : '';
  return (
    <Pressable accessibilityLabel={label} onPress={open} style={{ height: 48, borderWidth: 1, borderColor: invalid ? colors.danger : colors.border, borderRadius: 10, paddingHorizontal: 12, justifyContent: 'center', ...style }}>
      <AppText color={shown ? colors.text : colors.textSubtle}>{shown || label || '—'}</AppText>
    </Pressable>
  );
};
