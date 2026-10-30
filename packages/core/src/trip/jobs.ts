// Cancellable jobs (MOT-21): Stop means a late result cannot commit.
import { createDiagnostic, type DiagnosticReceipt, type DiagnosticStep } from './diagnostics.ts';
export type JobStatus = 'running' | 'done' | 'cancelled' | 'failed' | 'timed-out';
export interface Job<T> { id: string; status: JobStatus; result?: T; error?: string; code?: AgentErrorCode; }

/** Provider failures an adapter reports (MOT-50). The board never depends on which one it was. */
export type AgentErrorCode = 'rate_limited' | 'quota_exhausted' | 'unreachable';
export class AgentError extends Error {
  readonly code: AgentErrorCode;
  constructor(code: AgentErrorCode, message: string) { super(message); this.name = 'AgentError'; this.code = code; }
}

const FAILURE_TEXT: Record<AgentErrorCode | 'timed-out' | 'failed', string> = {
  'timed-out': 'Muse took too long.',
  rate_limited: 'Muse is busy right now (rate limit).',
  quota_exhausted: 'The Muse allowance for this period is used up.',
  unreachable: 'Muse could not be reached.',
  failed: 'Muse ran into a problem.',
};

/** What a person sees when an agent job does not finish: their work is untouched, and they choose what next. */
export function describeAgentFailure(job: Job<unknown>): { message: string; options: ['retry', 'manual'] } {
  const kind = job.status === 'timed-out' ? 'timed-out' : job.code ?? 'failed';
  return { message: `${FAILURE_TEXT[kind]} Your board is unchanged. Try again, or keep editing by hand.`, options: ['retry', 'manual'] };
}

export class JobRunner {
  private jobs = new Map<string, Job<unknown>>();
  private settle = new Map<string, () => void>();

  start<T>(id: string, work: () => Promise<T>, options: { timeoutMs?: number; onDone?: (result: T) => void } = {}): Promise<Job<T>> {
    const job: Job<T> = { id, status: 'running' };
    this.jobs.set(id, job as Job<unknown>);
    const timeoutMs = options.timeoutMs ?? 30000;
    return new Promise<Job<T>>((resolve) => {
      const finish = () => { clearTimeout(timer); if (this.jobs.get(id) === job) this.settle.delete(id); resolve(job); };
      const timer = setTimeout(() => {
        if (job.status === 'running') { job.status = 'timed-out'; job.error = 'Timed out. Existing work is unchanged.'; finish(); }
      }, timeoutMs);
      this.settle.set(id, finish);
      Promise.resolve().then(() => {
        if (job.status !== 'running') throw new Error('Job cancelled');
        return work();
      }).then((result) => {
        if (this.jobs.get(id) !== job || job.status !== 'running') { finish(); return; }
        options.onDone?.(result); // Commit point: only reached when not cancelled/timed out.
        job.status = 'done'; job.result = result;
        finish();
      }).catch((e: unknown) => {
        if (job.status === 'running') {
          job.status = 'failed';
          job.error = e instanceof Error ? e.message : 'Job failed';
          if (e instanceof AgentError) job.code = e.code;
        }
        finish();
      });
    });
  }

  stop(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job || job.status !== 'running') return false;
    job.status = 'cancelled'; this.settle.get(id)?.();
    return true;
  }
  get(id: string): Job<unknown> | undefined { return this.jobs.get(id); }
}

export type OperationPhase = 'requested' | 'fetching' | 'validating' | 'applied' | 'persisting' | 'persisted' | 'exporting' | 'exported' | 'delivery_failed' | 'blocked' | 'cancelled' | 'failed';
export interface OperationState {
  id: string; boardId: string; revision: number; phase: OperationPhase;
  startedAt: string; updatedAt: string; lastCompleted: OperationPhase;
  diagnostic?: DiagnosticReceipt;
}
export interface OperationOptions {
  id: string; boardId: string; revision: number; appVersion: string;
  operation?: 'agent' | 'export' | 'persist' | 'source';
  onChange?: (state: OperationState) => void;
  onDiagnostic?: (receipt: DiagnosticReceipt) => void;
  step?: () => DiagnosticStep;
}
const TERMINAL = new Set<OperationPhase>(['delivery_failed', 'blocked', 'cancelled', 'failed']);

/** A phase completes only after the supplied operation has actually settled successfully. */
export class OperationTracker {
  private current: OperationState;
  private readonly options: OperationOptions;
  constructor(options: OperationOptions) {
    this.options = options;
    const now = new Date().toISOString();
    this.current = { id: options.id, boardId: options.boardId, revision: options.revision, phase: 'requested', lastCompleted: 'requested', startedAt: now, updatedAt: now };
    this.publish();
  }
  get state(): OperationState { return structuredClone(this.current); }
  updateRevision(revision: number): void {
    if (!Number.isSafeInteger(revision) || revision < this.current.revision) throw new Error('Invalid operation revision');
    this.current.revision = revision;
  }
  async run<T>(working: OperationPhase, completed: OperationPhase, work: () => Promise<T>): Promise<T> {
    if (TERMINAL.has(this.current.phase)) throw new Error(`Operation ${this.current.phase}`);
    this.current.phase = working; this.publish();
    try {
      const result = await work();
      if (TERMINAL.has(this.current.phase)) throw new Error(`Operation ${this.current.phase}`);
      if (completed === 'exported') {
        const bytes = result instanceof Uint8Array ? result : result && typeof result === 'object' && 'bytes' in result ? result.bytes : undefined;
        if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw new Error('Export bytes are unavailable');
      }
      this.current.phase = completed; this.current.lastCompleted = completed; this.publish();
      return result;
    } catch (error) {
      if (!TERMINAL.has(this.current.phase)) this.fail(error);
      throw error;
    }
  }
  cancel(): void { if (!TERMINAL.has(this.current.phase)) this.fail(undefined, 'cancelled'); }
  fail(error: unknown, phase: 'failed' | 'delivery_failed' | 'blocked' | 'cancelled' = 'failed'): void {
    if (TERMINAL.has(this.current.phase)) return;
    this.current.phase = phase;
    this.current.diagnostic = createDiagnostic({ requestId: this.options.id, operation: this.options.operation ?? 'agent', boardId: this.current.boardId, revision: this.current.revision, appVersion: this.options.appVersion, startedAt: this.current.startedAt, error, step: this.options.step?.(), ...(phase === 'cancelled' ? { errorClass: 'cancelled' as const } : {}) });
    this.options.onDiagnostic?.(structuredClone(this.current.diagnostic)); this.publish();
  }
  private publish(): void { this.current.updatedAt = new Date().toISOString(); this.options.onChange?.(this.state); }
}
