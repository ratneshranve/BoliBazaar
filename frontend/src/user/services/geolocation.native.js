import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation from 'react-native-geolocation-service';

const fix = (enableHighAccuracy, timeout) =>
  new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (err) => reject(new Error(err.code === 1 ? 'denied' : 'unavailable')),
      // Android's own location service: the library's Google-Play-services path is incompatible with the
      // newer Play services bundled with push notifications and crashes the app
      { enableHighAccuracy, timeout, maximumAge: 5 * 60 * 1000, forceLocationManager: true }
    );
  });

/** Phone GPS fix. Asks for location permission first; rejects with Error('denied' | 'unavailable'). */
export const getPosition = async () => {
  if (Platform.OS === 'android') {
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    if (result !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('denied');
  }
  try {
    return await fix(false, 8000); // network position: quick and enough for "ads near me"
  } catch (e) {
    if (e.message === 'denied') throw e;
    return fix(true, 15000); // then the satellite fix
  }
};
