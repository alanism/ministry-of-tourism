import type * as Y from 'yjs';
import { z } from 'zod';
import { readAllCards, readPresentations, readTripMeta, tripParts } from './model.ts';
import { exportTripPackage, sha256Hex, type ExportOptions } from './package.ts';
import { importTripPackage } from './import.ts';
import { TripSession } from './session.ts';
type Card = ReturnType<typeof readAllCards>[number];
const FCC_FORMAT = 'fcc.b.travel.v2';
const FCC_SCHEMA = 'fcc.journal/1';
const FCC_LIMIT = 25000000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
function dayMs(s: string) { return Date.parse(s+'T00:00:00Z'); }
function dayStr(ms: number) { return new Date(ms).toISOString().slice(0, 10); }
interface FccNote {id:string;type:'note';page:'L'|'R';spread:number;x:number;y:number;w:number;r:number;z:number;text:string;}
interface FccDay {id:string;n:number;date:string;spreadCount:number;items:FccNote[];}
export interface FccJournalCopy {format:typeof FCC_FORMAT;nb:{schema:typeof FCC_SCHEMA;proto:'city';city:string;rev:number;seq:number;places:never[];trip:{party:string[];motSource:{format:'mot.fcc/1';packageSha256:string}};title:string;days:FccDay[]};media:Record<string,never>;artwork:Record<string,never>;}
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
    unsupported.push({ path: 'fcc', reason: 'FCC edits return only as traveler annotations with this original scoped ZIP. Source snapshots and native cards are preserved; FCC deletions, layout, ink and media do not replace native content.' });
    const fcc:FccJournalCopy = { format: FCC_FORMAT, nb: { schema: FCC_SCHEMA, proto:'city', city: cityId, rev: 0, seq:n, places:[], trip: { party: cleanParty, motSource:{format:'mot.fcc/1',packageSha256:await sha256Hex(originalPackage)} }, title: meta.title, days }, media: {}, artwork: {} };
    if (new TextEncoder().encode(JSON.stringify(fcc)).length > FCC_LIMIT) throw new Error('FCC JSON exceeds its 25000000 byte importer cap; nothing was exported.');
    return { fcc, idMap, originalPackage, unsupported };
  } finally { reopened.doc.destroy(); }
}

// The FCC editor persists trip metadata, whereas unknown notebook-root fields may be discarded.
// A digest pairs this backup with its companion ZIP; it does not authenticate either file.
const backupSchema=z.object({
  format:z.literal(FCC_FORMAT),
  nb:z.object({
    schema:z.literal(FCC_SCHEMA),city:z.string(),seq:z.number().int().nonnegative().safe(),
    trip:z.object({motSource:z.object({format:z.literal('mot.fcc/1'),packageSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict()}).passthrough(),
    days:z.array(z.object({id:z.string().regex(/^day-\d+$/),date:z.string().regex(DAY_RE).refine(s=>Number.isFinite(dayMs(s))&&dayStr(dayMs(s))===s),
      items:z.array(z.object({id:z.string().regex(/^[a-z]-\d+$/),type:z.enum(['clip','note','sticker','photo','stamp','ink','outfit','tape']),text:z.string().max(FCC_LIMIT).optional()}).passthrough()),
    }).passthrough()).min(1).max(30),
  }).passthrough(),media:z.record(z.string(),z.unknown()).optional(),artwork:z.record(z.string(),z.unknown()).optional(),
}).passthrough();

/** Reopen a NEW native trip and retain FCC text edits as annotations. Never mutates an open trip. */
export async function importFccJournal(bytes:Uint8Array,originalPackage:Uint8Array):Promise<{doc:Y.Doc;assets:Map<string,Uint8Array>;originalFcc:Uint8Array;unsupported:Array<{path:string;reason:string}>}> {
  if(bytes.length>FCC_LIMIT)throw new Error('FCC JSON exceeds its 25000000 byte importer cap.');
  const value=backupSchema.parse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
  if(value.nb.trip.motSource.packageSha256!==await sha256Hex(originalPackage))throw new Error('FCC backup does not match this original scoped ZIP.');
  const ids=new Set<string>(),days=new Set<string>();
  for(const day of value.nb.days){
    if(days.has(day.id))throw new Error('Duplicate FCC day identity.');days.add(day.id);
    for(const item of day.items){
      if(ids.has(item.id)||Number(item.id.slice(2))>value.nb.seq)throw new Error('Duplicate FCC entry identity or invalid sequence.');ids.add(item.id);
      if(item.type==='note'&&typeof item.text!=='string')throw new Error('FCC note is missing its text.');
    }
  }
  const imported=await importTripPackage(originalPackage),session=new TripSession(imported.doc);
  try{
    const meta=readTripMeta(imported.doc);
    if(value.nb.city!==meta.cityId||!meta.dates)throw new Error('FCC backup city does not match its original trip.');
    const span=(dayMs(meta.dates.end)-dayMs(meta.dates.start))/86400000+1;
    if(!Number.isInteger(span)||span<1||span>30)throw new Error('Original calendar range must be 1-30 days.');
    const cards=readAllCards(session.parts),mapped=new Map<string,Card>();let n=0;
    for(let ms=dayMs(meta.dates.start);ms<=dayMs(meta.dates.end);ms+=86400000)for(const card of cards)if(card.day===dayStr(ms))mapped.set(`n-${++n}`,card);
    const unsupported:Array<{path:string;reason:string}>=[{path:'nb',reason:'FCC dates, party, notebook settings and visual arrangement do not overwrite the native trip; the complete FCC backup is retained in originalFcc.'}];
    const ops:Array<{command:string;input:unknown}>=[];
    for(const day of value.nb.days)for(const item of day.items){
      if(item.type!=='note'){unsupported.push({path:`entry/${item.id}`,reason:`FCC ${item.type} remains in originalFcc; no native visual equivalent is implied.`});continue;}
      const card=mapped.get(item.id),text=item.text!;
      if(card){
        if(text===textOf(card)&&day.date===card.day)continue;
        const travelerNote=[card.travelerNote,`FCC Journal edit (${day.date}):\n${text}`].filter(Boolean).join('\n\n');
        if(travelerNote.length>20000)throw new Error(`FCC edit ${item.id} exceeds the traveler annotation limit; nothing was imported.`);
        ops.push({command:'trip_card_update',input:{id:card.id,travelerNote}});
      }else{
        if(text.length>20000)throw new Error(`FCC note ${item.id} exceeds the traveler annotation limit; nothing was imported.`);
        ops.push({command:'trip_card_create',input:{kind:'note',title:'FCC Journal note',travelerNote:text,day:day.date,provenance:'traveler',scope:'stay'}});
      }
    }
    for(const id of mapped.keys())if(!ids.has(id))unsupported.push({path:`entry/${id}`,reason:'FCC entry is missing or deleted; the original native card is retained.'});
    for(const key of ['media','artwork'] as const)if(Object.keys(value[key]??{}).length)unsupported.push({path:key,reason:`FCC ${key} remains in originalFcc; original native assets are retained separately.`});
    // All edits are validated on a throwaway document before the first write (including a late overlong note).
    session.executeAll({kind:'human',id:'fcc-import',name:'FCC Journal import'},ops);
    return{doc:imported.doc,assets:imported.assets,originalFcc:bytes.slice(),unsupported};
  }catch(error){imported.doc.destroy();throw error;}finally{session.destroy();}
}
