import type * as Y from 'yjs';
import { readAllCards, readPresentations, readTripMeta, tripParts } from './model.ts';
import { exportTripPackage, type ExportOptions } from './package.ts';
import { importTripPackage } from './import.ts';
type Card = ReturnType<typeof readAllCards>[number];
const FCC_FORMAT = 'fcc.b.travel.v2';
const FCC_SCHEMA = 'fcc.journal/1';
const FCC_LIMIT = 25000000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
function dayMs(s: string) { return Date.parse(s+'T00:00:00Z'); }
function dayStr(ms: number) { return new Date(ms).toISOString().slice(0, 10); }
interface FccNote {id:string;type:'note';page:'L'|'R';spread:number;x:number;y:number;w:number;r:number;z:number;text:string;}
interface FccDay {id:string;n:number;date:string;spreadCount:number;items:FccNote[];}
export interface FccJournalCopy {format:typeof FCC_FORMAT;nb:{schema:typeof FCC_SCHEMA;city:string;rev:number;trip:{party:string[]};title:string;days:FccDay[]};media:Record<string,never>;artwork:Record<string,never>;}
function textOf(c:Card):string {
  return [c.title,c.provenance==='agent'?'Muse suggestion · not checked':'',c.body?(c.sourceText?'Saved excerpt: '+c.body:c.body):'',c.sourceText?'Source snapshot: '+c.sourceText:'',c.travelerNote?'Traveler note: '+c.travelerNote:'',c.source?`Source: ${c.source.canonicalUrl??c.source.url??'Not provided'}\nRetrieved: ${c.source.retrievedAt}\nVersion: ${c.source.version??c.source.contentHash??'Not provided'}`:'',...(c.currentFacts??[]).map(f=>`Checked fact: ${f.field} — ${f.value}\nObserved: ${f.observedAt}\nEvidence: ${f.evidenceUrl}`)].filter(Boolean).join('\n\n');
}
export async function exportFccJournal(doc: Y.Doc, assetBytes: Map<string, Uint8Array>, options: ExportOptions & { party: string[] }): Promise<{ fcc: FccJournalCopy; idMap: Record<string, string>; originalPackage: Uint8Array; unsupported: Array<{ path: string; reason: string }> }> {
  const party = (options as { party?: unknown }).party;
  if (!Array.isArray(party) || !party.length || party.length > 20 || party.some((p) => typeof p !== 'string' || !p.trim())) throw new Error('Explicit nonempty party names (<=20) are required; no names are guessed.');
  const cleanParty = (party as string[]).map((p) => p.trim());
  const meta0 = readTripMeta(doc);
  const cityId=meta0.cityId;
  if (!cityId || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cityId)) throw new Error('Stable FCC city id is required; no city is invented.');
  if (!meta0.dates?.start || !meta0.dates?.end || !DAY_RE.test(meta0.dates.start) || !DAY_RE.test(meta0.dates.end)) throw new Error('Actual calendar dates are required; no placeholder dates are used.');
  const startMs = dayMs(meta0.dates.start), endMs = dayMs(meta0.dates.end);
  if (!(startMs <= endMs)) throw new Error('Invalid calendar range.');
  const span = Math.round((endMs - startMs) / 86400000) + 1;
  if (span < 1 || span > 30) throw new Error('Calendar range must be 1-30 days.');
  const dates: string[] = Array.from({ length: span }, (_, i) => dayStr(startMs + i * 86400000));
  const dateSet = new Set(dates);
  const originalPackage = await exportTripPackage(doc, assetBytes, options);
  const reopened = await importTripPackage(originalPackage.slice());
  try {
    const parts = tripParts(reopened.doc);
    const meta = readTripMeta(reopened.doc);
    const cards = readAllCards(parts);
    const byDate = new Map<string, Card[]>(dates.map((d) => [d, []]));
    const unsupported: Array<{ path: string; reason: string }> = readPresentations(parts).map(p=>({path:`presentations/${p.id}`,reason:'Native placement, geometry, ink or art is kept in the original ZIP; no FCC visual equivalent is implied.'}));
    if(meta.magazine)unsupported.push({path:'meta/magazine',reason:'Apparel preferences and their media remain in the original ZIP.'});
    unsupported.push({path:'meta',reason:'MoT board kind, lineage, audience and editing state remain in the original ZIP; currencies and FX are not guessed.'});
    for (const c of cards) {
      const day = c.day;
      if (typeof day !== 'string' || !DAY_RE.test(day) || !dateSet.has(day)) { unsupported.push({ path: `card/${c.id}#day`, reason: `Undated or out-of-range card ${c.id} kept only in native archive; no date invented.` }); continue; }
      byDate.get(day)!.push(c);
    }
    const idMap: Record<string, string> = {};
    let n = 0;
    const days = dates.map((date, di) => {
      const items:FccNote[] = (byDate.get(date) ?? []).map((c, ci) => {
        n += 1; const id = `n-${n}`; idMap[id] = c.id;
        if (c.kind !== 'note') unsupported.push({ path: `card/${c.id}#kind`, reason: `Native kind ${c.kind} has no FCC field; exported as note, native kept in ZIP.` });
        for (const f of ['stage','status','time','scope','provenance','source','currentFacts','assetIds','location','x','y'] as const) { const value=c[f];if(value!==undefined&&(!Array.isArray(value)||value.length))unsupported.push({path:`card/${c.id}#${f}`,reason:`Native ${f} structure is retained in the original ZIP; the FCC copy uses plain notes.`}); }
        return { id, type: 'note', page: (ci % 2 === 0 ? 'L' : 'R') as 'L' | 'R', spread: 1, x: 24 + ci * 8, y: 32 + ci * 12, w: 220, r: 0, z: ci + 1, text: textOf(c) };
      });
      return { id: `day-${di + 1}`, n: di + 1, date, spreadCount: 1, items };
    });
    if (n === 0) unsupported.push({ path: 'fcc/nb/days', reason: 'No dated in-range cards mapped; nothing claimed as converted, originals kept in native ZIP.' });
    unsupported.push({ path: 'fcc', reason: 'FCC edits are not merged back; reopening the original native ZIP is a separate lossless restoration. No automatic bidirectional edit round-trip.' });
    const fcc:FccJournalCopy = { format: FCC_FORMAT, nb: { schema: FCC_SCHEMA, city: cityId, rev: 0, trip: { party: cleanParty }, title: meta.title, days }, media: {}, artwork: {} };
    if (new TextEncoder().encode(JSON.stringify(fcc)).length > FCC_LIMIT) throw new Error('FCC JSON exceeds its 25000000 byte importer cap; nothing was exported.');
    return { fcc, idMap, originalPackage, unsupported };
  } finally { reopened.doc.destroy(); }
}
