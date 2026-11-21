/**
 * Feature: gridfs.upload
 *
 * Stores files from the disk in a bucket. The files are chosen in the system's dialog titled *Upload files to Local ›
 * shop › fs*; `gridfs.upload:existing` reads which of their names the bucket has, and whether it is empty; only when
 * some names exist is it asked what to do with them: **Add a new revision**, **Replace** or **Skip**. With
 * **Replace**, `gridfs.upload:replaced` reads the files to delete once the new ones are in place (D50).
 *
 * The plan has, before the first chunk of an empty bucket, the driver's two indexes; then for each file, in the order
 * chosen and as one group (D31): its chunks of 261,120 bytes, written from the disk by the app step
 * `gridfs.write-chunks`; its files document, `db.fs.files.insertOne({ _id, length, chunkSize, uploadDate, filename,
 * metadata: { contentType } })`; and with **Replace** the deletes of the files of that name. It is confirmed only
 * with **Replace**. Started with `{ connection, database, bucket, from }`, `from: "page"` from the page's toolbar,
 * whose notification then has no **Open**. Ported from Mongoster's `uploadFiles` and `counter`.
 */
import type { Json } from '../../shared/engine-request';
import {
  ask,
  needRead,
  run,
  type After,
  type Answers,
  type Context,
  type Danger,
  type NotificationAction,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { sizeText } from './size-text';
import { text } from './text';
import {
  bucketArgs,
  bucketPlace,
  bucketTarget,
  refusedReadOnly,
  startArgs,
  whereText,
  type BucketPlace,
} from './types';
import { chooseReadId, chosenFiles, type ChosenFile } from './write/file';
import { notifySuccess, refreshAfter, writePlan } from './write/plan';
import {
  checkStep,
  existingOf,
  existingReadId,
  fileSteps,
  indexSteps,
  replacedAnswered,
  replacedReadId,
  type Replaced,
} from './write/upload';

/** What to do with the names the bucket already has. */
export type ExistingChoice = 'revision' | 'replace' | 'skip';

/** The question of the names that exist, under `a.png, b.png, c.png and 2 more already in Local › shop › fs`. */
export function existingQuestion(names: readonly string[], where: string): Outcome {
  return ask({
    title: text.upload.existingTitle(names, where),
    button: text.upload.button,
    fields: [
      {
        kind: 'pick-one',
        key: 'existing-choice',
        label: text.upload.existing,
        choices: [
          { value: 'revision', label: text.upload.revision, description: text.upload.revisionNote },
          { value: 'replace', label: text.upload.replace, description: text.upload.replaceNote },
          { value: 'skip', label: text.upload.skip, description: text.upload.skipNote },
        ],
        default: 'revision',
      },
    ],
  });
}

function choiceOf(value: unknown): ExistingChoice {
  return value === 'replace' || value === 'skip' ? value : 'revision';
}

/** The text of the notification: *Uploaded 2 files (4.5 MB) to Local › shop › fs, skipped 1 that already existed.* */
export function uploadedText(
  uploaded: readonly ChosenFile[],
  where: string,
  more: { readonly skipped: number; readonly cancelled: boolean },
): string {
  const bytes = uploaded.reduce((sum, file) => sum + file.size, 0);
  return text.upload.uploaded(uploaded.length, sizeText(bytes), where, more);
}

/** The status line while a file is sent: `logo.png (1 of 3) · 1.2 MB of 4.5 MB`. */
export function progressText(files: readonly ChosenFile[], index: number, doneBytes: number): string {
  const total = files.reduce((sum, file) => sum + file.size, 0);
  const file = files[index];
  return text.upload.progress({
    name: file?.name ?? '',
    index: index + 1,
    count: files.length,
    done: sizeText(doneBytes),
    total: sizeText(total),
  });
}

/** **Open**, which opens the page of the bucket, when the upload was not started from it. */
function openAction(place: BucketPlace, args: Readonly<Record<string, Json>>): readonly NotificationAction[] {
  return args['from'] === 'page'
    ? []
    : [
        {
          label: text.upload.open,
          element: 'gridfs.show@notification',
          feature: featureId('gridfs.show'),
          target: bucketTarget(place),
          args: bucketArgs(place),
        },
      ];
}

/** The reads and the question before the plan, or what they answered. */
type Gathered =
  | { readonly kind: 'outcome'; readonly outcome: Outcome }
  | {
      readonly kind: 'gathered';
      readonly files: readonly ChosenFile[];
      readonly existing: readonly string[];
      readonly empty: boolean;
      readonly choice: ExistingChoice;
      readonly replaced: readonly Replaced[];
    };

function gathered(place: BucketPlace, answers: Answers, files: readonly ChosenFile[]): Gathered {
  const names = [...new Set(files.map((file) => file.name))];
  if (!('existing' in answers)) {
    return { kind: 'outcome', outcome: needRead('existing', existingReadId, { ...bucketArgs(place), names }) };
  }
  const read = existingOf(answers['existing']);
  const existing = names.filter((name) => read.names.includes(name));
  if (existing.length > 0 && answers['existing-choice'] === undefined) {
    return { kind: 'outcome', outcome: existingQuestion(existing, whereText(place)) };
  }
  const choice = existing.length === 0 ? 'revision' : choiceOf(answers['existing-choice']);
  if (choice === 'replace' && !('replaced' in answers)) {
    return {
      kind: 'outcome',
      outcome: needRead('replaced', replacedReadId, { ...bucketArgs(place), names: existing }),
    };
  }
  const replaced = choice === 'replace' ? replacedAnswered(answers['replaced']) : [];
  return { kind: 'gathered', files, existing, empty: read.empty, choice, replaced };
}

/** Feature: gridfs.upload — the files, the names that exist and what to do with them, then the plan. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = bucketPlace(context, answers);
  const readOnly = refusedReadOnly(place, 'gridfs.upload/read-only');
  if (readOnly !== undefined) {
    return readOnly;
  }
  const where = whereText(place);
  if (!('files' in answers)) {
    return needRead('files', chooseReadId, {
      mode: 'open',
      title: text.upload.dialog(where),
      button: text.upload.button,
      many: true,
    });
  }
  const files = chosenFiles(answers['files']) ?? [];
  if (files.length === 0) {
    return run(
      writePlan({
        title: text.upload.plan(where),
        steps: [],
        danger: { kind: 'none' },
        cannotUndo: text.upload.undo,
        after: [],
      }),
    );
  }
  const before = gathered(place, answers, files);
  return before.kind === 'outcome' ? before.outcome : uploadPlan(context, place, before, startArgs(answers));
}

function uploadPlan(
  context: Context,
  place: BucketPlace,
  before: Extract<Gathered, { kind: 'gathered' }>,
  args: Readonly<Record<string, Json>>,
): Outcome {
  const where = whereText(place);
  const sent =
    before.choice === 'skip' ? before.files.filter((file) => !before.existing.includes(file.name)) : before.files;
  const replacing = before.choice === 'replace' ? sent.filter((file) => before.existing.includes(file.name)) : [];
  const skipped = before.files.length - sent.length;
  const steps = [
    ...(sent.length > 0 ? [checkStep(sent)] : []),
    ...(before.empty && sent.length > 0 ? indexSteps(place) : []),
    ...sent.flatMap((file, index) =>
      fileSteps(
        place,
        {
          where,
          files: sent,
          index,
          skipped,
          replaced: before.replaced.filter((old) => replacing.includes(file) && old.filename === file.name),
        },
        context.now,
      ),
    ),
  ];
  const danger: Danger =
    replacing.length === 0
      ? { kind: 'none' }
      : {
          kind: 'confirm',
          text: `${text.upload.replaceQuestion(replacing.length, where)}\n${text.upload.replaceDetail}`,
          button: text.upload.replace,
        };
  const done: After = notifySuccess(uploadedText(sent, where, { skipped, cancelled: false }), openAction(place, args));
  return run(
    writePlan({
      title: text.upload.plan(where),
      steps,
      danger,
      cannotUndo: text.upload.undo,
      after: [done, refreshAfter(place)],
    }),
  );
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('gridfs.upload'), plan };
