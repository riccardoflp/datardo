/**
 * The pairing of `compare.read` away from the main process's event loop (architecture, "Processes and threads"): the
 * documents of each side reach it as their bytes as stored, a batch at a time, and only the `_id`s and the hashes of
 * the left side stay in its memory (QA11). `onWorker` runs it on a worker thread, the bundle `pairing.js` beside the
 * main process's; `inThread` runs the same functions in the calling thread, for the tests and as the fallback when no
 * worker can be started.
 */
import { Worker } from 'node:worker_threads';
import type { PairingInput, PairingStep } from '../../features/compare/pairing/pairing';
import type { CompareResult, Side } from '../../features/compare/types';
import { pairingSession, type PairingRequest, type PairingReply } from './pairing-session';

/** One comparison being paired. */
export interface PairingWork {
  /** Takes a batch of a side, the left side whole before the right side. */
  readonly add: (side: Side, documents: readonly Uint8Array[]) => Promise<PairingStep>;
  /** What the comparison found, once both sides were read. */
  readonly finish: () => Promise<CompareResult>;
  /** Frees what the pairing holds; a comparison cancelled or replaced is dropped so. */
  readonly close: () => void;
}

/** Starts the pairing of one comparison. */
export type PairingStarter = (input: PairingInput) => PairingWork;

/** The pairing in the calling thread. */
export const inThread: PairingStarter = (input) => {
  const session = pairingSession();
  const ask = (request: PairingRequest): Promise<PairingReply> => Promise.resolve(session(request));
  void ask({ kind: 'start', input });
  return {
    add: async (side, documents) => stepOf(await ask({ kind: 'add', side, documents })),
    finish: async () => resultOf(await ask({ kind: 'finish' })),
    close: () => {
      void ask({ kind: 'close' });
    },
  };
};

function stepOf(reply: PairingReply): PairingStep {
  if (reply.kind !== 'step') {
    throw new Error(reply.kind === 'failed' ? reply.message : 'The pairing answered out of turn.');
  }
  return reply.step;
}

function resultOf(reply: PairingReply): CompareResult {
  if (reply.kind !== 'result') {
    throw new Error(reply.kind === 'failed' ? reply.message : 'The pairing answered out of turn.');
  }
  return reply.result;
}

/** The pairing on a worker thread started from the bundle at `entry`; each request waits for the one before it. */
export function onWorker(entry: string): PairingStarter {
  return (input) => {
    const worker = new Worker(entry);
    const waiting: ((reply: PairingReply) => void)[] = [];
    const failAll = (message: string): void => {
      for (const resolve of waiting.splice(0)) {
        resolve({ kind: 'failed', message });
      }
    };
    worker.on('message', (reply: PairingReply) => {
      waiting.shift()?.(reply);
    });
    worker.on('error', (error: Error) => {
      failAll(error.message);
    });
    worker.on('exit', () => {
      failAll('The comparison stopped.');
    });
    const ask = (request: PairingRequest, transfer: readonly ArrayBuffer[] = []): Promise<PairingReply> =>
      new Promise((resolve) => {
        waiting.push(resolve);
        worker.postMessage(request, [...transfer]);
      });
    void ask({ kind: 'start', input });
    return {
      add: async (side, documents) => stepOf(await ask({ kind: 'add', side, documents }, buffersOf(documents))),
      finish: async () => resultOf(await ask({ kind: 'finish' })),
      close: () => {
        void worker.terminate();
      },
    };
  };
}

/** The buffers of the documents that can be handed to the worker rather than copied: those each holds alone. */
function buffersOf(documents: readonly Uint8Array[]): readonly ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  for (const document of documents) {
    const { buffer } = document;
    if (buffer instanceof ArrayBuffer && document.byteOffset === 0 && document.byteLength === buffer.byteLength) {
      buffers.add(buffer);
    }
  }
  return [...buffers];
}
