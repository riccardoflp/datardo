/**
 * The process of a run as Electron starts it (`playground.run`, T6): a utility process of its own, from the bundle
 * `playground.js` beside the main process's, with no environment but what Windows needs to start a process, so that no
 * secret of the user's environment reaches it, and its output thrown away.
 */
import { join } from 'node:path';
import { utilityProcess } from 'electron';
import type { FromRun } from '../../features/playground/runtime/calls';
import type { Launcher } from './host';

/** The environment of the process: none of the user's variables, but those Windows needs to start it. */
function bareEnvironment(): Record<string, string> {
  const kept = ['SystemRoot', 'SYSTEMROOT', 'windir', 'TEMP', 'TMP'];
  return Object.fromEntries(
    kept.flatMap((name) => {
      const value = process.env[name];
      return value === undefined ? [] : [[name, value]];
    }),
  );
}

/** Starts each run in a utility process. */
export function utilityLauncher(): Launcher {
  const entry = join(import.meta.dirname, 'playground.js');
  return () => {
    const child = utilityProcess.fork(entry, [], {
      serviceName: 'Datardo playground',
      stdio: 'ignore',
      env: bareEnvironment(),
    });
    // What is posted before the process has started waits for it.
    let waiting: unknown[] | undefined = [];
    child.once('spawn', () => {
      const queued = waiting ?? [];
      waiting = undefined;
      for (const message of queued) {
        child.postMessage(message);
      }
    });
    return {
      post: (message) => {
        if (waiting === undefined) {
          child.postMessage(message);
        } else {
          waiting.push(message);
        }
      },
      onMessage: (listener) => {
        child.on('message', (message: unknown) => {
          listener(message as FromRun);
        });
      },
      onExit: (listener) => {
        child.once('exit', () => {
          listener();
        });
      },
      kill: () => {
        child.kill();
      },
    };
  };
}
