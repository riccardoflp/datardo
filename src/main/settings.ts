/**
 * The settings in the main process: `settings.json` at version 1 (data.md), loaded at start into the app's state, and
 * written a moment after each change and at quit. A setting left at its default is not written; a name this version
 * does not declare is kept as it is (`settings.read`).
 */
import { basename } from 'node:path';
import type { Json } from '../shared/engine-request';
import { featureId } from '../shared/ids';
import { appTarget } from '../shared/target';
import { Store, type JsonObject, type StoredFile } from '../storage/store';
import { notify } from '../runner/notify';
import type { MainServices } from './services';

/** The settings the user changed, by full name, as `settings.json` holds them after its `version`. */
export type StoredSettings = Readonly<Record<string, Json>>;

/** `settings.json`: version 1, no migration yet. */
export const settingsFile: StoredFile<StoredSettings> = {
  path: 'settings.json',
  holds: 'The settings',
  version: 1,
  migrations: {},
  empty: () => ({}),
  read: (object: JsonObject) => Object.fromEntries(Object.entries(object).filter(([name]) => name !== 'version')),
  write: (settings) => ({ ...settings }),
};

let store: Store<StoredSettings> | undefined;

/** Loads `settings.json` into the app's state, and says when it was set aside or written by a newer Datardo. */
export async function start(services: MainServices): Promise<void> {
  const ports = { state: services.state, now: () => Date.now() };
  const opened = new Store(services.dataFolder, settingsFile, (error: unknown) => {
    const text = error instanceof Error ? error.message : String(error);
    notify(ports, {
      feature: featureId('settings.change'),
      level: 'error',
      text: `The settings could not be saved: ${text}`,
    });
  });
  store = opened;
  const found = await opened.load();
  services.state.dispatch({ slice: 'settings', type: 'loaded', stored: opened.get(), writable: opened.isWritable() });
  services.onQuit(() => opened.flush());
  if (found.kind === 'newer') {
    notify(ports, {
      feature: featureId('settings.page'),
      level: 'warning',
      text: 'This data was written by a newer version of Datardo. Changes to the settings are not saved until Datardo is updated.',
    });
  } else if (found.kind === 'damaged') {
    notify(ports, {
      feature: featureId('settings.page'),
      level: 'warning',
      text: `The settings could not be read and was set aside as ${basename(found.setAsideAs)}.`,
      actions: [{ label: 'Open data folder', feature: featureId('window.open-data-folder'), target: appTarget }],
    });
  }
}

/**
 * Writes one setting: `null` removes it, which puts its default back. Throws when `settings.json` was written by a
 * newer Datardo, which is never overwritten (R15.3).
 */
export function writeSetting(services: MainServices, name: string, value: Json): void {
  if (store === undefined) {
    throw new Error('The settings are not loaded yet.');
  }
  const kept = Object.fromEntries(Object.entries(store.get()).filter(([stored]) => stored !== name));
  const next = value === null ? kept : { ...kept, [name]: value };
  if (!store.set(next)) {
    throw new Error('The settings were written by a newer version of Datardo and are not saved.');
  }
  services.state.dispatch({ slice: 'settings', type: 'changed', name, value: value ?? undefined });
}
