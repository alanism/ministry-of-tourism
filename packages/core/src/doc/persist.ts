// Saving and loading a board as a single binary update. The web app stores
// this in IndexedDB; the same bytes make a .wboard export file.
import * as Y from 'yjs';
import { DOC_SCHEMA_VERSION, boardParts } from './model.ts';

export function encodeBoard(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}

export function loadBoard(update: Uint8Array): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, update);
  const version = boardParts(doc).meta.get('schemaVersion');
  if (version !== DOC_SCHEMA_VERSION) {
    throw new Error(`Unsupported board version ${String(version)}; expected ${DOC_SCHEMA_VERSION}`);
  }
  return doc;
}
