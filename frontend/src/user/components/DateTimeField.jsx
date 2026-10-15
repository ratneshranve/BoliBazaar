/**
 * Date ("YYYY-MM-DD") or date + time ("YYYY-MM-DDTHH:mm", the viewer's own time zone) picker.
 * `value`/`onChange` use those strings on both the website and the phone (DateTimeField.native.jsx).
 */
export const DateTimeField = ({ mode = 'datetime', value, onChange, style, label, invalid }) => (
  <input
    type={mode === 'date' ? 'date' : 'datetime-local'}
    aria-label={label}
    value={value || ''}
    onChange={(e) => onChange(e.target.value || '')}
    style={{ height: 48, border: `1px solid ${invalid ? '#DC2626' : '#E5E7EB'}`, borderRadius: 10, padding: '0 12px', fontSize: 16, ...style }}
  />
);
