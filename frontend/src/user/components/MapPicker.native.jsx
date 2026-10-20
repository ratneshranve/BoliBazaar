import { useEffect, useRef } from 'react';
import MapView, { Marker } from 'react-native-maps';
import { View } from 'react-native';
import { env } from '../config/env';
import { LeafletMap } from './LeafletMap';

/**
 * Map with one draggable pin (phone). Tap the map or drag the pin; `onMove(lat, lng)` reports the point.
 * Google Maps when GOOGLE_MAPS_API_KEY is set; OpenStreetMap otherwise, like the website. `fallback` shows only
 * while there is no point to put on the map.
 */
export const MapPicker = ({ lat, lng, onMove, height = 220, fallback }) => {
  const osm = useRef(null);
  const box = { height, borderRadius: 16, overflow: 'hidden', backgroundColor: '#eef1f4', borderWidth: 1, borderColor: '#e2e8f0' };
  // the place changed outside the map (search, GPS): move the pin there
  useEffect(() => {
    if (lat != null && lng != null) osm.current?.moveTo(lat, lng);
  }, [lat, lng]);
  if (!env.googleMapsApiKey) {
    if (lat == null || lng == null) return fallback ?? null;
    return (
      <View style={box}>
        <LeafletMap ref={osm} lat={lat} lng={lng} zoom={14} mode="marker" onMove={(la, ln) => onMove?.(la, ln)} />
      </View>
    );
  }
  const region = { latitude: lat ?? 22.5, longitude: lng ?? 79, latitudeDelta: lat != null ? 0.02 : 20, longitudeDelta: lng != null ? 0.02 : 20 };
  return (
    <View style={box}>
      <MapView style={{ flex: 1 }} initialRegion={region} onPress={(e) => onMove?.(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}>
        {lat != null && lng != null && (
          <Marker draggable coordinate={{ latitude: lat, longitude: lng }} onDragEnd={(e) => onMove?.(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)} />
        )}
      </MapView>
    </View>
  );
};
