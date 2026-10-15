import { useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { VideoPlayer } from './VideoPlayer';

/** Swipe through photos (and the ad's video at the end), one per screen width. */
export const Gallery = ({ photos, video, onIndex }) => {
  const [w, setW] = useState(0);
  return (
    <View style={{ flex: 1 }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(e) => onIndex?.(Math.round(e.nativeEvent.contentOffset.x / w))}>
          {photos.map((u) => <Image key={u} source={{ uri: u }} style={{ width: w, height: '100%' }} resizeMode="cover" />)}
          {video && (
            <View style={{ width: w, height: '100%', backgroundColor: '#000', justifyContent: 'center' }}>
              <VideoPlayer uri={video} style={{ height: '100%' }} />
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
};
