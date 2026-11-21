/**
 * The worker thread of a comparison (`compare.read`): it answers the requests of `onWorker` in `./pairing.ts`, one
 * after the other, with the session of `./pairing-session.ts`. Bundled as `pairing.js` beside the main process's.
 */
import { parentPort } from 'node:worker_threads';
import { pairingSession, type PairingRequest } from './pairing-session';

const session = pairingSession();

parentPort?.on('message', (request: PairingRequest) => {
  parentPort?.postMessage(session(request));
});
