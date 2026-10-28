export type SamplePhoto = 'river' | 'street-art' | 'doorway' | 'room';

/** Optional local media is absent from the public source. Enable only with licensed files installed. */
export function samplePhotoUrl(photo: SamplePhoto): string | undefined {
  return import.meta.env.VITE_MOT_SAMPLE_MEDIA === 'enabled' ? `/sample/${photo}.jpg` : undefined;
}
