/**
 * The actions of the undo history the runner carries out (`undo.*`): its reads, which compute fingerprints, writing an
 * operation's file and adding it to `undo/index.json`, removing operations with their files, and marking one undone;
 * and `connection.set-keeps-undo`, which saves whether a connection keeps its undo history (`undo.per-connection`).
 * An operation's file is written before its entry is added, so that an entry never names a file that is not there.
 *
 * They are made from what they use ({@link UndoDeps}), with no Electron, so that the integration tests run them
 * against real servers; `src/main/actions/undo.ts` gives them the main process's pieces.
 */
import type { EngineService } from '../engines';
import type { AppAction, StateHolder } from '../runner/ports';
import type { SavedConnection } from '../shared/connection';
import type { Json } from '../shared/engine-request';
import type { ConnectionId } from '../shared/ids';
import type { OperationId, UndoEntry } from '../shared/state/undo';
import type { Found, JsonObject } from '../storage/store';
import {
  deleteOperationFiles,
  deleteOrphanFiles,
  entryOf,
  readOperationFile,
  writeOperationFile,
} from '../storage/undo';
import { keep, readCurrent } from './undo-reads';

/** What the actions use. */
export interface UndoDeps {
  readonly state: StateHolder;
  readonly dataFolder: string;
  readonly engines: () => Pick<EngineService, 'send'>;
  /** Writes the operations to `undo/index.json`; throws when it may not be written. */
  readonly writeEntries: (entries: readonly UndoEntry[]) => void;
  /** How the index was found in this run (RS4). */
  readonly indexFound: () => Found;
  /** Connects the connection of an operation about to be undone, when it is not connected. */
  readonly connectFirst: (entry: UndoEntry) => Promise<void>;
  readonly findConnection: (id: ConnectionId) => SavedConnection | undefined;
  readonly writeConnection: (connection: SavedConnection) => void;
}

function fields(args: Json): Readonly<Record<string, Json>> {
  return typeof args === 'object' && args !== null && !Array.isArray(args)
    ? (args as Readonly<Record<string, Json>>)
    : {};
}

function operationOf(args: Json): OperationId {
  const operation = fields(args)['operation'];
  if (typeof operation !== 'string') {
    throw new Error('The action needs an operation.');
  }
  return operation as OperationId;
}

function textsOf(value: Json | undefined): readonly string[] {
  return Array.isArray(value) ? value.filter((each): each is string => typeof each === 'string') : [];
}

/** The sizes of the files written, until their operation is added to the index. */
const written = new Map<string, number>();

/** `undo.write-operation` `{ operation, records }`: writes the operation's file once; gives its size. */
function writeOperation(deps: UndoDeps): AppAction {
  return async (args) => {
    const operation = operationOf(args);
    const records = fields(fields(args)['records'] ?? null) as JsonObject;
    const size = await writeOperationFile(deps.dataFolder, operation, records);
    written.set(operation, size);
    return size;
  };
}

/** `undo.add-operation` `{ entry }`: adds the operation to the history, with the size of its file. */
function addOperation(deps: UndoDeps): AppAction {
  return (args) => {
    const stored = entryOf(fields(fields(args)['entry'] ?? null));
    const entry = { ...stored, size: written.get(stored.id) ?? stored.size } as UndoEntry;
    written.delete(stored.id);
    deps.state.dispatch({ slice: 'undo', type: 'recorded', entry });
    deps.writeEntries(deps.state.get().undo.entries);
    return Promise.resolve();
  };
}

/** Removes operations from the history, then deletes their files. */
async function removeOperations(deps: UndoDeps, operations: readonly OperationId[]): Promise<void> {
  if (operations.length === 0) {
    return;
  }
  deps.state.dispatch({ slice: 'undo', type: 'removed', operations });
  deps.writeEntries(deps.state.get().undo.entries);
  await deleteOperationFiles(deps.dataFolder, operations);
}

/** `undo.forget-connection` `{ connection }` (or the connection's id): the operations of a connection removed. */
function forgetConnection(deps: UndoDeps): AppAction {
  return (args) => {
    const connection = (typeof args === 'string' ? args : fields(args)['connection']) as ConnectionId;
    const operations = deps.state
      .get()
      .undo.entries.filter((each) => each.connection === connection)
      .map((each) => each.id);
    return removeOperations(deps, operations);
  };
}

/** `undo.mark-undone` `{ operation, pageMessage? }`: the operation stays listed as undone, and its file is deleted. */
function markUndone(deps: UndoDeps): AppAction {
  return async (args) => {
    const operation = operationOf(args);
    deps.state.dispatch({ slice: 'undo', type: 'undone', operation, time: Date.now() });
    deps.writeEntries(deps.state.get().undo.entries);
    await deleteOperationFiles(deps.dataFolder, [operation]);
    const message = fields(args)['pageMessage'];
    if (typeof message === 'string') {
      deps.state.dispatch({ slice: 'undo', type: 'message', message: { text: message, failed: false } });
    }
  };
}

/**
 * `undo.read-operation` `{ operation, first? }`: the operation's records, how many, and how they are now. The read of
 * an undo, which reads them all, connects first; the details of a row (`first`) do not.
 */
function readOperation(deps: UndoDeps): AppAction {
  return async (args, signal) => {
    const operation = operationOf(args);
    const entry = deps.state.get().undo.entries.find((each) => each.id === operation);
    const file = await readOperationFile(deps.dataFolder, operation);
    if (entry === undefined || file.kind !== 'read') {
      return { kind: 'missing' };
    }
    if (fields(args)['first'] === undefined) {
      await deps.connectFirst(entry);
    }
    const all = (file.content['docs'] ?? file.content['keys'] ?? []) as readonly Json[];
    const first = fields(args)['first'];
    const shown = typeof first === 'number' ? all.slice(0, first) : all;
    const records = file.content['docs'] === undefined ? { keys: [...shown] } : { docs: [...shown] };
    const current = await readCurrent(deps.engines(), entry, records, signal);
    return { kind: 'read', records, total: all.length, current };
  };
}

/** `connection.set-keeps-undo` `{ connection, keepsUndo }`. */
function setKeepsUndo(deps: UndoDeps): AppAction {
  return (args) => {
    const id = fields(args)['connection'];
    const connection = typeof id === 'string' ? deps.findConnection(id as ConnectionId) : undefined;
    if (connection === undefined) {
      throw new Error('The connection no longer exists.');
    }
    deps.writeConnection({ ...connection, keepsUndo: fields(args)['keepsUndo'] === true });
    return Promise.resolve();
  };
}

/** The actions, by name. */
export function undoActions(deps: UndoDeps): Readonly<Record<string, AppAction>> {
  return {
    'undo.keep': (args, signal) => keep(deps.engines(), args, signal),
    'undo.read-operation': readOperation(deps),
    'undo.write-operation': writeOperation(deps),
    'undo.add-operation': addOperation(deps),
    'undo.prune': (args) => removeOperations(deps, textsOf(fields(args)['operations']) as OperationId[]),
    'undo.remove': (args) => removeOperations(deps, [operationOf(args)]),
    'undo.clear': () =>
      removeOperations(
        deps,
        deps.state.get().undo.entries.map((each) => each.id),
      ),
    'undo.forget-connection': forgetConnection(deps),
    'undo.mark-undone': markUndone(deps),
    'undo.delete-files': async (args) => {
      await deleteOrphanFiles(deps.dataFolder, textsOf(fields(args)['files']), deps.indexFound());
    },
    'connection.set-keeps-undo': setKeepsUndo(deps),
  };
}
