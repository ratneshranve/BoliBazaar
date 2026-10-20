import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { env } from '../config/env';
import { LEAFLET_CSS, LEAFLET_JS } from './leafletSource';

/**
 * OpenStreetMap through Leaflet inside a WebView (phone) — the same map the website falls back to, so it works
 * without a Google Maps key. `mode`: 'centre' reports the map centre once it settles (fixed pin drawn by the caller),
 * 'marker' shows a draggable pin that also jumps to a tap. `onMove(lat, lng)` reports the point.
 * Leaflet itself ships inside the app (leafletSource.native.js, generated from frontend/node_modules/leaflet/dist);
 * only the map tiles come from the internet.
 */
const page = (lat, lng, zoom, mode) => `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>${LEAFLET_CSS}</style>
<style>html,body,#m{margin:0;height:100%;width:100%;background:#eef1f4}.leaflet-control-attribution{font-size:9px}
.pin{width:26px;height:26px;border-radius:50% 50% 50% 0;background:#0E9F6E;border:3px solid #fff;transform:rotate(-45deg);box-shadow:0 4px 10px rgba(6,78,59,.4)}
.pin:after{content:'';position:absolute;left:7px;top:7px;width:6px;height:6px;border-radius:50%;background:#fff}</style>
</head><body><div id="m"></div>
<script>${LEAFLET_JS}</script>
<script>
(function () {
  var send = function (o) { window.ReactNativeWebView.postMessage(JSON.stringify(o)); };
  if (!window.L) { send({ type: 'error' }); return; }
  var mode = ${JSON.stringify(mode)};
  var map = L.map('m', { center: [${lat}, ${lng}], zoom: ${zoom}, zoomControl: false });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  var marker = null;
  var report = function (p) { send({ type: 'move', lat: p.lat, lng: p.lng }); };
  if (mode === 'marker') {
    var icon = L.divIcon({ className: '', html: '<div class="pin"></div>', iconSize: [32, 32], iconAnchor: [16, 34] });
    marker = L.marker([${lat}, ${lng}], { draggable: true, icon: icon }).addTo(map);
    marker.on('dragend', function () { report(marker.getLatLng()); });
    map.on('click', function (e) { marker.setLatLng(e.latlng); report(e.latlng); });
  } else {
    var timer = null;
    map.on('moveend', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { report(map.getCenter()); }, 500);
    });
  }
  window.__moveTo = function (la, ln) {
    map.setView([la, ln], Math.max(map.getZoom(), ${zoom}));
    if (marker) marker.setLatLng([la, ln]);
  };
  map.whenReady(function () { send({ type: 'ready' }); });
})();
</script></body></html>`;

// tile servers ask for a referring site; the app's own website (or API) address is used
const baseUrl = () => env.webUrl || (env.apiBaseUrl ? new URL(env.apiBaseUrl).origin : undefined);

export const LeafletMap = forwardRef(function LeafletMap({ lat, lng, zoom = 16, mode = 'centre', onMove, onReady, onError, style }, ref) {
  const web = useRef(null);
  const handlers = useRef({});
  handlers.current = { onMove, onReady, onError };
  // the page is built once with the first position; later moves go through moveTo
  const html = useMemo(() => page(lat, lng, zoom, mode), []); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    moveTo: (la, ln) => web.current?.injectJavaScript(`window.__moveTo && window.__moveTo(${Number(la)}, ${Number(ln)}); true;`),
  }));

  const onMessage = (e) => {
    let msg;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'move') handlers.current.onMove?.(msg.lat, msg.lng);
    else if (msg.type === 'ready') handlers.current.onReady?.();
    else if (msg.type === 'error') handlers.current.onError?.();
  };

  return (
    <View style={[{ flex: 1, backgroundColor: '#eef1f4' }, style]}>
      <WebView
        ref={web}
        source={{ html, baseUrl: baseUrl() }}
        originWhitelist={['*']}
        onMessage={onMessage}
        onError={() => handlers.current.onError?.()}
        javaScriptEnabled
        domStorageEnabled
        nestedScrollEnabled // the map keeps its drags inside a scrolling page
        overScrollMode="never"
        scrollEnabled={false}
        setBuiltInZoomControls={false}
        style={{ flex: 1, backgroundColor: 'transparent' }}
      />
    </View>
  );
});
