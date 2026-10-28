// Storyboard: draw frames as prints on the board, regenerate them, or color
// the sketches the writer keeps. Each batch is one run the writer can undo.
import { ASPECT_RATIOS, CommandError, framePrompt, type Actor, type FramePlan, type FrameStage } from '@writers-board/core';
import { getBlob, putBlob } from '../state/blobs';
import { boardSession, latestBoard } from '../state/board';
import { blobToDataUrl, generateImage } from './images';
import { aiSettings } from './settings';

export const STORYBOARD: Actor = { kind: 'agent', id: 'agent:storyboard', name: 'Storyboard artist' };

export interface DrawProgress {
  done: number;
  total: number;
}

export interface DrawOutcome {
  made: number;
  failed: { caption: string; message: string }[];
  cost: number;
}

/** The listed shape closest to a frame's own, so a redraw keeps its proportions. */
function nearestAspect(width: number, height: number): string {
  const ratio = width / height;
  return Object.entries(ASPECT_RATIOS).reduce((best, [name, r]) => (Math.abs(r - ratio) < Math.abs(ASPECT_RATIOS[best as keyof typeof ASPECT_RATIOS] - ratio) ? name : best), '4:3');
}

const message = (error: unknown) => (error instanceof CommandError ? `${error.code}: ${error.message}` : error instanceof Error ? error.message : String(error));

async function batch(
  items: { caption: string; work: () => Promise<number | undefined> }[],
  onProgress: (p: DrawProgress) => void,
  signal: AbortSignal,
): Promise<DrawOutcome> {
  const session = boardSession();
  const outcome: DrawOutcome = { made: 0, failed: [], cost: 0 };
  session.beginRun(STORYBOARD);
  try {
    for (const [i, item] of items.entries()) {
      if (signal.aborted) break;
      onProgress({ done: i, total: items.length });
      try {
        outcome.cost += (await item.work()) ?? 0;
        outcome.made++;
      } catch (error) {
        if (signal.aborted) break;
        outcome.failed.push({ caption: item.caption, message: message(error) });
      }
    }
    onProgress({ done: items.length, total: items.length });
  } finally {
    session.endRun(STORYBOARD);
  }
  return outcome;
}

/** Draws new frames and places them as prints. */
export function drawFrames(
  frames: FramePlan[],
  options: { stage: FrameStage; reference?: Blob | null; onProgress: (p: DrawProgress) => void; signal: AbortSignal },
): Promise<DrawOutcome> {
  const { style, aspect, faceForward } = aiSettings().storyboard;
  return (async () => {
    const reference = options.reference ? await blobToDataUrl(options.reference) : null;
    return batch(
      frames.map((frame) => ({
        caption: frame.caption,
        work: async () => {
          const prompt = framePrompt(frame, { stage: options.stage, style, faceForward, reference: Boolean(reference) });
          const image = await generateImage({ prompt, aspect, references: reference ? [reference] : [] }, options.signal);
          const blobId = await putBlob(image.blob);
          boardSession().execute(STORYBOARD, 'image_place', {
            blobId,
            x: frame.x,
            y: frame.y,
            width: frame.width,
            height: frame.height,
            frame: 'print',
            caption: frame.caption.slice(0, 300),
            art: frame.art.slice(0, 4000),
            stage: options.stage,
          });
          return image.cost;
        },
      })),
      options.onProgress,
      options.signal,
    );
  })();
}

/** Redraws frames already on the board: again at the same stage, or colors a sketch keeping its composition. */
export function redrawFrames(
  imageIds: string[],
  options: { mode: 'regenerate' | 'color'; reference?: Blob | null; onProgress: (p: DrawProgress) => void; signal: AbortSignal },
): Promise<DrawOutcome> {
  const { style, faceForward } = aiSettings().storyboard;
  const images = latestBoard()!.images.filter((img) => imageIds.includes(img.id));
  return (async () => {
    const reference = options.reference ? await blobToDataUrl(options.reference) : null;
    return batch(
      images.map((img) => ({
        caption: img.caption || 'Frame',
        work: async () => {
          const stage: FrameStage = options.mode === 'color' ? 'color' : (img.stage ?? 'sketch');
          const references: string[] = [];
          if (options.mode === 'color') {
            const sketch = await getBlob(img.blobId);
            if (!sketch) throw new Error('This browser does not have the sketch to color.');
            references.push(await blobToDataUrl(sketch));
          }
          if (reference) references.push(reference);
          const prompt = framePrompt(
            { art: img.art ?? img.caption, caption: img.caption },
            { stage, style, faceForward, reference: Boolean(reference), fromSketch: options.mode === 'color' },
          );
          const image = await generateImage({ prompt, aspect: nearestAspect(img.width, img.height), references }, options.signal);
          const blobId = await putBlob(image.blob);
          boardSession().execute(STORYBOARD, 'image_update', { id: img.id, blobId, stage });
          return image.cost;
        },
      })),
      options.onProgress,
      options.signal,
    );
  })();
}
