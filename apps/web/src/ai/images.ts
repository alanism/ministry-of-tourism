// Storyboard art through OpenRouter's Images API, with the writer's own key.
import { AiError } from './providers';
import { aiSettings } from './settings';

const BASE = 'https://openrouter.ai/api/v1';

export interface ImageRequest {
  prompt: string;
  aspect: string;
  /** Data URLs: a reference photo, or the sketch being colored. */
  references?: string[];
}

export interface GeneratedImage {
  blob: Blob;
  /** What OpenRouter reported it cost, in US dollars. */
  cost?: number;
}

/** Lets tests and demos stand in for the image model (development builds only). */
declare global {
  interface Window {
    __writersBoardStandInImage?: (request: ImageRequest) => Blob | Promise<Blob>;
  }
}

function key(): string {
  const value = aiSettings().keys.openrouter;
  if (!value) throw new AiError('Add your OpenRouter key in AI settings first.');
  return value;
}

export async function generateImage(request: ImageRequest, signal?: AbortSignal): Promise<GeneratedImage> {
  if (import.meta.env.DEV && window.__writersBoardStandInImage) return { blob: await window.__writersBoardStandInImage(request), cost: 0 };
  const model = aiSettings().storyboard.model.trim();
  if (!model) throw new AiError('Choose an image model in the storyboard settings.');
  const response = await fetch(`${BASE}/images`, {
    method: 'POST',
    signal,
    headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: request.prompt,
      n: 1,
      aspect_ratio: request.aspect,
      ...(request.references?.length ? { input_references: request.references.map((url) => ({ type: 'image_url', image_url: { url } })) } : {}),
    }),
  });
  if (!response.ok) throw new AiError(`OpenRouter error ${response.status}: ${(await response.text().catch(() => '')).slice(0, 240)}`);
  const data = (await response.json()) as { data?: { b64_json?: string; url?: string; media_type?: string }[]; usage?: { cost?: number } };
  const image = data.data?.[0];
  if (!image) throw new AiError('OpenRouter returned no image.');
  let blob: Blob;
  if (image.b64_json) {
    const bytes = Uint8Array.from(atob(image.b64_json), (c) => c.charCodeAt(0));
    blob = new Blob([bytes], { type: image.media_type ?? 'image/png' });
  } else if (image.url) {
    blob = await (await fetch(image.url, { signal })).blob();
  } else throw new AiError('OpenRouter returned an image in a form this app does not read.');
  return { blob, cost: data.usage?.cost };
}

const prices = new Map<string, Promise<number | null>>();

/** The listed price of one output image for a model (cheapest endpoint), or null when not listed. */
export function imagePrice(model: string): Promise<number | null> {
  const id = model.trim();
  if (!id) return Promise.resolve(null);
  if (import.meta.env.DEV && window.__writersBoardStandInImage) return Promise.resolve(0.04);
  let price = prices.get(id);
  if (!price) {
    price = fetch(`${BASE}/images/models/${id.split('/').map(encodeURIComponent).join('/')}/endpoints`, {
      headers: aiSettings().keys.openrouter ? { Authorization: `Bearer ${aiSettings().keys.openrouter}` } : {},
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        // Find every per-image price for output images, wherever the listing nests them.
        const found: number[] = [];
        const walk = (value: unknown) => {
          if (Array.isArray(value)) value.forEach(walk);
          else if (value && typeof value === 'object') {
            const entry = value as { billable?: string; unit?: string; cost_usd?: number; variant?: string };
            if (entry.billable === 'output_image' && entry.unit === 'image' && typeof entry.cost_usd === 'number') found.push(entry.cost_usd);
            Object.values(value).forEach(walk);
          }
        };
        walk(json);
        return found.length ? Math.min(...found) : null;
      })
      .catch(() => null);
    prices.set(id, price);
  }
  return price;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
