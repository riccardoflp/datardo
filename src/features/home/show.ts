/**
 * Feature: home.show
 *
 * The Home page: with no saved connection the welcome, **Add connection** and **Import connections…**; otherwise the
 * row of the filter, **Jump back in** and the cards by folder. Showing it connects nothing. `view` says what the page
 * shows; `open` is what **Home** of the rail, `Alt+Home` and Go to start: it opens the Home tab, and it carries the
 * choices the page remembers (the engine chosen, the folders collapsed).
 */
import type { Json } from '../../shared/engine-request';
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import type { EngineChoice } from '../../shared/state/palette';
import { appPlan, appStep, startArgs } from '../nav/types';
import { view as connectionsView, type ConnectionsView } from './connections';
import { view as jumpBackInView, type JumpBackIn } from './jump-back-in';
import { text } from './text';

/** A button of Home that starts a feature of the connection area. */
export interface HomeButton {
  readonly label: string;
  readonly feature: string;
  readonly element: string;
}

/** One engine of the filter row, with the number of connections that pass the text. */
export interface EngineButton {
  readonly engine: EngineChoice;
  readonly label: string;
  readonly count: number;
  readonly chosen: boolean;
}

/** The welcome, with no saved connection. */
export interface Welcome {
  readonly kind: 'welcome';
  readonly title: string;
  readonly line: string;
  readonly add: HomeButton;
  readonly import: HomeButton;
}

/** Home with saved connections. */
export interface WithConnections {
  readonly kind: 'connections';
  readonly filter: {
    readonly placeholder: string;
    readonly label: string;
    readonly element: 'home.filter@home';
    /** None when the saved connections are all of one engine. */
    readonly engines?: readonly EngineButton[];
    readonly enginesLabel: string;
    readonly clear: string;
  };
  readonly add: HomeButton;
  readonly more: { readonly label: string; readonly entries: readonly HomeButton[] };
  readonly jumpBackIn?: JumpBackIn;
  readonly connections: ConnectionsView;
}

/** What Home shows. */
export type HomeView = Welcome | WithConnections;

/** What the page is drawn from: the app's state and the text typed in the filter. */
export interface HomeInput {
  readonly state: AppState;
  readonly typed: string;
}

const addButton: HomeButton = { label: text.addConnection, feature: 'connection.add', element: 'connection.add@home' };
const importButton: HomeButton = {
  label: text.importConnections,
  feature: 'connection.import',
  element: 'connection.import@home',
};
const exportButton: HomeButton = {
  label: text.exportConnections,
  feature: 'connection.export',
  element: 'connection.export@home',
};

const engineChoices: readonly EngineChoice[] = ['all', 'mongodb', 'redis'];

/** Feature: home.show. What the Home page shows. */
export function view(input: HomeInput): HomeView {
  const { state } = input;
  if (state.connections.saved.length === 0) {
    return { kind: 'welcome', ...text.welcome, add: addButton, import: importButton };
  }
  const connections = connectionsView(input);
  const { filtered } = connections;
  const chosen = filtered.enginesShown ? state.palette.home.engine : 'all';
  const jumpBackIn = jumpBackInView(state);
  return {
    kind: 'connections',
    filter: {
      placeholder: text.filter.placeholder,
      label: text.filter.label,
      element: 'home.filter@home',
      ...(filtered.enginesShown
        ? {
            engines: engineChoices.map((engine) => ({
              engine,
              label: text.filter.engine[engine],
              count: filtered.counts[engine],
              chosen: engine === chosen,
            })),
          }
        : {}),
      enginesLabel: text.filter.engines,
      clear: text.filter.clear,
    },
    add: addButton,
    more: { label: text.more, entries: [importButton, exportButton] },
    ...(jumpBackIn === undefined ? {} : { jumpBackIn }),
    connections,
  };
}

/** The app action that remembers the engine chosen on Home. */
export const chooseEngineAction = 'home.choose-engine';
/** The app action that remembers whether a folder of Home is collapsed. */
export const collapseFolderAction = 'home.collapse-folder';

function isEngineChoice(value: unknown): value is EngineChoice {
  return value === 'all' || value === 'mongodb' || value === 'redis';
}

/**
 * Opens the Home tab; with `{ engine }` remembers the engine chosen, with `{ folder, collapsed }` whether a folder is
 * collapsed. These choices are kept across starts, in `home.json`.
 */
export function plan(_context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  const engine = args['engine'];
  if (isEngineChoice(engine)) {
    const label = text.filter.engine[engine];
    return run(appPlan(text.plans.engine, [appStep(text.steps.engine(label), chooseEngineAction, { engine })]));
  }
  const folder = args['folder'];
  if (typeof folder === 'string' && typeof args['collapsed'] === 'boolean') {
    const collapsed = args['collapsed'];
    const title = collapsed ? text.plans.collapse(folder) : text.plans.expand(folder);
    const step = collapsed ? text.steps.collapse(folder) : text.steps.expand(folder);
    return run(appPlan(title, [appStep(step, collapseFolderAction, { folder, collapsed } satisfies Json)]));
  }
  return run(appPlan(text.plans.show, [], [{ kind: 'open', page: 'home' }]));
}

/** What **Home** of the rail, `Alt+Home` and Go to start. */
export const open: OperationFeature = { kind: 'operation', id: featureId('home.show'), plan };
