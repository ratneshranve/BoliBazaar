import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { env } from '../config/env';
import { loadMaps } from './MapPicker';
import { AppText } from './ui';
import { View } from './primitives';
import { formatPrice } from '../utils/listing';
import { colors, spacing } from '@theme/tokens';

/**
 * Search results on a map. Each ad sits on its public (shifted) point inside a circle, so the real spot is never shown.
 * Tap a price tag to open the ad.
 */
export const ResultsMap = ({ items, center, height = 'calc(100dvh - 210px)' }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const el = useRef(null);
  const map = useRef(null);
  const drawn = useRef([]);
  const [failed, setFailed] = useState(!env.googleMapsApiKey);

  useEffect(() => {
    if (!env.googleMapsApiKey) return undefined;
    let cancelled = false;
    loadMaps()
      .then((maps) => {
        if (cancelled || !el.current) return;
        drawn.current.forEach((o) => o.setMap(null));
        drawn.current = [];
        const points = items.filter((l) => l.point);
        if (!map.current) {
          map.current = new maps.Map(el.current, {
            center: center || points[0]?.point || { lat: 22.5, lng: 79 },
            zoom: center ? 11 : 5,
            disableDefaultUI: true,
            zoomControl: true,
            clickableIcons: false,
          });
        }
        const bounds = new maps.LatLngBounds();
        points.forEach((l) => {
          bounds.extend(l.point);
          drawn.current.push(new maps.Circle({ map: map.current, center: l.point, radius: 400, strokeColor: colors.primary, strokeOpacity: 0.4, strokeWeight: 1, fillColor: colors.primary, fillOpacity: 0.12, clickable: false }));
          const marker = new maps.Marker({
            map: map.current,
            position: l.point,
            title: l.title,
            label: { text: formatPrice(l.price, t, i18n.language) || ' ', color: colors.white, fontSize: '11px', fontWeight: '700' },
            icon: { path: 'M -28 -12 L 28 -12 L 28 12 L 4 12 L 0 18 L -4 12 L -28 12 Z', fillColor: colors.primary, fillOpacity: 1, strokeWeight: 0, scale: 1, labelOrigin: new maps.Point(0, 0) },
          });
          marker.addListener('click', () => navigate(l.listingType === 'auction' && l.auction?.id ? `/auctions/${l.auction.id}` : `/listing/${l.id}`));
          drawn.current.push(marker);
        });
        if (points.length > 1) map.current.fitBounds(bounds, 40);
        else if (points.length === 1) map.current.setCenter(points[0].point);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [items, center, navigate, t, i18n.language]);

  if (failed) {
    return (
      <View style={{ padding: spacing.xl, alignItems: 'center' }}>
        <AppText color={colors.textMuted} style={{ textAlign: 'center' }}>{t('search.mapUnavailable')}</AppText>
      </View>
    );
  }
  return <div ref={el} style={{ width: '100%', height, borderRadius: 14, overflow: 'hidden' }} />;
};
