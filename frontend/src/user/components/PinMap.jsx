import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { View } from './primitives';
import { colors } from '@theme/tokens';

/**
 * Map with a fixed pin in the middle: drag or zoom the map and the pin stays put; `onMove(lat, lng)` reports the
 * point under the pin once the map stops moving. Changing `lat`/`lng` from outside (search, GPS) pans the map there.
 * OpenStreetMap tiles, so it works without a Google key.
 */
export const PinMap = ({ lat, lng, onMove, height = 280 }) => {
  const el = useRef(null);
  const map = useRef(null);
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  const programmatic = useRef(false);

  useEffect(() => {
    const m = L.map(el.current, { center: [lat, lng], zoom: 16, zoomControl: false, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(m);
    L.control.zoom({ position: 'topright' }).addTo(m);
    m.on('moveend', () => {
      if (programmatic.current) {
        programmatic.current = false;
        return;
      }
      const c = m.getCenter();
      moveRef.current?.(c.lat, c.lng);
    });
    map.current = m;
    // the box may still be laying out when the map is created
    const t = setTimeout(() => m.invalidateSize(), 50);
    return () => {
      clearTimeout(t);
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const c = m.getCenter();
    if (Math.abs(c.lat - lat) < 1e-6 && Math.abs(c.lng - lng) < 1e-6) return;
    programmatic.current = true;
    m.setView([lat, lng], Math.max(m.getZoom(), 16));
  }, [lat, lng]);

  return (
    <View style={{ height, backgroundColor: '#eef1f4', overflow: 'hidden' }}>
      <div ref={el} style={{ width: '100%', height: '100%' }} />
      {/* the pin: its tip sits exactly on the map centre */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -100%)', pointerEvents: 'none', zIndex: 500 }}>
        <svg width="38" height="48" viewBox="0 0 38 48">
          <path d="M19 47C19 47 3 29 3 18a16 16 0 1 1 32 0c0 11-16 29-16 29z" fill={colors.primary} stroke="#fff" strokeWidth="2.5" />
          <circle cx="19" cy="18" r="6" fill="#fff" />
        </svg>
      </div>
    </View>
  );
};
