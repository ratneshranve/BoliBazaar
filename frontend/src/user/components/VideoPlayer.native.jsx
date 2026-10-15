import Video from 'react-native-video';

/** A video with play controls (phone). */
export const VideoPlayer = ({ uri, style }) => (
  <Video source={{ uri }} controls paused resizeMode="contain" style={{ width: '100%', backgroundColor: '#000', minHeight: 200, ...style }} />
);
