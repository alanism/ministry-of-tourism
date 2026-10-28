import { fccShopUrl, selectCityApparel } from '@writers-board/core';

export interface WearTheTripProps { cityId: string; cityName: string; artwork: unknown; }
export default function WearTheTrip({ cityId, cityName, artwork }: WearTheTripProps) {
  try {
    const photos = selectCityApparel(cityId, artwork).slice(0, 3);
    if (!photos.length) return null;
    if (photos.some(photo => photo.rightsStatus !== 'approved' && !photo.credit?.trim())) return <p role="alert">FCC apparel needs its source credit before it can be displayed.</p>;
    return <section aria-label={`Wear the trip: ${cityName}`}>
      <h3>Wear the trip</h3><p>FCC city tees · {cityName}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,160px),1fr))', gap: 24 }}>
        {photos.map(photo => <figure key={photo.assetId} style={{ margin: 0 }}>
          <img src={photo.thumbnailUrl} alt={photo.label ?? photo.category} loading="lazy" referrerPolicy="no-referrer" style={{ width: '100%', height: 240, objectFit: 'contain' }} />
          <figcaption>{photo.label ?? photo.category}{photo.credit && <small style={{ display: 'block' }}>{photo.credit}</small>}</figcaption>
        </figure>)}
      </div>
      <a href={fccShopUrl(cityId)} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Order on FCC →</a>
    </section>;
  } catch { return <p role="alert">FCC apparel metadata could not be matched to this city.</p>; }
}
