import { FCC_ORIGIN, type FccAlmanacSnapshot, type FccResult } from "@writers-board/core";
import {sourceHref} from './source-card';
export interface AlmanacRow { id: string; label: string; value: number | null; currency: string; rate: number | null; observedAt: string | null; fxDate: string | null; source: string | null; url: string | null; note: string; unit: string; }
type Avail = Exclude<FccResult<FccAlmanacSnapshot>, { status: "unavailable" }>;
const normDate = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const normUrl = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
export function almanacRows(snapshot: FccAlmanacSnapshot): AlmanacRow[] {
  if (snapshot.status !== "available" || !snapshot.city) return [];
  const city = snapshot.city;
  const labelFor = (section: "it" | "co" | "me" | "fa", key: string): string => snapshot.labels[section].find(([id]) => id === key)?.[1] ?? key;
  const rows: AlmanacRow[] = [];
  const pushPrice = (section: "it" | "co" | "me", key: string, tuple: readonly [number | null, string | null, string | null, string | null, string | null, boolean | 0 | 1] | null): void => {
    if (!tuple) return;
    const label = labelFor(section, key);
    rows.push({ id: `${section}:${key}`, label, value: tuple[0] ?? null, currency: city.cur, rate: city.r ?? null, observedAt: normDate(tuple[3]), fxDate: normDate(city.fx), source: tuple[1] ?? null, url: normUrl(tuple[2]), note: tuple[4] ?? "", unit: label });
  };
  for (const [key, tuple] of Object.entries(city.it ?? {})) pushPrice("it", key, tuple);
  for (const [key, tuple] of Object.entries(city.co ?? {})) pushPrice("co", key, tuple);
  for (const [key, tuple] of Object.entries(city.me ?? {})) pushPrice("me", key, tuple);
  if (city.fu) { const t = city.fu; rows.push({ id: "fu:fuel", label: "Fuel", value: t[0] ?? null, currency: city.cur, rate: city.r ?? null, observedAt: normDate(t[3]), fxDate: normDate(city.fx), source: t[1] ?? null, url: normUrl(t[2]), note: t[4] ?? "", unit: "Fuel" }); }
  for (const [key, tuple] of Object.entries(city.fa ?? {})) {
    if (!tuple) continue;
    const label = labelFor("fa", key);
    const match = tuple[1] === city.cur && tuple[2] === city.r;
    rows.push({ id: `fa:${key}`, label, value: tuple[0] ?? null, currency: tuple[1], rate: tuple[2] ?? null, observedAt: null, fxDate: match ? normDate(city.fx) : null, source: null, url: normUrl(tuple[3]), note: tuple[4] ?? "", unit: label });
  }
  return rows;
}
export function almanacPin(row: AlmanacRow, result: Avail): Record<string, unknown> {
  const snapshot = result.value;
  const citation = sourceHref(row.url??undefined) ?? (snapshot.page ? `${FCC_ORIGIN}${snapshot.page}` : FCC_ORIGIN);
  const lines = [`${row.label}: ${row.value === null ? "unavailable" : `${row.value} ${row.currency}`} (${row.unit})`, `Observed: ${row.observedAt ?? "Not provided"}`, `Exchange rate date: ${row.fxDate ?? "Not provided"}`, `FCC collected: ${snapshot.asOf ?? "Not provided"}`, `Source: ${row.source ?? "Not provided"}`, `Citation: ${citation}`, row.note ? `Comparability: ${row.note}` : "Comparability: Not provided"];
  const body = lines.join("\n").slice(0, 20000);
  return { kind: "note", stage: "prepare", provenance: "fcc", title: row.label, body, sourceText: body, travelerNote: "", source: { id: `fcc:${snapshot.slug}:almanac:${row.id}`, kind: "almanac", provider: "fcc", origin: "observation", url: citation, canonicalUrl: citation, cityId: snapshot.slug, retrievedAt: result.retrievedAt, version: result.sourceVersion } };
}
