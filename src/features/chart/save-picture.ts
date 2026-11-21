/**
 * Feature: chart.save-picture
 *
 * Writes the chart as it is drawn to a PNG file the user chooses. The picture is made by the window, which draws the
 * chart, and given as the arguments of the intent; the plan asks where with the system's save dialog (the app read
 * `chart.save-picture:file`, which answers the path, or null when the dialog was closed), then writes it. Nothing is
 * sent to the server.
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
  type Plan,
  type ReadFeature,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { startArgs } from '../nav/types';
import { text } from './text';
import { chartTypes, type ChartType } from './types';

/** The writer of the main process that writes a picture given as base64 (`FileStep.content`). */
export const pictureWriter = 'chart.picture';

/** The identifier of the read of the file's place, with the system's save dialog. */
export const fileReadId = 'chart.save-picture:file';

/** The app action of the main process that shows the system's save dialog and answers the path chosen. */
export const chooseFileAction = 'chart.choose-file';

/** What **Save picture…** is started with: the collection of the tab, the type drawn, and the picture as base64. */
export interface PictureArgs {
  readonly collection: string;
  readonly type: ChartType;
  readonly picture: string;
}

/**
 * The name the dialog proposes: the collection and the type, `orders-bar.png`; each run of the characters
 * `\ / : * ? " < > |` of the collection's name is written `_`.
 */
export function pictureName(collection: string, type: ChartType): string {
  return `${collection.replace(/[\\/:*?"<>|]+/gu, '_')}-${text.typeWord[type]}.png`;
}

/** What the save dialog is asked with: its title **Save chart**, the name it proposes, the kind *PNG image*. */
export function dialogArgs(args: PictureArgs): Json {
  return {
    title: text.picture.title,
    name: pictureName(args.collection, args.type),
    kind: text.picture.kind,
    extensions: ['png'],
  };
}

function pictureArgs(answers: Answers): PictureArgs | undefined {
  const args = startArgs(answers);
  const { collection, type, picture } = args;
  const known = chartTypes.find((each) => each === type);
  return typeof collection === 'string' && typeof picture === 'string' && known !== undefined
    ? { collection, type: known, picture }
    : undefined;
}

function nothing(): Plan {
  return {
    title: text.picture.plan,
    steps: [],
    danger: noDanger,
    undo: { cannot: text.picture.cannotUndo },
    publishes: false,
    after: [],
  };
}

/** Feature: chart.save-picture — asks for the file, then writes the picture to it; nothing when the dialog is closed. */
export function plan(_context: Context, answers: Answers): Outcome {
  const args = pictureArgs(answers);
  if (args === undefined) {
    throw new Error('chart.save-picture needs { collection, type, picture } from the Chart section.');
  }
  if (!('file' in answers)) {
    return needRead('file', fileReadId, dialogArgs(args));
  }
  const file = answers['file'];
  if (typeof file !== 'string' || file.trim() === '') {
    return run(nothing());
  }
  return run({
    ...nothing(),
    steps: [
      {
        kind: 'file',
        text: `write ${file}`,
        action: 'write',
        path: file,
        content: { writer: pictureWriter, args: { picture: args.picture } },
      },
    ],
    after: [{ kind: 'notify', level: 'success', text: text.picture.saved(file) }],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('chart.save-picture'), plan };

/** `chart.save-picture:file`: the system's save dialog, an app read that answers the path, or null when closed. */
export const fileRead: ReadFeature = {
  kind: 'read',
  id: featureId(fileReadId),
  request: (_context: Context, args: Json) => ({ kind: 'app', action: chooseFileAction, args }),
  parse: (replies) => (typeof replies[0] === 'string' ? replies[0] : null),
};
