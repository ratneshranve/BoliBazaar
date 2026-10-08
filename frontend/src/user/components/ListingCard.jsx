import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Heart, ImageOff, MapPin } from 'lucide-react';
import { Image, Pressable, StyleSheet, View } from './primitives';
import { AppText } from './ui';
import { listingsApi } from '../api/endpoints';
import { formatPrice } from '../utils/listing';
import { formatDistance } from '../utils/distance';
import { useAppSelector } from '../store';
import { colors, radius, spacing, shadow } from '@theme/tokens';

/** Heart that saves/unsaves an ad (guests are sent to log in). */
export const FavouriteButton = ({ listing, onChange, size = 20 }) => {
  const navigate = useNavigate();
  const loggedIn = useAppSelector((s) => s.session.status === 'authenticated');
  const [on, setOn] = useState(listing.isFavourite);
  const toggle = async () => {
    if (!loggedIn) return navigate('/login');
    const next = !on;
    setOn(next); // optimistic
    try {
      await listingsApi.favourite(listing.id, next);
      onChange?.(next);
    } catch {
      setOn(!next);
    }
  };
  return (
    <Pressable accessibilityLabel="Favourite" onPress={toggle} style={styles.heart}>
      <Heart size={size} color={on ? colors.primary : colors.text} fill={on ? colors.primary : 'none'} />
    </Pressable>
  );
};

/** Ad card used in grids and rails. `width` makes it a fixed-width rail item. */
export const ListingCard = ({ listing, width, onFavouriteChange }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const unit = useAppSelector((s) => s.app.bootstrap?.location?.distanceUnit);
  const typeTag = listing.listingType !== 'sell' ? t(`listing.type_${listing.listingType}`) : null;

  return (
    <Pressable accessibilityLabel={listing.title} onPress={() => navigate(`/listing/${listing.id}`)} style={[styles.card, width ? { width } : { flex: 1 }]}>
      <View style={styles.imgWrap}>
        {listing.cover ? (
          <Image source={{ uri: listing.cover }} style={styles.img} resizeMode="cover" />
        ) : (
          <View style={[styles.img, styles.noImg]}>
            <ImageOff size={28} color={colors.textSubtle} />
          </View>
        )}
        {typeTag && (
          <View style={styles.tag}>
            <AppText variant="small" color={colors.white}>{typeTag}</AppText>
          </View>
        )}
        <View style={styles.heartPos}>
          <FavouriteButton listing={listing} onChange={onFavouriteChange} size={18} />
        </View>
      </View>
      <View style={{ padding: spacing.sm, gap: 2 }}>
        <AppText variant="bodyStrong" numberOfLines={1}>{listing.title}</AppText>
        <View style={styles.row}>
          <MapPin size={12} color={colors.textMuted} />
          <AppText variant="small" color={colors.textMuted} numberOfLines={1} style={{ flex: 1 }}>
            {listing.place}
            {listing.distanceKm != null ? ` · ${formatDistance(listing.distanceKm, unit)}` : ''}
          </AppText>
        </View>
        <AppText variant="h3" color={colors.primary}>{formatPrice(listing.price, t, i18n.language)}</AppText>
        {listing.highlights.length > 0 && (
          <AppText variant="small" color={colors.textMuted} numberOfLines={1}>{listing.highlights.join(' · ')}</AppText>
        )}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.divider, ...shadow.card },
  imgWrap: { height: 130, backgroundColor: colors.surface },
  img: { width: '100%', height: '100%' },
  noImg: { alignItems: 'center', justifyContent: 'center' },
  tag: { position: 'absolute', left: spacing.sm, top: spacing.sm, backgroundColor: colors.auctionBlue, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  heartPos: { position: 'absolute', right: spacing.sm, top: spacing.sm },
  heart: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
