/**
 * Conditional formatting in the main process: `formatting.json` (data.md; D72) loaded into the app's state when
 * Datardo starts and written again after each change, and the changes the runner's app steps make to it, each through
 * a pure function of `table.format-scopes`: a collection's own rules saved (`table.add-format-rule`,
 * `table.edit-format-rule`), formatting hidden or shown (`table.toggle-formatting`), the rules of a connection deleted
 * (`connection.remove`), those of a collection or a database forgotten after a drop made from Datardo
 * (`manage.drop-collection`, `manage.drop-database`, `gridfs.drop-bucket`), and those of a collection moved after its
 * rename (`manage.rename-collection`). It imports nothing of Electron, so that the tests read it.
 */
import type { Json } from '../shared/engine-request';
import { readFormatRules, type KeptFormatting } from '../shared/formatting-rules';
import {
  withCollectionRules,
  withRenamedCollection,
  withoutCollection,
  withoutConnection,
  withoutDatabase,
} from '../features/table/format-scopes';
import type { TableCollection } from '../features/table/types';
import { formattingFile } from '../storage/formatting';
import { Store } from '../storage/store';
import type { MainServices } from './services';

function fields(args: Json): Readonly<Record<string, Json>> {
  return typeof args === 'object' && args !== null && !Array.isArray(args)
    ? (args as { readonly [key: string]: Json })
    : {};
}

function textField(args: Json, name: string): string {
  const value = fields(args)[name];
  if (typeof value !== 'string' || value === '') {
    throw new Error(`The action needs ${name}.`);
  }
  return value;
}

function collectionOf(args: Json): TableCollection {
  return {
    connection: textField(args, 'connection'),
    database: textField(args, 'database'),
    collection: textField(args, 'collection'),
  };
}

/** Changes the rules kept, through the one reducer; the store writes them a moment later. */
function changeRules(services: MainServices, change: (kept: KeptFormatting) => KeptFormatting): void {
  const before = services.state.get().table.formatting;
  const { hidden, ...kept } = before;
  const after = change(kept);
  if (after !== kept) {
    services.state.dispatch({ slice: 'table', type: 'formatting-changed', formatting: { hidden, ...after } });
  }
}

/** `table.save-formatting` `{ connection, database, collection, rules }`: a collection's own rules, in their order. */
export function saveCollectionRules(services: MainServices, args: Json): Promise<void> {
  const where = collectionOf(args);
  const { rules } = readFormatRules(fields(args)['rules']);
  changeRules(services, (kept) => withCollectionRules(kept, where, rules));
  return Promise.resolve();
}

/** `table.set-formatting-hidden` `{ hidden }`: every table without its colors, or colored again. */
export function setFormattingHidden(services: MainServices, args: Json): Promise<void> {
  const formatting = services.state.get().table.formatting;
  const hidden = fields(args)['hidden'] === true;
  if (formatting.hidden !== hidden) {
    services.state.dispatch({ slice: 'table', type: 'formatting-changed', formatting: { ...formatting, hidden } });
  }
  return Promise.resolve();
}

/** `table.forget-formatting` `{ connection }`: the rules of a connection removed, of its databases and collections. */
export function forgetConnectionFormatting(services: MainServices, args: Json): Promise<void> {
  const connection = textField(args, 'connection');
  changeRules(services, (kept) => withoutConnection(kept, connection));
  return Promise.resolve();
}

/** What a drop made from Datardo dropped, for its rules: collections of a database, or the whole database. */
export type DroppedFormatting =
  | { readonly connection: string; readonly database: string; readonly collections: readonly string[] }
  | { readonly connection: string; readonly database: string; readonly collections: 'whole-database' };

/** The rules of what was dropped are forgotten (`tree.forget-colors`, which forgets the colors of the same). */
export function forgetDroppedFormatting(services: MainServices, dropped: DroppedFormatting): void {
  const place = { connection: dropped.connection, database: dropped.database };
  const { collections } = dropped;
  changeRules(services, (kept) =>
    collections === 'whole-database'
      ? withoutDatabase(kept, place)
      : collections.reduce((each, collection) => withoutCollection(each, { ...place, collection }), kept),
  );
}

/** The rules of a collection renamed from Datardo follow its new name (`manage.rename-collection`). */
export function moveFormatting(services: MainServices, where: TableCollection, to: string): void {
  changeRules(services, (kept) => withRenamedCollection(kept, where, to));
}

function logLine(services: MainServices, text: string): void {
  services.state.dispatch({
    slice: 'runner',
    type: 'logged',
    lines: [{ time: Date.now(), source: 'table.formatting', kind: 'info', text: `[table.formatting] ${text}` }],
  });
}

/** Loads `formatting.json` into the state, and writes it again after each change of the rules. */
export async function start(services: MainServices): Promise<void> {
  const store = new Store(services.dataFolder, formattingFile, (error) => {
    logLine(services, `The formatting rules could not be saved: ${String(error)}`);
  });
  try {
    const found = await store.load();
    if (found.kind === 'damaged') {
      logLine(services, `The formatting rules could not be read and were set aside as ${found.setAsideAs}.`);
    }
  } catch (error: unknown) {
    logLine(services, `The formatting rules could not be read: ${String(error)}`);
  }
  services.state.dispatch({ slice: 'table', type: 'formatting-changed', formatting: store.get() });
  services.state.listen((event, state) => {
    if (event.slice === 'table' && event.type === 'formatting-changed') {
      store.set(state.table.formatting);
    }
  });
  services.onQuit(() => store.flush());
}
