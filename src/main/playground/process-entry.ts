/**
 * The process of a run (`playground.run`, T6): started by the main process for one run, given its script and nothing
 * else, and ended by it when the run ends or is stopped. Its only way out is the port to the main process, through
 * which each call of the script to the database goes and is answered.
 */
import type { ToRun } from '../../features/playground/runtime';
import { runScript } from './script';

const port = process.parentPort;
let receive: ((message: ToRun) => void) | undefined;

port.on('message', (event: { readonly data: unknown }) => {
  const message = event.data as ToRun;
  if (message.kind === 'start') {
    receive ??= runScript(message, (out) => {
      port.postMessage(out);
    });
  } else {
    receive?.(message);
  }
});

process.on('unhandledRejection', () => {
  // A promise of the script that nobody awaits, and that failed: the script goes on, as in mongosh. Its error is not
  // the run's, which ends with what the script awaits; the main process ends this process when the run ends.
});
