/**
 * Feature: palette.open-result
 *
 * Opens what is selected in Go to's list. It has no plan of its own: it plans what the feature of the row plans, with
 * what the row names: `tab.activate` for an open tab, `tab.open` for what a tab shows (a collection, a view, a bucket, a
 * key, a page, a recent place), `nav.switch-connection` for a connection, `palette.run-command` for a command. Opened
 * in the background (`Ctrl+Enter`, a click with `Ctrl` or with the middle button), a row that opens a tab leaves the
 * active tab active and Go to open.
 */
import type { Json } from '../../shared/engine-request';
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { connectionId, featureId, tabId } from '../../shared/ids';
import type { CommandId } from '../command';
import { readTabShows } from '../tab/types';
import { plan as activate } from '../tab/activate';
import { planOf as openTab } from '../tab/open';
import { plan as switchConnection } from '../nav/switch-connection';
import { appPlan, startArgs } from '../nav/types';
import { plan as runCommand } from './run-command';
import { text } from './text';
import type { OpenTarget } from './types';

/** How a row is opened: `Enter` or a click; or `Ctrl+Enter`, a click with `Ctrl` or with the middle button. */
export type Opening = 'foreground' | 'background';

/** Whether opening a row leaves Go to open: only a row that opens a tab, opened in the background. */
export function staysOpen(opens: OpenTarget, opening: Opening): boolean {
  return opening === 'background' && opens.kind === 'show';
}

/** The arguments to start this feature with, for a row. */
export function openArgs(opens: OpenTarget, opening: Opening): Json {
  return JSON.parse(JSON.stringify({ opens, background: opening === 'background' })) as Json;
}

function readTarget(value: unknown): OpenTarget | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const object = value as Readonly<Record<string, unknown>>;
  switch (object['kind']) {
    case 'tab':
      return typeof object['tab'] === 'string' ? { kind: 'tab', tab: tabId(object['tab']) } : undefined;
    case 'show': {
      const shows = readTabShows(object['shows']);
      const section = object['section'];
      return shows === undefined
        ? undefined
        : { kind: 'show', shows, ...(typeof section === 'string' ? { section } : {}) };
    }
    case 'connection':
    case 'command':
      return readNamed(object);
    default:
      return undefined;
  }
}

function readNamed(object: Readonly<Record<string, unknown>>): OpenTarget | undefined {
  const connection = object['connection'];
  const command = object['command'];
  if (object['kind'] === 'connection') {
    return typeof connection === 'string' ? { kind: 'connection', connection: connectionId(connection) } : undefined;
  }
  return typeof command === 'string' ? { kind: 'command', command: command as CommandId } : undefined;
}

/** Opens the row `args.opens`, in the background when `args.background`: what the feature of the row plans. */
export function plan(context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  const opens = readTarget(args['opens']);
  const background = args['background'] === true;
  if (opens === undefined) {
    return run(appPlan(text.plans.openResult, []));
  }
  const given = (more: Json): Answers => ({ ...answers, args: more });
  switch (opens.kind) {
    case 'tab':
      return activate(context, given({ tab: opens.tab }));
    case 'show':
      return openTab(context.state, {
        shows: opens.shows,
        background,
        ...(opens.section === undefined ? {} : { section: opens.section }),
      });
    case 'connection':
      return switchConnection(context, given({ connection: opens.connection }));
    case 'command':
      return runCommand(context, given({ command: opens.command }));
  }
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('palette.open-result'), plan };
