import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation from 'react-native-geolocation-service';

export type GpsError = 'denied' | 'unavailable';

/** Native GPS fix. Asks for runtime permission first (Android); rejects with 'denied' | 'unavailable'. */
export const getPosition = async (): Promise<{ lat: number; lng: number }> => {
  if (Platform.OS === 'android') {
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    if (result !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('denied' as GpsError);
  }
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      err => reject(new Error((err.code === 1 ? 'denied' : 'unavailable') as GpsError)),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
    );
  });
};
