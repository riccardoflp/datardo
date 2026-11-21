/**
 * The analysis of a sample (`schema.analyze`) as the main process runs it, off its own thread (architecture,
 * "Processes and threads"): the documents are given to a worker thread, which adds them to the analysis
 * {@link analysisBatch} at a time and looks between two batches at a flag the main process raises on **Cancel**
 * (`runner.cancel`), so that a cancelled analysis stops within one batch. The worker is the bundle `workers.js` beside
 * the main process's ({@link workerFile}); where it is not built (the tests run the sources), the analysis runs in
 * the main process the same way, giving the thread back between two batches.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { analysisBatch, startAnalysis } from '../../features/schema/analyze';
import type { SchemaSummary } from '../../features/schema/types';
import type { Json } from '../../shared/engine-request';
import { Cancelled } from '../cancel';
import type { AnalysisMessage, AnalysisRequest } from './analysis-thread';

/** The bundle of the worker threads, beside the main process's once built. */
export function workerFile(folder: string): string | undefined {
  const file = join(folder, 'workers.js');
  return existsSync(file) ? file : undefined;
}

/** Where an analysis runs: on a worker thread of this bundle, or in the main process when there is none. */
export interface AnalysisPlace {
  readonly worker?: string;
  /** Called after each batch, with the number of documents analyzed so far. */
  readonly progress?: (done: number) => void;
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

/** The analysis in the main process, a batch at a time, the thread given back between two batches. */
export async function analyzeHere(
  documents: readonly Json[],
  signal: AbortSignal,
  progress?: (done: number) => void,
): Promise<SchemaSummary> {
  const analysis = startAnalysis();
  for (let start = 0; start < documents.length; start += analysisBatch) {
    if (signal.aborted) {
      throw new Cancelled();
    }
    analysis.add(documents.slice(start, start + analysisBatch));
    progress?.(Math.min(documents.length, start + analysisBatch));
    await nextTurn();
  }
  if (signal.aborted) {
    throw new Cancelled();
  }
  return analysis.summary();
}

function onWorker(
  file: string,
  documents: readonly Json[],
  signal: AbortSignal,
  progress?: (done: number) => void,
): Promise<SchemaSummary> {
  const flag = new Int32Array(new SharedArrayBuffer(4));
  const worker = new Worker(file);
  return new Promise<SchemaSummary>((resolve, reject) => {
    const stop = (): void => {
      Atomics.store(flag, 0, 1);
    };
    const end = (): void => {
      signal.removeEventListener('abort', stop);
      // The worker has answered, or failed: it has nothing more to do.
      void worker.terminate();
    };
    signal.addEventListener('abort', stop);
    worker.on('message', (message: AnalysisMessage) => {
      if (message.kind === 'progress') {
        progress?.(message.done);
        return;
      }
      end();
      if (message.kind === 'done') {
        resolve(message.summary);
      } else {
        reject(new Cancelled());
      }
    });
    worker.on('error', (error: Error) => {
      end();
      reject(error);
    });
    const request: AnalysisRequest = { kind: 'schema.analyze', documents, cancelled: flag };
    if (signal.aborted) {
      stop();
    }
    worker.postMessage(request);
  });
}

/** The summary of the documents (`schema.analyze`), made on a worker thread when there is one. */
export function analyzeSample(
  documents: readonly Json[],
  signal: AbortSignal,
  place: AnalysisPlace,
): Promise<SchemaSummary> {
  return place.worker === undefined
    ? analyzeHere(documents, signal, place.progress)
    : onWorker(place.worker, documents, signal, place.progress);
}
