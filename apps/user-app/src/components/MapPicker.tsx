import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { env } from '../config/env';

/**
 * Map with one draggable pin (Google Maps SDK). Tap the map or drag the pin to move it;
 * `onMove(lat, lng)` reports the new point. Renders `fallback` when no Maps key is configured.
 */
export const MapPicker = ({ lat, lng, onMove, height = 220, fallback }: { lat: number; lng: number; onMove: (lat: number, lng: number) => void; height?: number; fallback?: React.ReactNode }) => {
  const map = useRef<MapView>(null);

  // follow the pin when the place changes from outside (search, GPS, popular place)
  useEffect(() => {
    map.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }, 300);
  }, [lat, lng]);

  if (!env.googleMapsApiKey) return <>{fallback}</>;

  return (
    <View style={[styles.wrap, { height }]}>
      <MapView
        ref={map}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: lat, longitude: lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
        onPress={e => onMove(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}
        toolbarEnabled={false}>
        <Marker draggable coordinate={{ latitude: lat, longitude: lng }} onDragEnd={e => onMove(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)} />
      </MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#eef1f4' },
});
