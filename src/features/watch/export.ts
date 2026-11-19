/**
 * Feature: watch.export
 *
 * Writes the change events of the list to a file of JSON Lines in UTF-8, one change event as the server sent it on
 * each line, as canonical Extended JSON so that every BSON type survives, oldest first (Datardo's choice). It asks
 * which ones, **The `<shown>` shown** or **All `<n>`**, only when the toggles or the search hide some; then the file,
 * in the system's dialog for saving. The text is made when the plan is: a change event arriving during the export is
 * not in the file. The change events a pause holds are not in the list and are not written.
 *
 * Started on the page's tab, with `{ offsetMinutes }`: the time zone of the name the dialog proposes.
 */
import type { Json } from '../../shared/engine-request';
import {
  ask,
  needRead,
  noDanger,
  refuse,
  run,
  type Answers,
  type Context,
  type FileStep,
  type Outcome,
  type ReadFeature,
} from '../../shared/feature';
import { connectionId, featureId } from '../../shared/ids';
import { savedConnection } from '../../shared/state/connections';
import { numberOf, objectOf } from '../history/types';
import { stepText } from '../runner/step-text';
import { shownOldestFirst } from './copy-events';
import { contextPage, type WatchPage } from './page/state';
import { exportText } from './text';
import type { WatchEvent } from './types';

/** The identifier of the read of the file's place, with the system's file dialog. */
export const fileReadId = 'watch.export:file';

const two = (value: number): string => String(value).padStart(2, '0');

/** `20261118-101500`: the time in the time zone `offsetMinutes` east of UTC. */
export function fileTime(milliseconds: number, offsetMinutes: number): string {
  const date = new Date(milliseconds + offsetMinutes * 60_000);
  const day = `${String(date.getUTCFullYear())}${two(date.getUTCMonth() + 1)}${two(date.getUTCDate())}`;
  return `${day}-${two(date.getUTCHours())}${two(date.getUTCMinutes())}${two(date.getUTCSeconds())}`;
}

/** A name as a part of a file name: the characters a file name cannot hold, and spaces, as `-`. */
export function fileNamePart(name: string): string {
  const part = name.replace(/[\s<>:"/\\|?*]+/gu, '-').replace(/^-+|-+$/gu, '');
  return part === '' ? 'deployment' : part;
}

/** The name the dialog proposes: `watch-<collection, database or connection>-<yyyyMMdd-HHmmss>.jsonl`. */
export function exportFileName(watchedName: string, now: number, offsetMinutes: number): string {
  return `watch-${fileNamePart(watchedName)}-${fileTime(now, offsetMinutes)}.jsonl`;
}

/** The text of the file: one change event on each line, as canonical Extended JSON, oldest first. */
export function jsonLines(events: readonly WatchEvent[]): string {
  return events.map((event) => `${JSON.stringify(event.event)}\n`).join('');
}

function whichQuestion(shown: number, all: number): Outcome {
  return ask({
    title: exportText.title,
    button: exportText.button,
    fields: [
      {
        kind: 'pick-one',
        key: 'which',
        label: exportText.which,
        choices: [
          { value: 'shown', label: exportText.shown(shown) },
          { value: 'all', label: exportText.all(all) },
        ],
        default: 'shown',
      },
    ],
  });
}

/** The file step: `write C:\exports\watch-orders-20261118-101500.jsonl`, its writer given the text. */
export function exportStep(path: string, events: readonly WatchEvent[]): FileStep {
  const step = {
    kind: 'file' as const,
    action: 'write' as const,
    path,
    content: { writer: 'watch.export', args: { text: jsonLines(events) } },
  };
  return { ...step, text: stepText(step) };
}

function watchedName(context: Context, page: WatchPage): string {
  const { watched } = page;
  const connection = savedConnection(context.state.connections, connectionId(watched.connection))?.name;
  return watched.collection ?? watched.database ?? connection ?? watched.connection;
}

/** Feature: watch.export — which ones when some are hidden, the file, then `write <file>`. */
export function plan(context: Context, answers: Answers): Outcome {
  const page = contextPage(context)?.page;
  if (page === undefined || page.events.length === 0) {
    return refuse('watch.export/nothing-to-export', exportText.nothing);
  }
  const shown = shownOldestFirst(page);
  if (shown.length < page.events.length && answers['which'] === undefined) {
    return whichQuestion(shown.length, page.events.length);
  }
  const events = shown.length < page.events.length && answers['which'] === 'shown' ? shown : page.events;
  const file = answers['file'];
  if (file === undefined) {
    const offset = numberOf(objectOf(answers['args'] as Json | undefined)['offsetMinutes']) ?? 0;
    return needRead('file', fileReadId, {
      mode: 'save',
      name: exportFileName(watchedName(context, page), context.now, offset),
    });
  }
  return run({
    title: exportText.title,
    steps: typeof file === 'string' ? [exportStep(file, events)] : [],
    danger: noDanger,
    undo: { cannot: exportText.cannotUndo },
    publishes: false,
    after:
      typeof file === 'string'
        ? [{ kind: 'notify', level: 'success', text: exportText.done(events.length, file) }]
        : [],
  });
}

/** `watch.export:file`: the system's save dialog, an app read that answers the path, or null when it was closed. */
export const fileRead: ReadFeature = {
  kind: 'read',
  id: featureId(fileReadId),
  request: (_context: Context, args: Json) => ({ kind: 'app', action: 'watch.choose-file', args }),
  parse: (replies) => (typeof replies[0] === 'string' ? replies[0] : null),
};
