/**
 * What a worker thread does with an analysis it is given (`schema.analyze`): it adds the documents
 * {@link analysisBatch} at a time, says after each batch how far it is, and looks between two batches at the flag the
 * main process raises on **Cancel**; then it answers with the summary, or that it was cancelled.
 */
import { analysisBatch, startAnalysis } from '../../features/schema/analyze';
import type { SchemaSummary } from '../../features/schema/types';
import type { Json } from '../../shared/engine-request';

/** An analysis asked of a worker. */
export interface AnalysisRequest {
  readonly kind: 'schema.analyze';
  readonly documents: readonly Json[];
  /** Raised to 1 by the main process on **Cancel**. */
  readonly cancelled: Int32Array;
}

/** What a worker says: how far it is, the summary, or that it stopped. */
export type AnalysisMessage =
  | { readonly kind: 'progress'; readonly done: number }
  | { readonly kind: 'done'; readonly summary: SchemaSummary }
  | { readonly kind: 'cancelled' };

/** Carries out an analysis, saying each thing through `say`. */
export function analyzeInBatches(request: AnalysisRequest, say: (message: AnalysisMessage) => void): void {
  const analysis = startAnalysis();
  const { documents, cancelled } = request;
  for (let start = 0; start < documents.length; start += analysisBatch) {
    if (Atomics.load(cancelled, 0) !== 0) {
      say({ kind: 'cancelled' });
      return;
    }
    analysis.add(documents.slice(start, start + analysisBatch));
    say({ kind: 'progress', done: Math.min(documents.length, start + analysisBatch) });
  }
  say(Atomics.load(cancelled, 0) === 0 ? { kind: 'done', summary: analysis.summary() } : { kind: 'cancelled' });
}
