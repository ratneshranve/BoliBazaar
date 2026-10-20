import { useEffect, useRef, useState } from 'react';
import { env } from '../config/env';
import { View } from './primitives';

/** Loads the Google Maps JS API once. */
let loader = null;
let mapsAuthFailed = false;

if (typeof window !== 'undefined') {
  window.gm_authFailure = () => {
    mapsAuthFailed = true;
  };
}

export const loadMaps = () => {
  if (mapsAuthFailed) return Promise.reject(new Error('maps-auth-failed'));
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (!loader) {
    loader = new Promise((resolve, reject) => {
      const cb = `__gmaps_${Date.now()}`;
      window[cb] = () => resolve(window.google.maps);
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(env.googleMapsApiKey)}&callback=${cb}&loading=async`;
      s.async = true;
      s.onerror = () => {
        loader = null;
        reject(new Error('maps-load-failed'));
      };
      document.head.appendChild(s);
    });
  }
  return loader;
};

/**
 * Map with one draggable pin. Tap the map or drag the pin to move it; `onMove(lat, lng)` reports the new point.
 * Shows OpenStreetMap or `fallback` when Google Maps key is suspended or unavailable.
 */
export const MapPicker = ({ lat, lng, onMove, height = 220, fallback }) => {
  const el = useRef(null);
  const state = useRef({ map: null, marker: null });
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  const [failed, setFailed] = useState(!env.googleMapsApiKey || mapsAuthFailed);

  useEffect(() => {
    if (!env.googleMapsApiKey || mapsAuthFailed) {
      setFailed(true);
      return undefined;
    }
    let cancelled = false;
    window.gm_authFailure = () => {
      mapsAuthFailed = true;
      if (!cancelled) setFailed(true);
    };
    loadMaps()
      .then((maps) => {
        if (cancelled || !el.current || mapsAuthFailed) {
          if (mapsAuthFailed && !cancelled) setFailed(true);
          return;
        }
        try {
          const center = { lat, lng };
          const map = new maps.Map(el.current, { center, zoom: 13, disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy' });
          const marker = new maps.Marker({ position: center, map, draggable: true });
          marker.addListener('dragend', () => {
            const p = marker.getPosition();
            moveRef.current?.(p.lat(), p.lng());
          });
          map.addListener('click', (e) => {
            marker.setPosition(e.latLng);
            moveRef.current?.(e.latLng.lat(), e.latLng.lng());
          });
          state.current = { map, marker };
        } catch {
          if (!cancelled) setFailed(true);
        }
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const { map, marker } = state.current;
    if (!map || !marker) return;
    const pos = { lat, lng };
    marker.setPosition(pos);
    map.panTo(pos);
  }, [lat, lng]);

  if (failed) {
    if (lat && lng) {
      const delta = 0.012;
      const bbox = `${lng - delta}%2C${lat - delta}%2C${lng + delta}%2C${lat + delta}`;
      return (
        <View style={{ height, borderRadius: 16, overflow: 'hidden', backgroundColor: '#eef1f4', borderWidth: 1, borderColor: '#e2e8f0' }}>
          <iframe
            title="OpenStreetMap"
            width="100%"
            height="100%"
            style={{ border: 0 }}
            scrolling="no"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`}
          />
        </View>
      );
    }
    return fallback ?? null;
  }

  return <View style={{ height, borderRadius: 16, overflow: 'hidden', backgroundColor: '#eef1f4' }}><div ref={el} style={{ width: '100%', height: '100%' }} /></View>;
};
