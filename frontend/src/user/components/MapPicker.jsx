import { useEffect, useRef, useState } from 'react';
import { env } from '../config/env';
import { View } from './primitives';

/** Loads the Google Maps JS API once. */
let loader = null;
const loadMaps = () => {
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
 * Shows `fallback` when no Maps key is configured or the script cannot load.
 */
export const MapPicker = ({ lat, lng, onMove, height = 220, fallback }) => {
  const el = useRef(null);
  const state = useRef({ map: null, marker: null });
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  const [failed, setFailed] = useState(!env.googleMapsApiKey);

  useEffect(() => {
    if (!env.googleMapsApiKey) return undefined;
    let cancelled = false;
    loadMaps()
      .then((maps) => {
        if (cancelled || !el.current) return;
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
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
    // create the map once; later position changes are applied below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const { map, marker } = state.current;
    if (!map || !marker) return;
    const pos = { lat, lng };
    marker.setPosition(pos);
    map.panTo(pos);
  }, [lat, lng]);

  if (failed) return fallback ?? null;
  return <View style={{ height, borderRadius: 16, overflow: 'hidden', backgroundColor: '#eef1f4' }}><div ref={el} style={{ width: '100%', height: '100%' }} /></View>;
};
