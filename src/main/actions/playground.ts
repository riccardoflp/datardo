/**
 * The actions of the playground area the runner carries out for app steps and app reads (playground.md): opening a
 * playground's tab, its connection and database, its text as the editor types it, the remembered target of its file,
 * the file dialogs, and the start and the stop of a run, which the host carries out in a process of its own.
 */
import { dialog, type FileFilter } from 'electron';
import type { Json } from '../../shared/engine-request';
import { connectionId, featureId, tabId, type TabId } from '../../shared/ids';
import { connectionState } from '../../shared/state/connections';
import type { Tab, TabShows } from '../../shared/state/tabs';
import type { RunError, TextRange } from '../../shared/state/playgrounds';
import { fileName } from '../../features/playground/open-file';
import { databasesRequest } from '../../features/playground/target';
import { hasUnsavedChanges } from '../../features/playground/types';
import { newPlaygroundTitle } from '../../features/tab/title';
import { Cancelled } from '../../runner/cancel';
import { decide } from '../../runner/decide';
import { whenRunnerReady } from '../bridge';
import { connectionEngines } from '../connections';
import {
  currentLayout,
  playgroundHost,
  readPlaygroundFile,
  rememberedTarget,
  rememberTarget,
  writableProblem,
} from '../playgrounds';
import type { MainServices } from '../services';
import { openTab } from './tab';
import type { AreaActions } from '.';

type Fields = { readonly [key: string]: Json };

function fieldsOf(args: Json): Fields {
  return typeof args === 'object' && args !== null && !Array.isArray(args) ? (args as Fields) : {};
}

function textField(args: Json, name: string): string {
  const value = fieldsOf(args)[name];
  if (typeof value !== 'string') {
    throw new Error(`The action needs ${name}.`);
  }
  return value;
}

function playgroundTab(
  services: MainServices,
  id: string,
): Tab & { readonly shows: Extract<TabShows, { kind: 'playground' }> } {
  const tab = services.state.get().tabs.tabs.find((each) => each.id === id);
  if (tab?.shows.kind !== 'playground') {
    throw new Error('That playground is not open.');
  }
  return tab as Tab & { readonly shows: Extract<TabShows, { kind: 'playground' }> };
}

/** The unsaved changes of a tab and its draft (D33), as its playground's text now says. */
function followUnsaved(services: MainServices, tab: TabId): void {
  const playground = services.state.get().playgrounds[tab];
  if (playground === undefined) {
    return;
  }
  const unsaved = hasUnsavedChanges(playground);
  services.state.dispatch({
    slice: 'tabs',
    type: 'changed',
    tab,
    unsaved,
    draft: unsaved ? { text: playground.text } : null,
  });
}

/** `playground.open` `{ connection, database, title, text, caret, file? }`: the tab, with its playground. */
function open(services: MainServices, args: Json): Promise<void> {
  const fields = fieldsOf(args);
  const script = textField(args, 'text');
  const file = typeof fields['file'] === 'string' ? fields['file'] : undefined;
  const shows: TabShows = {
    kind: 'playground',
    connection: connectionId(textField(args, 'connection')),
    title: textField(args, 'title'),
    ...(file === undefined ? {} : { file }),
  };
  const id = tabId(`tab-${String(services.state.get().tabs.nextId)}`);
  const caret = fields['caret'] === 'end' ? script.length : 0;
  services.state.dispatch({
    slice: 'playgrounds',
    type: 'opened',
    playground: {
      tab: id,
      defaultDatabase: textField(args, 'database'),
      text: script,
      savedText: script,
      selection: { from: caret, to: caret },
      layout: currentLayout(services),
    },
  });
  openTab(services, { shows }, { background: false, visiting: 'visit' });
  return Promise.resolve();
}

/** `playground.set-target` `{ tab, connection, database }`: the tab moves to the group of its new connection. */
function setTarget(services: MainServices, args: Json): Promise<void> {
  const tab = playgroundTab(services, textField(args, 'tab'));
  const connection = connectionId(textField(args, 'connection'));
  services.state.dispatch({
    slice: 'playgrounds',
    type: 'target-set',
    tab: tab.id,
    database: textField(args, 'database'),
  });
  if (connection !== tab.shows.connection) {
    const siblings = services.state
      .get()
      .tabs.tabs.filter((each) => each.shows.kind === 'playground' && each.shows.connection === connection)
      .map((each) => each.shows);
    const taken = siblings.some((each) => each.kind === 'playground' && each.title === tab.shows.title);
    const title = tab.shows.file === undefined && taken ? newPlaygroundTitle(siblings) : tab.shows.title;
    services.state.dispatch({
      slice: 'tabs',
      type: 'shows-changed',
      tab: tab.id,
      shows: { ...tab.shows, connection, title },
    });
  }
  return Promise.resolve();
}

/** `playground.remember` `{ tab, path, connection, database, text }`: after the file is written. */
async function remember(services: MainServices, args: Json): Promise<void> {
  const tab = playgroundTab(services, textField(args, 'tab'));
  const path = textField(args, 'path');
  const connection = connectionId(textField(args, 'connection'));
  services.state.dispatch({ slice: 'playgrounds', type: 'saved', tab: tab.id, text: textField(args, 'text') });
  services.state.dispatch({
    slice: 'tabs',
    type: 'shows-changed',
    tab: tab.id,
    shows: { kind: 'playground', connection, title: fileName(path), file: path },
  });
  followUnsaved(services, tab.id);
  await rememberTarget(services, path, { connection, database: textField(args, 'database') });
}

function selectionOf(value: Json | undefined): TextRange | undefined {
  const fields = fieldsOf(value ?? null);
  const from = fields['from'];
  const to = fields['to'];
  return typeof from === 'number' && typeof to === 'number' ? { from, to } : undefined;
}

/** `playground.edit` `{ tab, text, selection? }`: the text as the editor has it, with its dot and its draft. */
function edit(services: MainServices, args: Json): Promise<null> {
  const tab = tabId(textField(args, 'tab'));
  const selection = selectionOf(fieldsOf(args)['selection']);
  services.state.dispatch({
    slice: 'playgrounds',
    type: 'edited',
    tab,
    text: textField(args, 'text'),
    ...(selection === undefined ? {} : { selection }),
  });
  followUnsaved(services, tab);
  return Promise.resolve(null);
}

/** `playground.layout` `{ tab, layout }`: the results as a table or as JSON, for every playground from now on. */
function layout(services: MainServices, args: Json): Promise<null> {
  services.state.dispatch({
    slice: 'playgrounds',
    type: 'layout-chosen',
    tab: tabId(textField(args, 'tab')),
    layout: fieldsOf(args)['layout'] === 'json' ? 'json' : 'table',
  });
  return Promise.resolve(null);
}

/** Connects a connection when it is not: null once connected, or why it could not be. */
async function connected(services: MainServices, id: string, signal: AbortSignal): Promise<string | null> {
  const connection = connectionId(id);
  if (connectionState(services.state.get().connections, connection) !== 'connected') {
    const ports = await whenRunnerReady();
    await ports.appActions.get('engine.connect')?.({ connection: id }, signal);
  }
  const live = services.state.get().connections.live[connection];
  return live?.state === 'connected' ? null : (live?.reason ?? 'not connected');
}

/** `playground.list-databases` `{ connection }`: the reply of `listDatabases`, or `{ error }`. */
async function listDatabases(services: MainServices, args: Json, signal: AbortSignal): Promise<Json> {
  const connection = textField(args, 'connection');
  const error = await connected(services, connection, signal);
  if (error !== null) {
    return { error };
  }
  try {
    return (await connectionEngines().send(
      { connection: connectionId(connection), request: databasesRequest() },
      signal,
    )) as Json;
  } catch (failed: unknown) {
    return { error: failed instanceof Error ? failed.message : String(failed) };
  }
}

function filtersOf(value: Json | undefined): FileFilter[] {
  return (Array.isArray(value) ? (value as readonly Json[]) : []).flatMap((each) => {
    const fields = fieldsOf(each);
    const extensions = Array.isArray(fields['extensions']) ? fields['extensions'] : [];
    return typeof fields['name'] === 'string'
      ? [{ name: fields['name'], extensions: extensions.filter((one): one is string => typeof one === 'string') }]
      : [];
  });
}

/** `playground.choose-file` `{ mode, title, name?, filters }`: the system's open or save dialog; the path, or null. */
async function chooseFile(services: MainServices, args: Json): Promise<string | null> {
  const fields = fieldsOf(args);
  const title = typeof fields['title'] === 'string' ? fields['title'] : '';
  const filters = filtersOf(fields['filters']);
  const window = services.window();
  if (fields['mode'] === 'save') {
    const options = { title, filters, defaultPath: typeof fields['name'] === 'string' ? fields['name'] : '' };
    const chosen =
      window === undefined ? await dialog.showSaveDialog(options) : await dialog.showSaveDialog(window, options);
    return chosen.canceled || chosen.filePath === '' ? null : chosen.filePath;
  }
  const options = { title, filters, properties: ['openFile' as const] };
  const chosen =
    window === undefined ? await dialog.showOpenDialog(options) : await dialog.showOpenDialog(window, options);
  return chosen.canceled ? null : (chosen.filePaths[0] ?? null);
}

function runArgs(args: Json): Parameters<ReturnType<typeof playgroundHost>['start']>[1] {
  const fields = fieldsOf(args);
  const error = fieldsOf(fields['error'] ?? null);
  const code = fields['code'];
  const line = error['line'];
  const runError: RunError | undefined =
    typeof error['message'] === 'string'
      ? { message: error['message'], ...(typeof line === 'number' ? { line } : {}) }
      : undefined;
  const firstLine = fields['firstLine'];
  return {
    tab: tabId(textField(args, 'tab')),
    title: textField(args, 'title'),
    connection: connectionId(textField(args, 'connection')),
    database: textField(args, 'database'),
    firstLine: typeof firstLine === 'number' ? firstLine : 1,
    ...(typeof code === 'string' ? { code } : {}),
    ...(runError === undefined ? {} : { error: runError }),
    writes: fields['writes'] === true,
  };
}

/** `playground.run`: starts the run and returns at once; the run goes on as work in progress of its own. */
async function run(args: Json): Promise<void> {
  const ports = await whenRunnerReady();
  playgroundHost().start(ports, runArgs(args));
}

/**
 * `tab.save` `{ tab }`: saves a tab before it closes (`tab.close`, `window.quit`). A save that wrote nothing, its file
 * dialog closed, stops the close.
 */
async function saveTab(services: MainServices, args: Json, signal: AbortSignal): Promise<void> {
  const tab = playgroundTab(services, textField(args, 'tab'));
  const ports = await whenRunnerReady();
  const feature = featureId('playground.save');
  // The plan of the save is carried out here, inside the plan of the close that asked for it, not queued behind it.
  const decided = await decide(
    {
      ports,
      context: {
        feature,
        now: ports.now(),
        platform: ports.platform,
        startedBy: 'user',
        target: { kind: 'tab', tab: tab.id },
        state: ports.state.get(),
      },
      signal,
    },
    feature,
    { args: { tab: tab.id } },
  );
  if (decided.kind === 'refused') {
    throw new Error(decided.message);
  }
  if (decided.kind === 'cancelled') {
    throw new Cancelled();
  }
  for (const step of decided.plan.steps) {
    if (step.kind === 'file') {
      await ports.files(step, signal);
    } else if (step.kind === 'app') {
      await ports.appActions.get(step.action)?.(step.args, signal);
    }
  }
  const playground = services.state.get().playgrounds[tab.id];
  if (playground !== undefined && hasUnsavedChanges(playground)) {
    throw new Cancelled();
  }
}

/** The actions of this area, by name. */
export const actions: AreaActions = (services) => ({
  'playground.open': (args) => open(services, args),
  'playground.set-target': (args) => setTarget(services, args),
  'playground.remember': (args) => remember(services, args),
  'playground.edit': (args) => edit(services, args),
  'playground.layout': (args) => layout(services, args),
  'playground.connect': (args, signal) => connected(services, textField(args, 'connection'), signal),
  'playground.list-databases': (args, signal) => listDatabases(services, args, signal),
  'playground.choose-file': (args) => chooseFile(services, args),
  'playground.writable': (args) => writableProblem(textField(args, 'path')),
  'playground.read-file': (args) => {
    const largest = fieldsOf(args)['largest'];
    return readPlaygroundFile(textField(args, 'path'), typeof largest === 'number' ? largest : Number.MAX_SAFE_INTEGER);
  },
  'playground.remembered': async (args) => (await rememberedTarget(services, textField(args, 'path'))) ?? null,
  'playground.run': (args) => run(args),
  'playground.stop': () => playgroundHost().stop(),
  'tab.save': (args, signal) => saveTab(services, args, signal),
});
