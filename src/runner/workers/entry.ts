/**
 * The entry of a worker thread of the main process (`workers.js`, a bundle of its own): it carries out the work it is
 * posted and posts back what that work says. Today the only work is the analysis of a sample (`schema.analyze`).
 */
import { parentPort } from 'node:worker_threads';
import { analyzeInBatches, type AnalysisMessage, type AnalysisRequest } from './analysis-thread';

parentPort?.on('message', (request: AnalysisRequest) => {
  analyzeInBatches(request, (message: AnalysisMessage) => {
    parentPort?.postMessage(message);
  });
});
