/**
 * The folder the bundles of the worker threads are started from (`pairing.js`, `workers.js`): beside the main
 * process's. In an installed Datardo they are kept out of the archive (`asarUnpack` in `electron-builder.yml`), since
 * a worker thread is started from a file on the disk.
 */
export function workerFolder(): string {
  return import.meta.dirname.replace(/app\.asar(?=[\\/]|$)/, 'app.asar.unpacked');
}
