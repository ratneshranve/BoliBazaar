import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, View } from 'react-native';
import MapView from 'react-native-maps';
import { env } from '../config/env';
import { LeafletMap } from './LeafletMap';

const PIN = '#0E9F6E'; // the logo's green
const MOVED = 0.00005; // ~5 m: smaller moves are not reported
const ZOOM_DELTA = 0.006; // about street level (zoom 16)

/** The pin in the middle of the map: head + stem + shadow, gently bouncing. Its tip is the chosen point. */
const CentrePin = () => {
  const bounce = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, { toValue: -4, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [bounce]);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ marginBottom: 32, alignItems: 'center' }}>
        <Animated.View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(14,159,110,0.18)', alignItems: 'center', justifyContent: 'center', marginBottom: -6, transform: [{ translateY: bounce }] }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: PIN, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' }} />
          </View>
        </Animated.View>
        <View style={{ width: 6, height: 24, backgroundColor: PIN, borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#fff', borderBottomLeftRadius: 3, borderBottomRightRadius: 3, elevation: 3 }} />
        <View style={{ position: 'absolute', bottom: -4, width: 18, height: 6, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.2)' }} />
      </View>
    </View>
  );
};

/**
 * Map with a fixed pin in the middle (phone). Drag or zoom the map; once it settles, `onMove(lat, lng)` reports the point
 * under the pin. Changing `lat`/`lng` from outside (search, GPS) moves the map there without reporting it back.
 * Google Maps when GOOGLE_MAPS_API_KEY is set; OpenStreetMap otherwise, like the website.
 */
export const PinMap = ({ lat, lng, onMove, height = 320 }) => {
  const map = useRef(null);
  const last = useRef({ lat, lng });
  const timer = useRef(null);
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  const [loading, setLoading] = useState(true);
  const google = Boolean(env.googleMapsApiKey);

  const report = (la, ln) => {
    if (Math.abs(la - last.current.lat) < MOVED && Math.abs(ln - last.current.lng) < MOVED) return;
    last.current = { lat: la, lng: ln };
    moveRef.current?.(la, ln);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  // moved from outside (search result, GPS, edit): go there quietly
  useEffect(() => {
    if (Math.abs(lat - last.current.lat) < MOVED && Math.abs(lng - last.current.lng) < MOVED) return;
    last.current = { lat, lng };
    if (google) map.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: ZOOM_DELTA, longitudeDelta: ZOOM_DELTA }, 400);
    else map.current?.moveTo(lat, lng);
  }, [lat, lng, google]);

  return (
    <View style={{ height, backgroundColor: '#eef1f4', overflow: 'hidden' }}>
      {google ? (
        <MapView
          ref={map}
          style={{ flex: 1 }}
          initialRegion={{ latitude: lat, longitude: lng, latitudeDelta: ZOOM_DELTA, longitudeDelta: ZOOM_DELTA }}
          onMapReady={() => setLoading(false)}
          onRegionChangeComplete={(r) => {
            clearTimeout(timer.current);
            timer.current = setTimeout(() => report(r.latitude, r.longitude), 500);
          }}
          showsPointsOfInterest={false}
          toolbarEnabled={false}
          moveOnMarkerPress={false}
        />
      ) : (
        <LeafletMap ref={map} lat={lat} lng={lng} mode="centre" onMove={report} onReady={() => setLoading(false)} onError={() => setLoading(false)} />
      )}
      <CentrePin />
      {loading && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.5)' }}>
          <ActivityIndicator color="#A41030" size="large" />
        </View>
      )}
    </View>
  );
};
