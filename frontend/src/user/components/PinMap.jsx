import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { env } from '../config/env';
import { loadMaps } from './MapPicker';
import { View } from './primitives';

const PIN = '#0E9F6E'; // the logo's green
const MOVED = 0.00005; // ~5 m: smaller moves are not reported

/** The pin in the middle of the map: head + stem + shadow, gently bouncing. Its tip is the chosen point. */
const CentrePin = () => (
  <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500 }}>
    <style>{'@keyframes pin-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}'}</style>
    <div style={{ position: 'relative', marginBottom: 32, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: 40, height: 40, borderRadius: 20, background: 'rgba(14,159,110,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: -6, animation: 'pin-bounce 1s ease-in-out infinite' }}>
        <div style={{ width: 24, height: 24, borderRadius: 12, background: PIN, border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 8, height: 8, borderRadius: 4, background: '#fff' }} />
        </div>
      </div>
      <div style={{ width: 6, height: 24, background: PIN, borderLeft: '1px solid #fff', borderRight: '1px solid #fff', borderBottomLeftRadius: 3, borderBottomRightRadius: 3, boxShadow: '0 6px 12px rgba(6,78,59,0.35)' }} />
      <div style={{ position: 'absolute', bottom: -4, width: 18, height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.2)', filter: 'blur(1px)' }} />
    </div>
  </div>
);

/**
 * Map with a fixed pin in the middle. Drag or zoom the map; once it settles, `onMove(lat, lng)` reports the point under
 * the pin. Changing `lat`/`lng` from outside (search, GPS) moves the map there without reporting it back.
 * Google Maps when the key works; OpenStreetMap otherwise, so the screen never dead-ends.
 */
export const PinMap = ({ lat, lng, onMove, height = 320 }) => {
  const el = useRef(null);
  const api = useRef(null); // { center(): {lat,lng}, moveTo(lat,lng), destroy() }
  const last = useRef({ lat, lng });
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  const [engine, setEngine] = useState(env.googleMapsApiKey ? 'google' : 'osm');
  const [loading, setLoading] = useState(engine === 'google');

  const report = (la, ln) => {
    if (Math.abs(la - last.current.lat) < MOVED && Math.abs(ln - last.current.lng) < MOVED) return;
    last.current = { lat: la, lng: ln };
    moveRef.current?.(la, ln);
  };

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    const settle = (getCenter) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const c = getCenter();
        report(c.lat, c.lng);
      }, 500);
    };

    if (engine === 'google') {
      const prevAuth = window.gm_authFailure;
      window.gm_authFailure = () => !cancelled && setEngine('osm');
      loadMaps()
        .then((maps) => {
          if (cancelled || !el.current) return;
          const map = new maps.Map(el.current, {
            center: { ...last.current }, // where it should be now, even if it moved while the map script loaded
            zoom: 16,
            disableDefaultUI: true,
            zoomControl: true,
            gestureHandling: 'greedy',
            clickableIcons: false,
            styles: [
              { featureType: 'poi', stylers: [{ visibility: 'off' }] },
              { featureType: 'transit', stylers: [{ visibility: 'off' }] },
            ],
          });
          const center = () => ({ lat: map.getCenter().lat(), lng: map.getCenter().lng() });
          map.addListener('idle', () => settle(center));
          api.current = {
            moveTo: (la, ln) => {
              map.panTo({ lat: la, lng: ln });
              if (map.getZoom() < 16) map.setZoom(17);
            },
            destroy: () => maps.event.clearInstanceListeners(map),
          };
          setLoading(false);
        })
        .catch(() => !cancelled && setEngine('osm'));
      return () => {
        cancelled = true;
        clearTimeout(timer);
        window.gm_authFailure = prevAuth;
        api.current?.destroy();
        api.current = null;
      };
    }

    setLoading(false);
    const m = L.map(el.current, { center: [last.current.lat, last.current.lng], zoom: 16, zoomControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(m);
    L.control.zoom({ position: 'bottomleft' }).addTo(m);
    m.on('moveend', () => settle(() => m.getCenter()));
    api.current = {
      moveTo: (la, ln) => m.setView([la, ln], Math.max(m.getZoom(), 16)),
      destroy: () => m.remove(),
    };
    const t = setTimeout(() => m.invalidateSize(), 50);
    return () => {
      clearTimeout(t);
      clearTimeout(timer);
      api.current?.destroy();
      api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  // moved from outside (search result, GPS, edit): go there quietly
  useEffect(() => {
    if (Math.abs(lat - last.current.lat) < MOVED && Math.abs(lng - last.current.lng) < MOVED) return;
    last.current = { lat, lng };
    api.current?.moveTo(lat, lng);
  }, [lat, lng]);

  return (
    <View style={{ height, backgroundColor: '#eef1f4', overflow: 'hidden' }}>
      <div ref={el} key={engine} style={{ width: '100%', height: '100%' }} />
      <CentrePin />
      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.5)', zIndex: 400 }}>
          <div style={{ width: 30, height: 30, borderRadius: 15, border: '3px solid rgba(164,16,48,0.2)', borderTopColor: '#A41030', animation: 'rn-spin .8s linear infinite' }} />
        </div>
      )}
    </View>
  );
};
