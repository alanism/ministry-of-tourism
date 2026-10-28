import { z } from 'zod';
import { isPublicFccUrl, type BoardKind, type TripMeta } from '@writers-board/core';
import type { NewTrip } from './trip-store';

// ISO country choices for an explicit human selection, not a city-country registry.
const COUNTRY_CODES = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
const countrySet = new Set(COUNTRY_CODES);
const names = new Intl.DisplayNames('en', { type: 'region' });
const collator = new Intl.Collator('en');
export const foldDestination = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en').replace(/[-_/]/g, ' ').replace(/\s+/g, ' ').trim();
const countries = COUNTRY_CODES.map(code => ({ code, name: names.of(code) ?? code })).sort((a, b) => collator.compare(a.name, b.name));
export function countryChoices(query = '') { const q = foldDestination(query); return countries.filter(country => !q || foldDestination(country.name).includes(q) || country.code.toLowerCase() === q); }
export function countryName(code?: string): string { return countries.find(country => country.code === code)?.name ?? 'Country not selected'; }
const countryCode = z.string().refine(value => countrySet.has(value), 'Choose a country by name');
const zone = z.string().min(1).max(80).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }, 'Unrecognized IANA timezone').nullable();
export const destinationRows = z.array(z.object({
  id: z.string().max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), name: z.string().min(1).max(120), aliases: z.array(z.string().min(1).max(160)).max(30).optional(),
  countryCode, timeZone: zone, tagUrl: z.string().max(2000).refine(isPublicFccUrl).nullable().optional(), artworkCount: z.number().int().nonnegative().optional(),
}).strict()).max(1000).refine(rows => new Set(rows.map(row => row.id)).size === rows.length, 'Destination IDs must be unique');
export type DestinationRow = z.infer<typeof destinationRows>[number];
export interface DestinationMatch { row: DestinationRow; via?: string; }
export function searchDestinations(rows: readonly DestinationRow[], query: string): DestinationMatch[] {
  const q = foldDestination(query);
  if (!q) return rows.map(row => ({ row }));
  return rows.flatMap(row => {
    const name = foldDestination(row.name), slug = foldDestination(row.id), via = row.aliases?.find(alias => foldDestination(alias).includes(q));
    if (!name.includes(q) && !slug.includes(q) && !via) return [];
    const rank = name === q || slug === q ? 0 : via && foldDestination(via) === q ? 1 : name.startsWith(q) ? 2 : name.includes(q) ? 3 : 4;
    return [{ row, ...(via && !name.includes(q) && !slug.includes(q) ? { via } : {}), rank }];
  }).sort((a, b) => a.rank - b.rank || collator.compare(a.row.name, b.row.name)).map(({ row, via }) => ({ row, ...(via ? { via } : {}) }));
}

/** Return only trip metadata; cards, media and their source geography are never inputs or outputs. */
export function destinationDetails({ city, countryCode: chosenCountry, destination, kind, current }: { city: string; countryCode: string; destination?: DestinationRow; kind?: BoardKind; current?: TripMeta }): NewTrip {
  const typed = z.string().trim().min(1).max(120).parse(city);
  countryCode.parse(chosenCountry);
  if (destination) {
    destinationRows.parse([destination]);
    if (destination.countryCode !== chosenCountry) throw new Error('The selected country does not match this destination.');
  }
  const label = destination?.name ?? typed, boardKind = kind ?? current?.kind ?? 'traveler';
  return { title: current?.title ?? `${label} ${boardKind === 'host_guide' ? 'guide' : 'trip'}`, city: label,
    ...(destination ? { cityId: destination.id } : {}), countryCode: chosenCountry, timeZone: destination?.timeZone ?? null, kind: boardKind,
    ...(current?.dates ? { dates: { ...current.dates } } : {}), ...(current?.party ? { party: current.party } : {}) };
}

export type DestinationRegistryStatus = 'ready' | 'cached' | 'unavailable';
export interface DestinationRegistryResult { status: DestinationRegistryStatus; cities: DestinationRow[]; retrievedAt?: string; error?: string; }
export interface DestinationStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; }
const CACHE_KEY = 'mot-destinations';
const publication = z.object({ version: z.literal(1).optional(), schema: z.string().max(100).optional(), cities: destinationRows }).strict();
const cached = z.object({ schema: z.literal('mot.destination-cache/1'), retrievedAt: z.string().min(1), cities: destinationRows }).strict();
function browserStorage(): DestinationStorage | undefined { try { return typeof window === 'undefined' ? undefined : window.localStorage; } catch { return undefined; } }
export async function loadDestinations(options: { fetcher?: typeof fetch; storage?: DestinationStorage; signal?: AbortSignal; offline?: boolean; timeoutMs?: number; now?: () => Date } = {}): Promise<DestinationRegistryResult> {
  const storage = options.storage ?? browserStorage();
  let previous: DestinationRegistryResult | undefined;
  try {
    const raw: unknown = JSON.parse(storage?.getItem(CACHE_KEY) ?? 'null');
    const legacy = destinationRows.safeParse(raw), saved = cached.safeParse(raw);
    if (saved.success && saved.data.cities.length) previous = { status: 'cached', cities: saved.data.cities, retrievedAt: saved.data.retrievedAt };
    else if (legacy.success && legacy.data.length) previous = { status: 'cached', cities: legacy.data };
  } catch { /* Optional cache failure must not prevent an explicitly named destination. */ }
  const unavailable = (error: string): DestinationRegistryResult => previous ? { ...previous, error } : { status: 'unavailable', cities: [], error };
  if (options.signal?.aborted) return unavailable('Destination list loading was cancelled. You can still name a city.');
  if (options.offline) return previous ?? unavailable('No saved destination list is available offline. Name a city and choose its country to start.');
  const controller = new AbortController(), cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, Math.max(1, Math.min(options.timeoutMs ?? 5000, 15000)));
  try {
    const response = await (options.fetcher ?? fetch)('/fcc/destinations.json', { signal: controller.signal, credentials: 'omit', redirect: 'error' });
    if (response.status === 404) return unavailable('The FCC destination list has not been published yet. Name a city and choose its country to start.');
    if (!response.ok) return unavailable('The destination list could not be refreshed. Retry or name a city and choose its country.');
    const raw: unknown = await response.json(), rows = Array.isArray(raw) ? destinationRows.parse(raw) : publication.parse(raw).cities;
    if (!rows.length) return unavailable('The published destination list is empty. Name a city and choose its country to start.');
    if (controller.signal.aborted) return unavailable('Destination list loading was cancelled or timed out. You can still name a city.');
    const retrievedAt = (options.now ?? (() => new Date()))().toISOString();
    try { storage?.setItem(CACHE_KEY, JSON.stringify({ schema: 'mot.destination-cache/1', retrievedAt, cities: rows })); } catch { /* Availability does not assert that the cache was persisted. */ }
    return { status: 'ready', cities: rows, retrievedAt };
  } catch { return unavailable('The destination list could not be refreshed. Retry or name a city and choose its country.'); }
  finally { clearTimeout(timer); options.signal?.removeEventListener('abort', cancel); }
}
