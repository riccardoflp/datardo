/**
 * Feature: relation.export-svg
 *
 * Saves the diagram as a picture, with the boxes where they are on the page. Started from the page with
 * `{ connection, database, graph, boxes, keysOnly }`; asks where to save with the system's dialog (the app read
 * `relation.export-svg:file`, which answers the path, or null when the dialog was closed), then writes the file.
 * **Reveal** in the notification starts the feature again with `{ reveal: <path> }`, which shows the file in its
 * folder: a browser would run the scripts an SVG may hold, and the diagram's text comes from the database (T24). The
 * main process shows only the file this feature wrote in this session.
 */
import type { Json } from '../../shared/engine-request';
import {
  needRead,
  noDanger,
  run,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
  type ReadFeature,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { appPlan, appStep, startArgs } from '../nav/types';
import { boxesArg, graphArg, requiredStart } from './model/args';
import { diagramSvg } from './svg/picture';
import { text } from './text';

/** The identifier of the read of the file's place, with the system's save dialog. */
export const fileReadId = 'relation.export-svg:file';

/** The app action of the main process that shows the system's save dialog and answers the path chosen. */
export const chooseFileAction = 'relation.choose-file';

/** The app action that shows a file this feature wrote in its folder, in the system's file manager. */
export const revealFileAction = 'relation.reveal-file';

/** The writer of the main process that writes the text given (`FileStep.content`). */
export const svgWriter = 'relation.svg';

/** What the save dialog is asked with: its title, the name it proposes in the home folder, the type of file. */
export function dialogArgs(database: string): Json {
  return {
    mode: 'save',
    title: text.svg.dialog,
    name: text.svg.name(database),
    folder: 'home',
    kind: text.svg.kind,
    extensions: ['svg'],
  };
}

function revealPlan(path: string): Outcome {
  return run(appPlan(text.svg.revealTitle, [appStep(text.svg.revealStep(path), revealFileAction, { path })]));
}

function savePlan(database: string, path: string, svg: string): Outcome {
  return run({
    title: text.svg.title,
    steps: [
      {
        kind: 'file',
        text: `write ${path}`,
        action: 'write',
        path,
        content: { writer: svgWriter, args: { text: svg } },
      },
    ],
    danger: noDanger,
    undo: { cannot: text.svg.nothingWritten },
    publishes: false,
    after: [
      {
        kind: 'notify',
        level: 'success',
        text: text.svg.saved(database, path),
        actions: [
          {
            label: text.svg.reveal,
            feature: featureId('relation.export-svg'),
            target: { kind: 'app' },
            args: { reveal: path },
          },
        ],
      },
    ],
  });
}

/** Feature: relation.export-svg — asks where, then `write C:\Users\ada\shop-diagram.svg`; nothing when closed. */
export function plan(context: Context, answers: Answers): Outcome {
  const revealed = startArgs(answers)['reveal'];
  if (typeof revealed === 'string') {
    return revealPlan(revealed);
  }
  const { args, place } = requiredStart(context, answers);
  const graph = graphArg(args);
  const boxes = boxesArg(args);
  if (graph === undefined || boxes === undefined || graph.collections.length === 0) {
    return run(appPlan(text.svg.title, []));
  }
  if (!('file' in answers)) {
    return needRead('file', fileReadId, dialogArgs(place.database));
  }
  const file = answers['file'];
  if (typeof file !== 'string' || file === '') {
    return run(appPlan(text.svg.title, []));
  }
  return savePlan(place.database, file, diagramSvg(graph, boxes, args['keysOnly'] === true));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('relation.export-svg'), plan };

/** `relation.export-svg:file`: the system's save dialog, an app read that answers the path, or null when closed. */
export const fileRead: ReadFeature = {
  kind: 'read',
  id: featureId(fileReadId),
  request: (_context: Context, args: Json) => ({ kind: 'app', action: chooseFileAction, args }),
  parse: (replies) => (typeof replies[0] === 'string' ? replies[0] : null),
};
