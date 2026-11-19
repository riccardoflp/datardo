/**
 * Feature: chart.save-picture
 *
 * Writes the chart as it is drawn to a PNG file the user chooses. The picture is made by the window, which draws the
 * chart, and given as the arguments of the intent; the plan writes it, and nothing is sent to the server.
 */
import {
  ask,
  noDanger,
  run,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { Question } from '../../shared/question';
import { startArgs } from '../nav/types';
import { text } from './text';
import { chartTypes, type ChartType } from './types';

/** The writer of the main process that writes a picture given as base64 (`FileStep.content`). */
export const pictureWriter = 'chart.picture';

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

/** The question of the file: the dialog titled **Save chart**, for files of the kind *PNG image*, with the name. */
export function fileQuestion(args: PictureArgs): Question {
  return {
    title: text.picture.title,
    button: text.picture.button,
    fields: [{ kind: 'text', key: 'file', label: text.picture.kind, default: pictureName(args.collection, args.type) }],
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

/** Feature: chart.save-picture — asks for the file, then writes the picture to it. */
export function plan(_context: Context, answers: Answers): Outcome {
  const args = pictureArgs(answers);
  if (args === undefined) {
    throw new Error('chart.save-picture needs { collection, type, picture } from the Chart section.');
  }
  const file = answers['file'];
  if (typeof file !== 'string' || file.trim() === '') {
    return ask(fileQuestion(args));
  }
  return run({
    title: text.picture.plan,
    steps: [
      {
        kind: 'file',
        text: `write ${file}`,
        action: 'write',
        path: file,
        content: { writer: pictureWriter, args: { picture: args.picture } },
      },
    ],
    danger: noDanger,
    undo: { cannot: text.picture.cannotUndo },
    publishes: false,
    after: [{ kind: 'notify', level: 'success', text: text.picture.saved(file) }],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('chart.save-picture'), plan };
