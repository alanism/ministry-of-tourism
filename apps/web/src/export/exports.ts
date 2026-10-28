// Exports: everything is made in this browser and saved straight to the
// writer's computer. Nothing is uploaded anywhere.
import { buildPdf, exportMarkdown, jpegSize, manuscriptPages, type BoardView, type PdfPage } from '@writers-board/core';
import { captureBoard } from '../board/capture';
import { BOARD_ID, boardSession } from '../state/board';
import { boardFileFor } from '../state/boards';
import { currentPalette } from '../state/palette';

export type ExportKind = 'markdown' | 'json' | 'png' | 'pdf';

const slug = (title: string) => (title.trim() || 'board').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'board';

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** A board file: the readable board, the exact document to restore it from, and its pictures. */
export async function boardFile(): Promise<Blob> {
  const file = await boardFileFor(BOARD_ID, boardSession().doc);
  return new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
}

async function toJpeg(png: Blob): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(png);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d')!;
  context.fillStyle = currentPalette().board;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  const jpeg = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the picture.'))), 'image/jpeg', 0.92));
  return new Uint8Array(await jpeg.arrayBuffer());
}

/** The board as a picture on the first page, then the draft in manuscript form. */
export async function boardPdf(board: BoardView): Promise<Blob> {
  const pages: PdfPage[] = [];
  if (board.cards.length || board.notes.length || board.images.length || board.guides.length || board.strokes.length) {
    const jpeg = await toJpeg(await captureBoard(board));
    const size = jpegSize(jpeg);
    if (size) pages.push({ kind: 'image', jpeg, ...size, caption: board.title });
  }
  if (board.manuscript.trim()) pages.push(...manuscriptPages(board.manuscript, board.title));
  if (!pages.length) pages.push({ kind: 'text', lines: ['This board is empty.'] });
  return new Blob([buildPdf(pages, board.title) as BlobPart], { type: 'application/pdf' });
}

export async function exportBoard(board: BoardView, kind: ExportKind): Promise<void> {
  const name = slug(board.title);
  if (kind === 'markdown') save(new Blob([exportMarkdown(board)], { type: 'text/markdown' }), `${name}.md`);
  else if (kind === 'json') save(await boardFile(), `${name}.writers-board.json`);
  else if (kind === 'png') save(await captureBoard(board), `${name}.png`);
  else save(await boardPdf(board), `${name}.pdf`);
}
