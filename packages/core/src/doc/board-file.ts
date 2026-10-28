// Board files: what a board is when it leaves the browser. One board is a
// `writers-board` file; a backup of many is a `writers-board-backup` holding
// several. Each carries the exact document (to restore it as it was), a
// readable copy of the board (for people and other tools), and its pictures.
import { z } from 'zod';
import type * as Y from 'yjs';
import { boardParts } from './model.ts';
import { encodeBoard, loadBoard } from './persist.ts';
import { readBoard, type BoardView } from '../commands/board-commands.ts';

export const BOARD_FILE_FORMAT = 'writers-board';
export const BACKUP_FILE_FORMAT = 'writers-board-backup';

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const BoardFileSchema = z.object({
  format: z.literal(BOARD_FILE_FORMAT),
  version: z.literal(1),
  exportedAt: z.string().optional(),
  title: z.string(),
  /** The readable board. Not used to restore: the document is. */
  board: z.unknown().optional(),
  document: z.string().min(1),
  /** Picture bytes by content hash, as data URLs. */
  images: z.record(z.string(), z.string()).default({}),
});

const BackupFileSchema = z.object({
  format: z.literal(BACKUP_FILE_FORMAT),
  version: z.literal(1),
  exportedAt: z.string().optional(),
  boards: z.array(BoardFileSchema),
});

export type BoardFile = z.infer<typeof BoardFileSchema>;

export interface BoardFileContents {
  title: string;
  /** The document's bytes, checked to open as a board. */
  update: Uint8Array;
  images: Record<string, string>;
}

/** A board file for one board document. */
export function makeBoardFile(doc: Y.Doc, images: Record<string, string>): BoardFile {
  const board: BoardView = readBoard({ doc, parts: boardParts(doc) });
  return {
    format: BOARD_FILE_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    title: board.title,
    board,
    document: toBase64(encodeBoard(doc)),
    images,
  };
}

export function makeBackupFile(boards: BoardFile[]) {
  return { format: BACKUP_FILE_FORMAT, version: 1 as const, exportedAt: new Date().toISOString(), boards };
}

/**
 * Reads a board file or a backup, and checks every board in it opens.
 * Throws a plain-language error for anything else.
 */
export function readBoardFiles(json: unknown): BoardFileContents[] {
  const format = (json as { format?: unknown } | null)?.format;
  const files =
    format === BACKUP_FILE_FORMAT
      ? BackupFileSchema.safeParse(json)
      : format === BOARD_FILE_FORMAT
        ? BoardFileSchema.transform((f) => ({ boards: [f] })).safeParse(json)
        : null;
  if (!files) throw new Error('This isn’t a Writer’s Board file.');
  if (!files.success) throw new Error('This board file is damaged or from a newer version of Writer’s Board.');
  return files.data.boards.map((file) => {
    let update: Uint8Array;
    try {
      update = fromBase64(file.document);
      loadBoard(update).destroy();
    } catch {
      throw new Error(`“${file.title}” can’t be opened: its document is damaged.`);
    }
    return { title: file.title, update, images: file.images };
  });
}
