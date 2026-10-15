/** A video with play controls. */
export const VideoPlayer = ({ uri, style }) => (
  <video src={uri} controls preload="metadata" style={{ width: '100%', background: '#000', objectFit: 'contain', display: 'block', ...style }} />
);
