// Local, allowlisted diagnostics. Error messages and arbitrary context never enter a receipt.
export type DiagnosticErrorClass = 'failed' | 'cancelled' | 'timed_out' | 'unavailable' | 'invalid_input' | 'storage' | 'network' | 'rate_limited' | 'quota_exhausted';
export type DiagnosticStep = 'collect' | 'layout' | 'write' | 'verify' | 'persist';
export interface DiagnosticReceipt {
  requestId: string;
  operation: string;
  boardId: string;
  revision: number;
  errorClass: DiagnosticErrorClass;
  step?: DiagnosticStep;
  startedAt: string;
  finishedAt: string;
  appVersion: string;
  sourceUrl?: string;
  httpStatus?: number;
}
export interface DiagnosticInput {
  requestId: string; operation: string; boardId: string; revision: number; appVersion: string;
  error?: unknown; errorClass?: DiagnosticErrorClass; step?: DiagnosticStep; startedAt?: string; sourceUrl?: string; httpStatus?: number;
}
const ERROR_CLASSES = new Set<DiagnosticErrorClass>(['failed', 'cancelled', 'timed_out', 'unavailable', 'invalid_input', 'storage', 'network', 'rate_limited', 'quota_exhausted']);
const DIAGNOSTIC_STEPS = new Set<DiagnosticStep>(['collect', 'layout', 'write', 'verify', 'persist']);
function errorClass(error: unknown): DiagnosticErrorClass {
  if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return 'storage';
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  return typeof code === 'string' && ERROR_CLASSES.has(code as DiagnosticErrorClass) ? code as DiagnosticErrorClass : 'failed';
}
function publicSource(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'foreignclubberscorespondence.web.app' || url.username || url.password) return undefined;
    if (!/^\/(?:almanac|journal-templates|magazine|assets\/(?:generated|city-magazine-v1)|output\/prototypes\/city-pages\/journal|feeds|city-feed)\//.test(url.pathname)) return undefined;
    return `${url.origin}${url.pathname}`;
  } catch { return undefined; }
}

export function createDiagnostic(input: DiagnosticInput): DiagnosticReceipt {
  const now = new Date().toISOString();
  const sourceUrl = publicSource(input.sourceUrl);
  return {
    requestId: input.requestId, operation: input.operation, boardId: input.boardId, revision: input.revision,
    errorClass: input.errorClass && ERROR_CLASSES.has(input.errorClass) ? input.errorClass : errorClass(input.error),
    ...(input.step && DIAGNOSTIC_STEPS.has(input.step) ? { step: input.step } : {}),
    startedAt: input.startedAt ?? now, finishedAt: now, appVersion: input.appVersion,
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(Number.isInteger(input.httpStatus) && input.httpStatus! >= 100 && input.httpStatus! <= 599 ? { httpStatus: input.httpStatus } : {}),
  };
}
export function diagnosticText(receipt: DiagnosticReceipt): string {
  // Re-project at serialization too: callers cannot accidentally append private context to a receipt.
  const clean = createDiagnostic({ ...receipt, errorClass: receipt.errorClass, step: receipt.step });
  clean.startedAt = receipt.startedAt; clean.finishedAt = receipt.finishedAt;
  return JSON.stringify(clean, null, 2);
}

/** In-memory only. The person deliberately copies a receipt; no network or automatic upload exists. */
export class DiagnosticLog {
  private readonly entries: DiagnosticReceipt[] = [];
  private readonly limit: number;
  constructor(limit = 50) { this.limit = limit; }
  record(receipt: DiagnosticReceipt): void {
    this.entries.push(JSON.parse(diagnosticText(receipt)) as DiagnosticReceipt);
    while (this.entries.length > Math.max(1, this.limit)) this.entries.shift();
  }
  read(): DiagnosticReceipt[] { return structuredClone(this.entries); }
  clear(): void { this.entries.length = 0; }
}
