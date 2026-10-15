import { VideoPlayer } from './VideoPlayer';

/** Swipe through photos (and the ad's video at the end). `onIndex` reports which one is showing. */
export const Gallery = ({ photos, video, onIndex }) => (
  <div
    onScroll={(e) => onIndex?.(Math.round(e.target.scrollLeft / e.target.clientWidth))}
    style={{ display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', height: '100%' }}>
    {photos.map((u) => (
      <img key={u} src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', flex: '0 0 100%', scrollSnapAlign: 'start' }} />
    ))}
    {video && (
      <div style={{ flex: '0 0 100%', height: '100%', scrollSnapAlign: 'start', background: '#000' }}>
        <VideoPlayer uri={video} style={{ height: '100%' }} />
      </div>
    )}
  </div>
);
