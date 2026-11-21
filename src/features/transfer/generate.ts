/**
 * Feature: transfer.generate
 *
 * Inserts fake documents that look like a collection's, into it or into another collection on any MongoDB
 * connection. The documents are those of `transfer.generate-values`, made batch by batch while the plan runs from a
 * feed (`DocumentsFeed` of kind `generated`): the same analysis, seed and time give the same documents, so the three
 * the confirmation shows are the first three inserted.
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import type { Answers, Context, Outcome, Plan, ReadFeature, ReadRequest } from '../../shared/feature';
import { ask, needRead, refuse, run } from '../../shared/feature';
import { connectionId, featureId } from '../../shared/ids';
import { mongoshValue } from '../../shared/mongosh-value';
import { savedConnection } from '../../shared/state/connections';
import { characters, cutUnits } from '../../shared/text-units';
import { nothingToDo } from '../task/types';
import { failureOf, isObject, numberOf, textArg } from '../tree/types';
import { askDestination, type Destination } from './ask/destination';
import { isSchemaSummary, type SchemaSummary } from './generate/analysis';
import { analyzeSample } from './generate/sample';
import { generateDocuments, type GenerateOptions } from './generate-values';
import { counted, destinationText, generateText as text } from './text';
import { answerText, fedStep, insertUndo, isPlainObject, type JsonDocument, type Namespace } from './types';

/** The documents a sample analyzes (the card's `$sample`). */
export const sampleSize = 1000;

/** How long the sample may take, in milliseconds (the card's `maxTimeMS`). */
export const sampleTimeLimitMs = 120_000;

/** The most documents generated at once. */
export const mostGenerated = 1_000_000;

/** The documents the confirmation shows, and the characters each is cut at. */
const shownExamples = 3;
const longestExample = 400;

/** The number typed: a whole number from 1 to 1,000,000; spaces, `,`, `_` and `'` between digits are accepted. */
export function parseCount(typed: string): number | undefined {
  const digits = typed.trim();
  if (!/^\d+(?:[\s,_']\d+)*$/u.test(digits)) {
    return undefined;
  }
  const count = Number(digits.replace(/[\s,_']/gu, ''));
  return count >= 1 && count <= mostGenerated ? count : undefined;
}

/** What is imitated: the analysis shown in the Schema section with its filter, or that of a sample read now. */
function analysisOf(answers: Answers, on: Namespace): Outcome | { analysis: SchemaSummary; filter: string } {
  const args = answers['args'];
  if (isPlainObject(args) && isSchemaSummary(args['analysis'])) {
    const filter = typeof args['filter'] === 'string' ? args['filter'] : '';
    return args['analysis'].sampled === 0
      ? refuse('transfer.generate/nothing-to-imitate', text.nothingMatches)
      : { analysis: args['analysis'], filter };
  }
  const sample = answers['sample'];
  if (!isSchemaSummary(sample)) {
    return needRead('sample', 'transfer.generate:sample', { ...on });
  }
  return sample.sampled === 0
    ? refuse('transfer.generate/nothing-to-imitate', text.nothingInCollection(`${on.database}.${on.collection}`))
    : { analysis: sample, filter: '' };
}

/** How many: asked, `100` proposed. */
function countOf(answers: Answers, analyzed: number, title: (step: string) => string): Outcome | number {
  const count = parseCount(answerText(answers['how-many']));
  if (count !== undefined) {
    return count;
  }
  const step = title(text.howManyStep);
  const rules = [
    { kind: 'pattern' as const, pattern: "^\\s*[1-9]\\d{0,6}(?:[\\s,_']\\d{3})*\\s*$", message: text.wholeNumber },
  ];
  return ask({
    title: step,
    text: text.howManyPrompt(analyzed),
    button: destinationText.next,
    fields: [{ kind: 'text', key: 'how-many', label: step, default: '100', rules }],
  });
}

/** Whether the source can be written to: not a view, not on a read-only connection. */
function writable(answers: Answers, readOnly: boolean, source: Namespace): Outcome | boolean {
  if (readOnly) {
    return false;
  }
  const contents = answers['contents'];
  if (!isObject(contents)) {
    return needRead('contents', 'tree.list-collections', { connection: source.connection, database: source.database });
  }
  const entries: unknown = contents['entries'];
  const isView = (entry: unknown): boolean =>
    isObject(entry) && entry['name'] === source.collection && entry['kind'] === 'view';
  return !(Array.isArray(entries) && entries.some(isView));
}

/** The destination: this collection, or another one asked as a copy asks it. */
function destinationOf(
  context: Context,
  source: Namespace,
  answers: Answers,
  title: (step: string) => string,
): Outcome | Destination {
  const connection = savedConnection(context.state.connections, source.connection);
  const own = writable(answers, connection?.readOnly !== false, source);
  if (typeof own !== 'boolean') {
    return own;
  }
  const where = answers['where'];
  if (own && where !== 'this' && where !== 'another') {
    const step = title(text.destinationStep);
    const choices = [
      { value: 'this', label: text.thisCollection },
      { value: 'another', label: text.anotherCollection, description: text.anotherDescription },
    ];
    return ask({
      title: step,
      button: destinationText.next,
      fields: [{ kind: 'pick-one', key: 'where', label: step, choices }],
    });
  }
  if (own && where === 'this' && connection !== undefined) {
    return { ...source, view: connection, exists: true, sameConnection: true };
  }
  return askDestination(
    context,
    source,
    {
      title,
      where: text.where,
      collectionPrompt: text.collectionPrompt,
      sameDatabaseName: `${source.collection}_generated`,
      viewName: text.viewName,
      readOnly: (name) => refuse('transfer.generate/read-only', text.readOnly(name)),
      notConnected: (message) => refuse('transfer.generate/not-connected', message),
    },
    answers,
  );
}

/** The seed: asked once, optional; without one, the one the runner drew, else the time. */
function seedOf(
  context: Context,
  answers: Answers,
  title: (step: string) => string,
): Outcome | { typed: string; seed: string } {
  const typed = answers['seed'];
  if (typeof typed !== 'string') {
    const step = title(text.seedStep);
    return ask({
      title: step,
      text: text.seedPrompt,
      button: destinationText.next,
      fields: [{ kind: 'text', key: 'seed', label: step, placeholder: text.seedExample }],
    });
  }
  const drawn = answers['drawnSeed'];
  return {
    typed: typed.trim(),
    seed: typed.trim() !== '' ? typed.trim() : typeof drawn === 'string' ? drawn : String(context.now),
  };
}

/** Whether the `_id`s generated count up: an `_id` analyzed as `int` or `long` first. */
function countsUp(analysis: SchemaSummary): boolean {
  const type = analysis.fields.find((field) => field.name === '_id')?.types[0]?.type;
  return type === 'int' || type === 'long';
}

function examplesText(analysis: SchemaSummary, options: GenerateOptions, count: number): string {
  return generateDocuments(analysis, Math.min(count, shownExamples), options)
    .map((document) => {
      const cut = cutUnits(characters(mongoshValue(document)), longestExample);
      return `${cut.text}${cut.more === '' ? '' : '…'}`;
    })
    .join('\n');
}

interface Generation {
  readonly source: Namespace & { readonly name: string };
  readonly to: Destination;
  readonly analysis: SchemaSummary;
  readonly filter: string;
  readonly count: number;
  readonly seed: { readonly typed: string; readonly seed: string };
  readonly nextId: number | undefined;
}

function generatePlan(context: Context, how: Generation): Plan {
  const { to, analysis, count } = how;
  const destination =
    to.sameConnection && to.database === how.source.database && to.collection === how.source.collection
      ? `${to.database}.${to.collection}`
      : `${to.view.name} › ${to.database}.${to.collection}`;
  const options: GenerateOptions = {
    seed: how.seed.seed,
    now: context.now,
    ...(how.nextId === undefined ? {} : { nextId: how.nextId }),
  };
  const from = `${how.source.name} › ${how.source.database}.${how.source.collection}`;
  const lines = [
    text.confirm(count, destination),
    text.lookLike(text.analyzed(analysis.sampled, from, how.filter, how.seed.typed)),
    examplesText(analysis, options, count),
    ...(to.view.publishesTo === undefined ? [] : [text.notPublished]),
  ];
  const title = text.undoTitle(count, `${how.source.database}.${how.source.collection}`);
  const feed = { kind: 'generated', analysis: analysis as unknown as Json, options: { ...options }, count } as const;
  return {
    title,
    steps: [
      fedStep(
        to,
        { method: 'insertMany', options: { ordered: false }, from: 'generated documents', feed },
        context.target,
        { title: text.progressTitle(destination), total: count, unit: 'documents' },
      ),
    ],
    danger: { kind: 'confirm', text: lines.join('\n'), button: text.button },
    touches: counted(count, 'document'),
    undo: insertUndo(context, to.view, count, {
      connection: to.connection,
      database: to.database,
      collection: to.collection,
      title,
    }),
    publishes: false,
    after: [{ kind: 'refresh', connection: to.connection }],
  };
}

/** Feature: transfer.generate — on a collection or view: the analysis, how many, where, the seed; then the inserts. */
export function plan(context: Context, answers: Answers): Outcome {
  const target = context.target;
  const connection = 'connection' in target ? savedConnection(context.state.connections, target.connection) : undefined;
  if (target.kind !== 'collection' || connection === undefined) {
    return nothingToDo(text.command, '');
  }
  const source = { connection: target.connection, database: target.database, collection: target.collection };
  const title = (step: string): string => text.title(`${source.database}.${source.collection}`, step);
  const analyzed = analysisOf(answers, source);
  if ('kind' in analyzed) {
    return analyzed;
  }
  const count = countOf(answers, analyzed.analysis.sampled, title);
  if (typeof count !== 'number') {
    return count;
  }
  const to = destinationOf(context, source, answers, title);
  if ('kind' in to) {
    return to;
  }
  const seed = seedOf(context, answers, title);
  if ('kind' in seed) {
    return seed;
  }
  const largest = answers['largest-id'];
  if (countsUp(analyzed.analysis) && to.exists && largest === undefined) {
    return needRead('largest-id', 'transfer.generate:largest-id', {
      connection: to.connection,
      database: to.database,
      collection: to.collection,
    });
  }
  const nextId = typeof largest === 'number' ? Math.floor(largest) + 1 : undefined;
  return run(
    generatePlan(context, { source: { ...source, name: connection.name }, to, ...analyzed, count, seed, nextId }),
  );
}

function onCollection(args: Json, method: string, call: readonly Json[], limit: number): MongoRequest {
  return {
    engine: 'mongodb',
    database: textArg(args, 'database'),
    collection: textArg(args, 'collection'),
    method,
    arguments: call,
    limit,
    timeLimitMs: sampleTimeLimitMs,
  };
}

/** `transfer.generate:sample`: `aggregate([{ $sample: { size: 1000 } }])`, analyzed. */
export const sampleRead: ReadFeature = {
  kind: 'read',
  id: featureId('transfer.generate:sample'),
  request: (_context: Context, args: Json): ReadRequest => {
    const stages = [{ $sample: { size: { $numberInt: String(sampleSize) } } }];
    const request = onCollection(
      args,
      'aggregate',
      [stages, { allowDiskUse: true, maxTimeMS: { $numberInt: String(sampleTimeLimitMs) } }],
      sampleSize,
    );
    return { kind: 'engine', requests: [{ connection: connectionId(textArg(args, 'connection')), request }] };
  },
  parse: (replies: readonly unknown[], args: Json): SchemaSummary => {
    const [reply] = replies;
    const failure = failureOf(reply);
    if (failure !== undefined) {
      throw new Error(text.couldNotAnalyze(`${textArg(args, 'database')}.${textArg(args, 'collection')}`, failure));
    }
    const documents = (Array.isArray(reply) ? (reply as unknown[]) : []).filter(isPlainObject) as JsonDocument[];
    return analyzeSample(documents);
  },
};

/** `transfer.generate:largest-id`: `find({ _id: { $type: "number" } }, { _id: 1 }).sort({ _id: -1 }).limit(1)`. */
export const largestIdRead: ReadFeature = {
  kind: 'read',
  id: featureId('transfer.generate:largest-id'),
  request: (_context: Context, args: Json): ReadRequest => {
    const options = {
      projection: { _id: { $numberInt: '1' } },
      sort: { _id: { $numberInt: '-1' } },
      limit: { $numberInt: '1' },
    };
    const request = onCollection(args, 'find', [{ _id: { $type: 'number' } }, options], 1);
    return { kind: 'engine', requests: [{ connection: connectionId(textArg(args, 'connection')), request }] };
  },
  parse: (replies: readonly unknown[]): number | null => {
    const [reply] = replies;
    const first: unknown = Array.isArray(reply) ? reply[0] : undefined;
    return (isObject(first) ? numberOf(first['_id']) : undefined) ?? null;
  },
};
