/**
 * The undo history in the main process: `undo/index.json` at version 1 (data.md), loaded at start into the app's
 * state and written a moment after each change and at quit; the limits applied at start, with the files of the folder
 * (`undo.limits`), and again after each change of a `datardo.undo` setting. An index that could not be read, or was
 * written by a newer Datardo, deletes no file (RS4).
 */
import { basename } from 'node:path';
import { storeText } from '../features/undo/text';
import { featureId } from '../shared/ids';
import { appTarget } from '../shared/target';
import type { UndoEntry } from '../shared/state/undo';
import { notify } from '../runner/notify';
import { start as startFeature } from '../runner/start';
import { Store, type Found } from '../storage/store';
import { hasDamagedIndex, listOperationFiles, undoIndexFile, withOperations, type UndoIndex } from '../storage/undo';
import { whenRunnerReady } from './bridge';
import type { MainServices } from './services';

const limitsFeature = featureId('undo.limits');

let store: Store<UndoIndex> | undefined;

/** The index of the undo history, once loaded. */
export function undoStore(): Store<UndoIndex> {
  if (store === undefined) {
    throw new Error('The undo history is not loaded yet.');
  }
  return store;
}

/** How the index was found in this run: what decides whether files with no operation may be deleted (RS4). */
export function indexFound(): Found {
  return undoStore().status();
}

/** The operations as the state lists them, from the index. */
function entriesOf(index: UndoIndex): readonly UndoEntry[] {
  return index.operations as readonly UndoEntry[];
}

/** Writes the operations of the history, as the state now lists them; throws when the index may not be written. */
export function writeEntries(entries: readonly UndoEntry[]): void {
  const opened = undoStore();
  if (!opened.set(withOperations(opened.get(), entries))) {
    throw new Error(storeText.newer);
  }
}

function tellHowFound(services: MainServices, found: Found): void {
  const ports = { state: services.state, now: () => Date.now() };
  if (found.kind === 'newer') {
    notify(ports, { feature: featureId('undo.show'), level: 'warning', text: storeText.newer });
  } else if (found.kind === 'damaged') {
    notify(ports, {
      feature: featureId('undo.show'),
      level: 'warning',
      text: storeText.setAside(basename(found.setAsideAs)),
      actions: [{ label: storeText.openDataFolder, feature: featureId('window.open-data-folder'), target: appTarget }],
    });
  }
}

/** Applies the limits; at start, with how the index was found and the files of the folder. */
async function applyLimits(services: MainServices, atStart: boolean): Promise<void> {
  const ports = await whenRunnerReady();
  const args = atStart
    ? {
        start: {
          index: indexFound().kind,
          files: (await listOperationFiles(services.dataFolder)).map(({ name, time }) => ({ name, time })),
          damagedBefore: await hasDamagedIndex(services.dataFolder),
        },
      }
    : {};
  await startFeature(ports, { feature: limitsFeature, target: appTarget, args });
}

/** Loads `undo/index.json`, says when it was set aside or is newer, and applies the limits once the runner is ready. */
export async function start(services: MainServices): Promise<void> {
  const ports = { state: services.state, now: () => Date.now() };
  const opened = new Store(services.dataFolder, undoIndexFile, (error: unknown) => {
    const text = error instanceof Error ? error.message : String(error);
    notify(ports, { feature: featureId('undo.record'), level: 'error', text: storeText.notSaved(text) });
  });
  store = opened;
  const found = await opened.load();
  services.state.dispatch({
    slice: 'undo',
    type: 'loaded',
    entries: entriesOf(opened.get()),
    writable: opened.isWritable(),
  });
  services.onQuit(() => opened.flush());
  tellHowFound(services, found);
  services.state.listen((event) => {
    if (event.slice === 'settings' && event.type === 'changed' && event.name.startsWith('datardo.undo.')) {
      void applyLimits(services, false);
    }
  });
  void applyLimits(services, true);
}
