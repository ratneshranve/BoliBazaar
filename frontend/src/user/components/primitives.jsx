/**
 * React Native-compatible primitives for the web.
 * Screens import View/Text/Pressable/... from here exactly as they would from 'react-native'.
 * To convert to React Native later: change this import to 'react-native' (see docs/18-build-phases.md).
 */
import { createContext, forwardRef, useContext, useState } from 'react';

/* ───── style conversion (RN style objects → CSS) ───── */
const flatten = (style) => {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten));
  return style;
};

export const toCss = (input) => {
  const s = { ...flatten(input) };
  const css = {};
  const moveBox = (prefix, key) => {
    const h = s[`${key}Horizontal`];
    const v = s[`${key}Vertical`];
    if (h !== undefined) { css[`${key}Left`] = h; css[`${key}Right`] = h; delete s[`${key}Horizontal`]; }
    if (v !== undefined) { css[`${key}Top`] = v; css[`${key}Bottom`] = v; delete s[`${key}Vertical`]; }
  };
  moveBox('p', 'padding');
  moveBox('m', 'margin');

  if (s.shadowColor || s.elevation) {
    const o = s.shadowOffset || { width: 0, height: 2 };
    const r = (s.shadowRadius ?? 6) * 1.6;
    css.boxShadow = `${o.width}px ${o.height}px ${r}px ${hexA(s.shadowColor || '#000', s.shadowOpacity ?? 0.12)}`;
  }
  delete s.shadowColor; delete s.shadowOpacity; delete s.shadowRadius; delete s.shadowOffset; delete s.elevation;

  if (typeof s.flex === 'number') {
    css.flex = `${s.flex} ${s.flex} 0%`;
    // like React Native Web: a flexible view may shrink below its content, so scroll areas inside it can scroll
    if (s.minHeight === undefined) css.minHeight = 0;
    delete s.flex;
  }
  if (typeof s.lineHeight === 'number') { css.lineHeight = `${s.lineHeight}px`; delete s.lineHeight; }
  if (s.borderWidth !== undefined && s.borderStyle === undefined) css.borderStyle = 'solid';
  for (const side of ['Top', 'Bottom', 'Left', 'Right']) {
    if (s[`border${side}Width`] !== undefined && s[`border${side}Style`] === undefined) css[`border${side}Style`] = 'solid';
  }
  return { ...s, ...css };
};

const hexA = (hex, a) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(0,0,0,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export const StyleSheet = { create: (s) => s, flatten, absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } };

const base = { display: 'flex', flexDirection: 'column', position: 'relative', boxSizing: 'border-box', minWidth: 0, flexShrink: 0 };

/* ───── components ───── */
export const View = forwardRef(function View({ style, children, pointerEvents, ...rest }, ref) {
  const { accessibilityRole, accessibilityLabel, ...dom } = rest;
  return (
    <div ref={ref} role={accessibilityRole} aria-label={accessibilityLabel} style={{ ...base, ...toCss(style), pointerEvents }} {...pick(dom)}>
      {children}
    </div>
  );
});

const InsideText = createContext(false);

export function Text({ style, children, numberOfLines, onPress, ...rest }) {
  const inside = useContext(InsideText);
  const css = toCss(style);
  const clamp =
    numberOfLines === 1
      ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
      : numberOfLines
        ? { overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: numberOfLines, WebkitBoxOrient: 'vertical' }
        : {};
  return (
    <InsideText.Provider value>
      <span
        onClick={onPress}
        style={{ display: inside ? 'inline' : 'block', whiteSpace: 'pre-wrap', margin: 0, cursor: onPress ? 'pointer' : undefined, ...css, ...clamp }}
        {...pick(rest)}
      >
        {children}
      </span>
    </InsideText.Provider>
  );
}

export function Pressable({ style, children, onPress, disabled, accessibilityRole = 'button', accessibilityState, accessibilityLabel, hitSlop, ...rest }) {
  const [pressed, setPressed] = useState(false);
  const resolved = typeof style === 'function' ? style({ pressed }) : style;
  return (
    <div
      role={accessibilityRole === 'tab' ? 'tab' : accessibilityRole}
      aria-label={accessibilityLabel}
      aria-disabled={disabled || undefined}
      aria-checked={accessibilityState?.checked}
      aria-selected={accessibilityState?.selected}
      tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : onPress}
      onKeyDown={(e) => !disabled && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPress?.())}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{ ...base, cursor: disabled ? 'default' : 'pointer', userSelect: 'none', ...toCss(resolved) }}
      {...pick(rest)}
    >
      {typeof children === 'function' ? children({ pressed }) : children}
    </div>
  );
}

export const TextInput = forwardRef(function TextInput({
  style, value, onChangeText, placeholder, placeholderTextColor, keyboardType, maxLength, autoFocus,
  secureTextEntry, onSubmitEditing, multiline, autoComplete, textContentType, returnKeyType, editable = true, onFocus, onBlur, ...rest
}, ref) {
  const inputMode = { 'phone-pad': 'tel', 'number-pad': 'numeric', 'numeric': 'numeric', 'email-address': 'email' }[keyboardType];
  const type = secureTextEntry ? 'password' : keyboardType === 'phone-pad' ? 'tel' : keyboardType === 'email-address' ? 'email' : 'text';
  const common = {
    value: value ?? '',
    placeholder,
    maxLength,
    autoFocus,
    disabled: !editable,
    inputMode,
    autoComplete: autoComplete === 'sms-otp' || textContentType === 'oneTimeCode' ? 'one-time-code' : autoComplete,
    onChange: (e) => onChangeText?.(e.target.value),
    onFocus,
    onBlur,
    ref,
    style: { ...toCss(style), '--ph': placeholderTextColor, border: 'none', background: 'transparent', minWidth: 0, boxSizing: 'border-box' },
    ...pick(rest),
  };
  return multiline ? (
    <textarea {...common} />
  ) : (
    <input {...common} type={type} onKeyDown={(e) => e.key === 'Enter' && onSubmitEditing?.()} />
  );
});

export const ScrollView = forwardRef(function ScrollView({ style, contentContainerStyle, children, horizontal }, ref) {
  return (
    <div
      ref={ref}
      style={{
        ...base,
        // vertical: fill the space left and scroll inside it; horizontal: a strip as tall as its content
        ...(horizontal ? { flex: '0 0 auto' } : { flex: '1 1 0%', minHeight: 0 }),
        overflowY: horizontal ? 'hidden' : 'auto',
        overflowX: horizontal ? 'auto' : 'hidden',
        ...toCss(style),
      }}>
      <div style={{ ...base, flexDirection: horizontal ? 'row' : 'column', ...toCss(contentContainerStyle) }}>{children}</div>
    </div>
  );
});

export function FlatList({ data, renderItem, keyExtractor, ListHeaderComponent, ListFooterComponent, contentContainerStyle, style }) {
  const wrap = (Comp) => (typeof Comp === 'function' ? <Comp /> : Comp);
  return (
    <ScrollView style={style} contentContainerStyle={contentContainerStyle}>
      {wrap(ListHeaderComponent)}
      {data.map((item, index) => (
        <div key={keyExtractor ? keyExtractor(item, index) : index} style={{ display: 'contents' }}>
          {renderItem({ item, index })}
        </div>
      ))}
      {wrap(ListFooterComponent)}
    </ScrollView>
  );
}

/** Like RN: the spinner sits centred in its own box; `style` (padding, margins…) applies to that box, not the ring. */
export function ActivityIndicator({ color = '#999', size = 'small', style }) {
  const px = size === 'large' ? 36 : 20;
  return (
    <div role="progressbar" aria-busy="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', ...toCss(style) }}>
      <div style={{ width: px, height: px, flexShrink: 0, boxSizing: 'border-box', border: `${px / 8}px solid ${color}33`, borderTopColor: color, borderRadius: '50%', animation: 'rn-spin .8s linear infinite' }} />
    </div>
  );
}

export function Image({ source, style, resizeMode = 'cover', ...rest }) {
  const fit = { contain: 'contain', cover: 'cover', stretch: 'fill', center: 'none' }[resizeMode];
  return <img src={source?.uri} alt="" draggable={false} style={{ display: 'block', objectFit: fit, ...toCss(style) }} {...pick(rest)} />;
}

/** On/off switch (RN Switch). */
export function Switch({ value, onValueChange, disabled, activeColor, inactiveColor = '#C9C9C9' }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!value}
      disabled={disabled}
      onClick={() => onValueChange?.(!value)}
      style={{ width: 46, height: 26, borderRadius: 13, border: 'none', padding: 3, background: value ? activeColor : inactiveColor, cursor: 'pointer', display: 'flex', justifyContent: value ? 'flex-end' : 'flex-start', opacity: disabled ? 0.5 : 1 }}>
      <span style={{ width: 20, height: 20, borderRadius: 10, background: '#fff' }} />
    </button>
  );
}

export const SafeAreaView = View;
export const StatusBar = () => null;
export const Alert = { alert: (title, message) => window.alert([title, message].filter(Boolean).join('\n')) };
export const Linking = { openURL: (url) => window.open(url, '_blank', 'noopener') };
export const Platform = { OS: 'web' };

/** Pass through only safe DOM attributes (data-*, id). */
function pick(props) {
  const out = {};
  for (const k of Object.keys(props)) if (k.startsWith('data-') || k === 'id') out[k] = props[k];
  return out;
}
