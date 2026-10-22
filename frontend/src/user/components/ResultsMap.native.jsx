import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dimensions, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import { env } from '../config/env';
import { AppText } from './ui';
import { formatPrice } from '../utils/listing';
import { colors, spacing } from '@theme/tokens';

/** Search results on a map (phone): each ad on its public (shifted) point in a circle; tap the price to open it. */
export const ResultsMap = ({ items, center }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const points = items.filter((l) => l.point);
  if (!env.googleMapsApiKey) {
    return (
      <View style={{ padding: spacing.xl, alignItems: 'center' }}>
        <AppText color={colors.textMuted} style={{ textAlign: 'center' }}>{t('search.mapUnavailable')}</AppText>
      </View>
    );
  }
  const first = center || points[0]?.point || { lat: 22.5, lng: 79 };
  return (
    <View style={{ height: Dimensions.get('window').height - 210, borderRadius: 14, overflow: 'hidden' }}>
      <MapView style={{ flex: 1 }} userInterfaceStyle="light" initialRegion={{ latitude: first.lat, longitude: first.lng, latitudeDelta: center ? 0.2 : 8, longitudeDelta: center ? 0.2 : 8 }}>
        {points.map((l) => (
          <Circle key={`c-${l.id}`} center={{ latitude: l.point.lat, longitude: l.point.lng }} radius={400} strokeColor={`${colors.primary}66`} fillColor={`${colors.primary}1F`} />
        ))}
        {points.map((l) => (
          <Marker key={l.id} coordinate={{ latitude: l.point.lat, longitude: l.point.lng }} onPress={() => navigate(l.listingType === 'auction' && l.auction?.id ? `/auctions/${l.auction.id}` : `/listing/${l.id}`)}>
            <View style={{ backgroundColor: colors.primary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
              <AppText variant="small" color={colors.white} style={{ fontWeight: '700' }}>{formatPrice(l.price, t, i18n.language) || ' '}</AppText>
            </View>
          </Marker>
        ))}
      </MapView>
    </View>
  );
};
