// MOT-54: optional local totals only. No card text, guest details or network calls.
const KEY = 'mot-demo-metrics-v1';
export interface DemoMetrics { counts: Record<string, number>; costUnits: number; }
export function readMetrics(): DemoMetrics | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') as DemoMetrics | null; }
  catch { return null; }
}
export function enableMetrics(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(KEY, JSON.stringify({ counts: {}, costUnits: 0 }));
    else localStorage.removeItem(KEY);
  } catch { /* Optional measurement never blocks board work. */ }
}
export function recordOutcome(name: string, costUnits = 0): void {
  const metrics = readMetrics();
  if (!metrics) return;
  metrics.counts[name] = (metrics.counts[name] ?? 0) + 1;
  metrics.costUnits += costUnits;
  try { localStorage.setItem(KEY, JSON.stringify(metrics)); }
  catch { /* Optional measurement never blocks board work. */ }
}
