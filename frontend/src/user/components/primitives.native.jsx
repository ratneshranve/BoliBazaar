/**
 * Phone version of primitives.jsx: the real React Native components, with the same props the
 * website version accepts, so every screen renders the same on both. Website-only style values
 * (calc(), dvh, CSS-only keys) are translated here, and the site's Poppins font is applied.
 */
import { Children, forwardRef, isValidElement } from 'react';
import {
  ActivityIndicator as RNActivityIndicator,
  Alert as RNAlert,
  Dimensions,
  FlatList as RNFlatList,
  Image as RNImage,
  Linking as RNLinking,
  Platform as RNPlatform,
  Pressable as RNPressable,
  ScrollView as RNScrollView,
  StyleSheet as RNStyleSheet,
  Switch as RNSwitch,
  Text as RNText,
  TextInput as RNTextInput,
  View as RNView,
} from 'react-native';

/* ───── styles: website values → phone values ───── */

const flatten = (style) => {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten));
  return style;
};

const WEB_ONLY = new Set([
  'cursor', 'whiteSpace', 'overflowWrap', 'wordBreak', 'userSelect', 'transition', 'outline', 'objectFit',
  'overflowX', 'overflowY', 'boxSizing', 'scrollSnapType', 'scrollSnapAlign', 'gridTemplateColumns', 'textOverflow',
  'WebkitLineClamp', 'WebkitBoxOrient', 'listStyle', 'textDecoration', 'background',
]);

const screenH = () => Dimensions.get('window').height;

/** "calc(100dvh - 200px)", "100dvh", "calc(50% - 6px)" → numbers or percentages the phone understands. */
const convert = (key, value, out) => {
  if (typeof value !== 'string') return (out[key] = value);
  const dvh = /^(\d+(?:\.\d+)?)dvh$/.exec(value);
  if (dvh) return (out[key] = (screenH() * Number(dvh[1])) / 100);
  const calcVh = /^calc\((\d+(?:\.\d+)?)dvh\s*-\s*(\d+(?:\.\d+)?)px\)$/.exec(value);
  if (calcVh) return (out[key] = Math.max(0, (screenH() * Number(calcVh[1])) / 100 - Number(calcVh[2])));
  const calcPct = /^calc\((\d+(?:\.\d+)?)%\s*-\s*(\d+(?:\.\d+)?)px\)$/.exec(value);
  if (calcPct && key === 'width') {
    // columns in a wrapping row with a gap: grow from a smaller basis, never past the column width
    const pct = Number(calcPct[1]);
    out.flexBasis = `${Math.max(1, pct - 10)}%`;
    out.flexGrow = 1;
    out.maxWidth = `${pct}%`;
    return undefined;
  }
  if (calcPct) return (out[key] = `${calcPct[1]}%`);
  if (/px$/.test(value) && !Number.isNaN(parseFloat(value))) return (out[key] = parseFloat(value));
  return (out[key] = value);
};

const toNative = (style) => {
  const s = flatten(style);
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (v === undefined || WEB_ONLY.has(k)) continue;
    if (k === 'display' && !['flex', 'none'].includes(v)) continue;
    if (k === 'position' && !['absolute', 'relative'].includes(v)) continue;
    convert(k, v, out);
  }
  return out;
};

/* ───── the website's font ───── */

const POPPINS = { 300: 'Poppins-Light', 400: 'Poppins-Regular', 500: 'Poppins-Medium', 600: 'Poppins-SemiBold', 700: 'Poppins-Bold', 800: 'Poppins-ExtraBold', 900: 'Poppins-ExtraBold' };

const withFont = (s) => {
  const w = s.fontWeight === 'bold' ? 700 : s.fontWeight === 'normal' || !s.fontWeight ? 400 : Number(s.fontWeight);
  if (s.fontFamily && /serif/i.test(s.fontFamily) && !/sans/i.test(s.fontFamily)) return { ...s, fontFamily: 'serif' };
  const { fontWeight, ...rest } = s; // the weight is in the file; also asking Android for bold would thicken it twice
  return { ...rest, fontFamily: POPPINS[Math.min(900, Math.max(300, Math.round(w / 100) * 100))] || POPPINS[400] };
};

/* ───── loose text: the browser shows it, the phone needs it inside <Text> ───── */

const wrapText = (children) =>
  Children.map(children, (c) => {
    if (typeof c === 'string' || typeof c === 'number') return c === '' ? null : <Text>{c}</Text>;
    return c;
  });

/* ───── components ───── */

export const StyleSheet = { create: (s) => s, flatten, absoluteFill: RNStyleSheet.absoluteFillObject, hairlineWidth: RNStyleSheet.hairlineWidth };

export const View = forwardRef(function View({ style, children, ...rest }, ref) {
  return (
    <RNView ref={ref} style={toNative(style)} {...rest}>
      {wrapText(children)}
    </RNView>
  );
});

export function Text({ style, children, ...rest }) {
  return (
    // same size as the website on every phone: the phone's own font-size setting is not applied
    <RNText allowFontScaling={false} style={withFont({ color: '#111827', fontSize: 15, ...toNative(style) })} {...rest}>
      {children}
    </RNText>
  );
}

export function Pressable({ style, children, ...rest }) {
  return (
    <RNPressable style={typeof style === 'function' ? (st) => toNative(style(st)) : toNative(style)} {...rest}>
      {typeof children === 'function' ? (st) => wrapText(children(st)) : wrapText(children)}
    </RNPressable>
  );
}

export const TextInput = forwardRef(function TextInput({ style, multiline, ...rest }, ref) {
  const s = withFont({ color: '#111827', fontSize: 16, paddingVertical: 0, paddingHorizontal: 0, ...toNative(style) });
  return <RNTextInput ref={ref} allowFontScaling={false} multiline={multiline} textAlignVertical={multiline ? 'top' : 'center'} underlineColorAndroid="transparent" style={s} {...rest} />;
});

export const ScrollView = forwardRef(function ScrollView({ style, contentContainerStyle, children, horizontal, ...rest }, ref) {
  return (
    <RNScrollView
      ref={ref}
      horizontal={horizontal}
      // the website's horizontal strip is only as tall as its content
      style={horizontal ? { flexGrow: 0, flexShrink: 0, ...toNative(style) } : toNative(style)}
      contentContainerStyle={toNative(contentContainerStyle)}
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      {...rest}>
      {wrapText(children)}
    </RNScrollView>
  );
});

export function FlatList({ style, contentContainerStyle, ...rest }) {
  return <RNFlatList style={toNative(style)} contentContainerStyle={toNative(contentContainerStyle)} keyboardShouldPersistTaps="handled" {...rest} />;
}

export function ActivityIndicator({ style, ...rest }) {
  return <RNActivityIndicator style={toNative(style)} {...rest} />;
}

/** `source` may be { uri } (from the API) or a bundled picture (a number from require/import). */
export function Image({ source, style, ...rest }) {
  const src = typeof source === 'number' ? source : typeof source?.uri === 'number' ? source.uri : source;
  if (src && typeof src === 'object' && !src.uri) return null;
  return <RNImage source={src} style={toNative(style)} {...rest} />;
}

export function Switch({ value, onValueChange, disabled, activeColor, inactiveColor = '#C9C9C9' }) {
  return <RNSwitch value={!!value} onValueChange={onValueChange} disabled={disabled} trackColor={{ true: activeColor, false: inactiveColor }} thumbColor="#ffffff" />;
}

export { SafeAreaView } from 'react-native-safe-area-context';
export const StatusBar = () => null;
export const Alert = { alert: (title, message) => RNAlert.alert(String(title ?? ''), message ? String(message) : undefined) };
export const Linking = RNLinking;
export const Platform = RNPlatform;
export const toCss = (s) => toNative(s);
