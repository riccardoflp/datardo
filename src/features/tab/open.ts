/**
 * Feature: tab.open
 *
 * Shows something in a tab of the main island: what every feature that shows a page starts, with what to show
 * (`args.shows`). What already has a tab gets no second one: that tab is made active, and what came with the request
 * (its section, its query text) is given to it.
 */
import type { Json } from '../../shared/engine-request';
import {
  refuse,
  run,
  type After,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { connectionState } from '../../shared/state/connections';
import { connectionOfShows, type Tab, type TabMemory, type TabShows } from '../../shared/state/tabs';
import { appPlan, appStep } from '../nav/types';
import { targetKey } from './same-target';
import { text } from './text';
import { newPlaygroundTitle } from './title';
import { isSaved, readMemory, readTabShows, startedWith, stepName } from './types';

/** What is asked to be opened. */
export interface OpenRequest {
  readonly shows: TabShows;
  /** Asked for in the background: a click with the middle button or with `Ctrl`, `Ctrl+Enter` in Go to. */
  readonly background: boolean;
  readonly section?: string;
  readonly memory?: TabMemory;
}

/** The request of `args`: `{ shows, background?, section?, memory? }`; `undefined` when `shows` is not a tab. */
export function openRequest(answers: Answers): OpenRequest | undefined {
  const started = startedWith(answers);
  if (started.kind !== 'object') {
    return undefined;
  }
  const { args } = started;
  const shows = readTabShows(args['shows']);
  const memory = readMemory(args['memory']);
  const section = args['section'];
  return shows === undefined
    ? undefined
    : {
        shows,
        background: args['background'] === true,
        ...(typeof section === 'string' ? { section } : {}),
        ...(memory === undefined ? {} : { memory }),
      };
}

/** The open tab that shows the same thing (`tab.same-target`), when there is one. */
export function sameTab(state: AppState, shows: TabShows): Tab | undefined {
  const key = targetKey(shows, state.app.platform);
  return state.tabs.tabs.find((tab) => targetKey(tab.shows, state.app.platform) === key);
}

/** A playground never saved with no title yet is given **Playground** and the lowest number free in its group. */
function titled(state: AppState, shows: TabShows): TabShows {
  if (shows.kind !== 'playground' || shows.file !== undefined || shows.title !== '') {
    return shows;
  }
  const siblings = state.tabs.tabs
    .filter((tab) => connectionOfShows(tab.shows) === shows.connection)
    .map((tab) => tab.shows);
  return { ...shows, title: newPlaygroundTitle(siblings) };
}

/** The arguments of an app step, as JSON. */
function json(value: object): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

/** What follows: connecting the connection of a tab opened and shown, when it is not connected. */
function connecting(state: AppState, request: OpenRequest): readonly After[] {
  const connection = connectionOfShows(request.shows);
  if (
    connection === undefined ||
    request.background ||
    connectionState(state.connections, connection) !== 'not-connected'
  ) {
    return [];
  }
  return [{ kind: 'start', feature: featureId('connection.connect'), target: { kind: 'connection', connection } }];
}

/** The plan for a request: make the tab that shows it active, or open a new one. */
export function planOf(state: AppState, request: OpenRequest): Outcome {
  const connection = connectionOfShows(request.shows);
  if (connection !== undefined && !isSaved(state, connection)) {
    return refuse('tab.open/no-connection', text.refusals.noConnection);
  }
  const shows = titled(state, request.shows);
  const open = sameTab(state, shows);
  const given = {
    ...(request.section === undefined ? {} : { section: request.section }),
    ...(request.memory === undefined ? {} : { memory: request.memory }),
  };
  if (open !== undefined) {
    const step = appStep(
      text.steps.activate(stepName(state, open.shows)),
      'tab.activate',
      json({ tab: open.id, ...given }),
    );
    return run(appPlan(text.plans.open, [step]));
  }
  const step = appStep(
    text.steps.open(stepName(state, shows)),
    'tab.open',
    json({ shows, background: request.background, ...given }),
  );
  return run(appPlan(text.plans.open, [step], connecting(state, request)));
}

/** Opens what `args.shows` names, or makes its tab active. */
export function plan(context: Context, answers: Answers): Outcome {
  const request = openRequest(answers);
  if (request === undefined) {
    throw new Error('tab.open needs what to show.');
  }
  return planOf(context.state, request);
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('tab.open'), plan };
