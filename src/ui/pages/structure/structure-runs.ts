/**
 * What the structure comparison page does through the bridge (`structure.show`): the two lists of the right side
 * (`connection.connect`, `tree.list-databases`), the read of both structures (`structure.read`, whose work in progress
 * says how far each side is), **⇄**, the operations of the page (`structure.copy-script`,
 * `structure.open-in-playground`, `structure.apply`, after which the page compares again), and what the tab keeps
 * (`structure.show` with `{ keep }`).
 */
import { choicesOf, keptOf } from '../../../features/structure/model/memory';
import type { BothStructures } from '../../../features/structure/read';
import { databaseChoices, type StructurePageState } from '../../../features/structure/show';
import { diffStructure } from '../../../features/structure/steps';
import { text } from '../../../features/structure/text';
import type { StructureSide } from '../../../features/structure/types';
import { listDatabasesArgs } from '../../../features/tree/list-databases';
import type { MongoDatabase } from '../../../features/tree/types';
import type { IntentResult } from '../../../shared/bridge';
import type { Json } from '../../../shared/engine-request';
import { connectionId, featureId, type Place } from '../../../shared/ids';
import { connectionState } from '../../../shared/state/connections';
import type { TabShows } from '../../../shared/state/tabs';
import type { Target } from '../../../shared/target';
import { currentAppState } from '../../state/store';
import {
  changeStructurePage,
  changeStructureTab,
  setStructureTab,
  structureTabOf,
  type StructureTab,
} from './structure-store';

/** What a choice of the right side leads to: the comparison the first time, or always after **⇄** and a restore. */
type Then = 'first-time' | 'compare';

function start(feature: string, target: Target, place: Place, args: Json): Promise<IntentResult> {
  return window.datardo.start({ feature: featureId(feature), target, place, args });
}

function messageOf(result: IntentResult): string | undefined {
  return result.kind === 'failed' || result.kind === 'refused' ? result.message : undefined;
}

function connectionsOf(): StructurePageState['connections'] {
  return currentAppState()
    .connections.saved.filter((each) => each.engine === 'mongodb')
    .map((each) => ({ id: each.id, name: each.name, readOnly: each.readOnly }));
}

/** Keeps the sides and the choices with the tab, and its title (`structure.keep`), when they changed. */
export function keepStructure(tab: string): void {
  const page = structureTabOf(tab)?.page;
  if (page === undefined) {
    return;
  }
  const { left, right, showAll, folded, drops, chip } = page;
  const choices = choicesOf({ left, right, showAll, folded, drops, ...(chip === undefined ? {} : { chip }) });
  const kept = JSON.stringify(choices);
  if (structureTabOf(tab)?.kept === kept) {
    return;
  }
  changeStructureTab(tab, (each) => ({ ...each, kept }));
  void start('structure.show', { kind: 'app' }, 'form', { keep: { tab, choices } });
}

/** Opens the page of a tab: from what the tab keeps, comparing again when it kept a right side. */
export function openStructure(tab: string, shows: TabShows, choices: Readonly<Record<string, string>> | undefined) {
  const kept = structureTabOf(tab) === undefined ? keptOf(shows, choices) : undefined;
  if (kept === undefined) {
    return;
  }
  setStructureTab(tab, {
    page: {
      left: kept.left,
      right: {},
      connections: connectionsOf(),
      comparing: false,
      showAll: kept.showAll,
      ...(kept.chip === undefined ? {} : { chip: kept.chip }),
      folded: kept.folded,
      drops: kept.drops,
      swapping: false,
    },
    started: false,
    run: 0,
    kept: JSON.stringify(choicesOf(kept)),
  });
  const { connection, database } = kept.right;
  void (connection === undefined
    ? chooseConnection(tab, kept.left.connection, undefined, 'first-time')
    : chooseConnection(tab, connection, database, 'compare'));
}

/** The page after a change of the right side: once a comparison has run, its result is cleared. */
function cleared(each: StructureTab, right: StructurePageState['right']): StructureTab {
  const { result: _result, selected: _selected, error: _error, ...page } = each.page;
  return each.started ? { ...each, page: { ...page, right } } : { ...each, page: { ...each.page, right } };
}

/** **Connection**: connects it when it is not connected, lists its databases and chooses one by itself. */
export async function chooseConnection(tab: string, connection: string, wanted: string | undefined, then: Then) {
  changeStructureTab(tab, (each) => {
    const { databases: _databases, ...rest } = cleared(each, { connection }).page;
    return { ...each, page: rest };
  });
  const app = currentAppState();
  const id = connectionId(connection);
  const name = app.connections.saved.find((each) => each.id === id)?.name ?? connection;
  const failed = (message: string): void => {
    changeStructurePage(tab, (page) => ({ ...page, error: text.show.couldNotConnect(name, message) }));
  };
  if (connectionState(app.connections, id) !== 'connected') {
    const message = messageOf(await start('connection.connect', { kind: 'connection', connection: id }, 'form', null));
    if (message !== undefined) {
      failed(message);
    }
    if (message !== undefined || structureTabOf(tab)?.page.right.connection !== connection) {
      return;
    }
  }
  const args = listDatabasesArgs(currentAppState(), id);
  const listed = await start('tree.list-databases', { kind: 'connection', connection: id }, 'form', args);
  const page = structureTabOf(tab)?.page;
  if (page?.right.connection !== connection) {
    return;
  }
  if (listed.kind !== 'read') {
    failed(messageOf(listed) ?? '');
    return;
  }
  const databases = (listed.result as readonly MongoDatabase[]).map((each) => each.name);
  changeStructurePage(tab, (each) => ({ ...each, databases }));
  const offered = databaseChoices(page.left, connection, databases);
  const database = offered.find((each) => each === wanted) ?? offered.find((each) => each === page.left.database);
  if (database !== undefined) {
    chooseDatabase(tab, database, then);
  }
}

/** **Database**: the right side; the first comparison starts by itself, later ones wait for **Compare**. */
export function chooseDatabase(tab: string, database: string, then: Then = 'first-time'): void {
  const before = structureTabOf(tab);
  const connection = before?.page.right.connection;
  if (before === undefined || connection === undefined) {
    return;
  }
  changeStructureTab(tab, (each) => cleared(each, { connection, database }));
  keepStructure(tab);
  if (then === 'compare' || !before.started) {
    void compareStructures(tab);
  }
}

/** Finds the item of work of the read, for its progress on the page. */
function watchWork(tab: string, run: number): () => void {
  const before = new Set(currentAppState().runner.work.map((each) => each.id));
  let answered = false;
  const look = (): void => {
    if (answered || structureTabOf(tab)?.run !== run) {
      return;
    }
    const work = currentAppState().runner.work.find(
      (each) => each.feature === 'structure.read' && !before.has(each.id),
    );
    if (work === undefined) {
      setTimeout(look, 50);
      return;
    }
    changeStructureTab(tab, (each) => (each.run === run ? { ...each, work: work.id } : each));
  };
  look();
  return () => {
    answered = true;
  };
}

function ended(tab: string, run: number, change: (page: StructurePageState) => StructurePageState): void {
  changeStructureTab(tab, (each) => {
    if (each.run !== run) {
      return each;
    }
    const { work: _work, ...rest } = each;
    const { progress: _progress, progressText: _text, ...page } = each.page;
    return { ...rest, page: change({ ...page, comparing: false, swapping: false }) };
  });
}

/** **Compare**: reads both structures again; the result before it stays until the new one is read. */
export async function compareStructures(tab: string): Promise<void> {
  const before = structureTabOf(tab);
  const { connection, database } = before?.page.right ?? {};
  if (before === undefined || connection === undefined || database === undefined || before.page.comparing) {
    return;
  }
  const run = before.run + 1;
  const left = before.page.left;
  const right: StructureSide = { connection, database };
  const { error: _error, ...page } = before.page;
  setStructureTab(tab, { ...before, run, started: true, page: { ...page, comparing: true } });
  const startedAt = Date.now();
  const stop = watchWork(tab, run);
  const result = await start(
    'structure.read',
    { kind: 'connection', connection: connectionId(left.connection) },
    'form',
    {
      left: { ...left },
      right: { ...right },
    },
  );
  stop();
  if (structureTabOf(tab)?.run !== run) {
    return;
  }
  const both = result.kind === 'read' ? (result.result as BothStructures) : undefined;
  if (both === undefined || both.left.kind === 'error' || both.right.kind === 'error') {
    const failure = both?.left.kind === 'error' ? both.left : both?.right.kind === 'error' ? both.right : undefined;
    const error = failure?.message ?? messageOf(result);
    ended(tab, run, (each) => (error === undefined ? each : { ...each, error }));
    return;
  }
  const comparison = diffStructure(both.left.structure, both.right.structure);
  changeStructureTab(tab, (each) => (each.run === run ? { ...each, compared: { left, right } } : each));
  ended(tab, run, (each) => ({ ...each, result: { comparison, milliseconds: Date.now() - startedAt } }));
}

/** **⇄**: exchanges the two databases, then compares again. */
export function swapStructures(tab: string): void {
  const now = structureTabOf(tab);
  const { connection, database } = now?.page.right ?? {};
  if (now === undefined || connection === undefined || database === undefined || now.page.comparing) {
    return;
  }
  const left = now.page.left;
  changeStructurePage(tab, (page) => ({ ...page, left: { connection, database }, swapping: true }));
  void chooseConnection(tab, left.connection, left.database, 'compare');
}

/** **Only differences**, **All**, **Include drops in the script**: what the list and the script show. */
export function setChoice(tab: string, change: Partial<Pick<StructurePageState, 'showAll' | 'drops'>>): void {
  changeStructurePage(tab, (page) => ({ ...page, ...change }));
  keepStructure(tab);
}

/** Starts an operation of the page: with the sides, the last comparison and what it acts on. */
export async function startOperation(
  tab: string,
  feature: string,
  place: Place,
  args: Readonly<Record<string, Json>> = {},
): Promise<void> {
  const now = structureTabOf(tab);
  const compared = now?.compared;
  const comparison = now?.page.result?.comparison;
  if (now === undefined || compared === undefined || comparison === undefined) {
    return;
  }
  const result = await start(
    feature,
    { kind: 'connection', connection: connectionId(compared.right.connection) },
    place,
    {
      left: { ...compared.left },
      right: { ...compared.right },
      comparison: {
        left: { ...compared.left },
        right: { ...compared.right },
        differences: comparison.differences as unknown as Json,
      },
      comparing: now.page.comparing,
      drops: now.page.drops,
      ...args,
    },
  );
  if (feature === 'structure.apply' && result.kind === 'done') {
    await compareStructures(tab);
  }
}
