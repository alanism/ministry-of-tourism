import { readAsset, type TripParts } from './model.ts';
import type { Asset } from './schema.ts';
/** Only the selected ancestry; no unrelated document records. Refuse dangling/cyclic media. */
export function selectedAssetClosure(parts: TripParts, roots: Iterable<string>): Asset[] {
  const found = new Map<string, Asset>(), active = new Set<string>();
  for (const root of roots) {
    const stack: { id: string; exit?: boolean }[] = [{id:root}];
    while (stack.length) {
      const {id,exit} = stack.pop()!;
      if (exit) { active.delete(id); continue; }
      if (active.has(id)) throw new Error(`Media ancestry cycle at ${id}; nothing was copied or exported.`);
      if (found.has(id)) continue;
      const asset = readAsset(parts,id);
      if (!asset) throw new Error(`Missing media ancestor ${id}; restore its original before copying or exporting.`);
      found.set(id,asset);active.add(id);stack.push({id,exit:true});
      if (asset.derivedFrom) stack.push({id:asset.derivedFrom});
    }
  }
  return [...found.values()];
}
