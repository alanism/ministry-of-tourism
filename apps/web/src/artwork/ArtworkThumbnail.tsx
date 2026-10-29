import {useState,type CSSProperties} from 'react';
import type {Artwork} from './catalog';

export default function ArtworkThumbnail({ artwork }: { artwork: Artwork }) {
  const [failed, setFailed] = useState(false);
  const [x, y, w, h] = artwork.crop ?? [0, 0, 1, 1];
  const style: CSSProperties = { width: `${100 / w}%`, height: `${100 / h}%`, left: `${-100 * x / w}%`, top: `${-100 * y / h}%` };
  return <span className="artwork-preview"><span className="artwork-crop" style={{ aspectRatio: (artwork.width * w) / (artwork.height * h) }}>
    {failed ? <span className="artwork-thumb-error">Preview unavailable</span>
      : <img src={artwork.thumb} alt="" loading="lazy" decoding="async" style={style} onError={() => setFailed(true)} />}
  </span></span>;
}
