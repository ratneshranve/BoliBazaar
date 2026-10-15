import MapView, { Marker } from 'react-native-maps';
import { View } from 'react-native';
import { env } from '../config/env';

/**
 * Map with one draggable pin (phone). Tap the map or drag the pin; `onMove(lat, lng)` reports the point.
 * Shows `fallback` when no Maps key is set, like the website.
 */
export const MapPicker = ({ lat, lng, onMove, height = 220, fallback }) => {
  if (!env.googleMapsApiKey) return fallback ?? null;
  const region = { latitude: lat ?? 22.5, longitude: lng ?? 79, latitudeDelta: lat != null ? 0.02 : 20, longitudeDelta: lng != null ? 0.02 : 20 };
  return (
    <View style={{ height, borderRadius: 16, overflow: 'hidden', backgroundColor: '#eef1f4' }}>
      <MapView style={{ flex: 1 }} initialRegion={region} onPress={(e) => onMove?.(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}>
        {lat != null && lng != null && (
          <Marker draggable coordinate={{ latitude: lat, longitude: lng }} onDragEnd={(e) => onMove?.(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)} />
        )}
      </MapView>
    </View>
  );
};
