/**
 * Feature: connection.import — adds connections from a MongoDB Compass export, a Datardo or Mongoster export, or a
 * list of connection strings of either engine, from a file or the clipboard. The main process reads the file or the
 * clipboard and decrypts (`connection.import:source`, `connection.import:parse`); the window gets names and choices.
 */
import type { ConnectionView } from '../../shared/connection';
import type { Json } from '../../shared/engine-request';
import type { Answers, Context, Outcome, Step } from '../../shared/feature';
import { ask, needRead, noDanger, refuse, run } from '../../shared/feature';
import type { ConnectionId } from '../../shared/ids';
import { connectionState } from '../../shared/state/connections';
import { disconnectStep, hasClient } from './disconnect';
import { isRedisStringProblem, redisFromString } from './redis-string';
import { newConnectionId } from './save';
import { newFolderQuestion } from './move-to-folder';
import { isEncrypted } from './read-file';
import { fileText, organizeText, planText, transferText } from './text';
import type { FileConnection, FileConnections } from './types';
import {
  appStep,
  argumentsOf,
  connectionOfFile,
  connectionsOf,
  foldersInUse,
  hostsOf,
  jsonFields,
  numberedName,
} from './types';

/** What `connection.import:source` answers: the text and where it came from, or nothing when the dialog was closed. */
export interface ImportSource {
  readonly text: string;
  /** The name of the file, or **the clipboard**. */
  readonly name: string;
}

/** What was chosen: the connections, what to do with the names taken, and where they go. */
export interface ImportChoices {
  readonly chosen: readonly FileConnection[];
  /** Every connection of the file, which a redis-oplog link of a Datardo file names by its id. */
  readonly all?: readonly FileConnection[];
  readonly same: readonly number[];
  readonly saved: readonly ConnectionView[];
  readonly taken: 'skip' | 'replace' | 'keep';
  readonly folder:
    { readonly kind: 'from-file' } | { readonly kind: 'none' } | { readonly kind: 'one'; readonly folder: string };
}

/** What `connection.import:parse` answers: the connections, and which have the saved connection string of their name. */
export interface ImportParsed {
  readonly file?: FileConnections;
  readonly wrongPassphrase?: boolean;
  /** The indexes of the connections whose name and connection string are those of a saved one. */
  readonly same?: readonly number[];
}

function sourceOf(answers: Answers): ImportSource | null | undefined {
  const read = answers['source-read'];
  if (read === undefined) {
    return undefined;
  }
  const fields = jsonFields(read as never);
  return typeof fields['text'] === 'string' && typeof fields['name'] === 'string'
    ? { text: fields['text'], name: fields['name'] }
    : null;
}

function whereQuestion(): Outcome {
  return ask({
    title: transferText.importTitle,
    button: transferText.importButton,
    fields: [
      {
        kind: 'pick-one',
        key: 'source',
        label: transferText.where,
        default: 'file',
        choices: [
          { value: 'file', label: transferText.fromFile },
          { value: 'clipboard', label: transferText.fromClipboard },
        ],
      },
    ],
  });
}

function passphraseQuestion(attempt: number): Outcome {
  return ask({
    title: transferText.passphraseTitle,
    text: attempt === 1 ? transferText.passphrase : transferText.wrongPassphrase,
    button: transferText.importButton,
    fields: [{ kind: 'text', key: `passphrase-${String(attempt)}`, label: transferText.passphraseTitle, secret: true }],
  });
}

/** The connections of the file, read with the passphrases given until one is right; or what to ask or read next. */
function parsed(source: ImportSource, answers: Answers): ImportParsed | Outcome {
  if (!isEncrypted(source.text)) {
    const read = answers['parsed-0'];
    return read === undefined
      ? needRead('parsed-0', 'connection.import:parse', { text: source.text })
      : (read as ImportParsed);
  }
  for (let attempt = 1; ; attempt += 1) {
    const passphrase = answers[`passphrase-${String(attempt)}`];
    if (typeof passphrase !== 'string') {
      return passphraseQuestion(attempt);
    }
    const read = answers[`parsed-${String(attempt)}`] as ImportParsed | undefined;
    if (read === undefined) {
      return needRead(`parsed-${String(attempt)}`, 'connection.import:parse', { text: source.text, passphrase });
    }
    if (read.wrongPassphrase !== true) {
      return read;
    }
  }
}

function isOutcome(value: unknown): value is Outcome {
  const kind = (value as { kind?: unknown }).kind;
  return kind === 'ask' || kind === 'read' || kind === 'refuse' || kind === 'run';
}

function skippedText(file: FileConnections): string {
  return file.skipped === 0 ? '' : transferText.notConnections(file.skipped, file.format === 'list');
}

function chooseQuestion(source: ImportSource, file: FileConnections, choices: ImportChoices): Outcome {
  const placeholder = transferText.found(transferText.formats[file.format], file.connections.length, skippedText(file));
  return ask({
    title: transferText.chooseTitle(source.name),
    button: transferText.importButton,
    fields: [
      {
        kind: 'pick-many',
        key: 'chosen',
        label: placeholder,
        default: file.connections.flatMap((_, index) => (choices.same.includes(index) ? [] : [String(index)])),
        choices: file.connections.map((each, index) => ({
          value: String(index),
          label: each.name,
          description: describe(each, choices.saved, choices.same.includes(index)),
        })),
      },
    ],
  });
}

/** What an item of the list says of a connection: engine, host, whether it exists, its settings and its notes. */
export function describe(connection: FileConnection, saved: readonly ConnectionView[], same: boolean): string {
  const exists = saved.some((each) => each.name === connection.name);
  const ssh = connection.ssh;
  return [
    connection.engine === 'mongodb' ? 'MongoDB' : 'Redis',
    hostsOf(connection.engine, connection.connectionString),
    ...(exists ? [same ? transferText.same : transferText.exists] : []),
    ...(connection.folder === undefined ? [] : [connection.folder]),
    ...(connection.color === undefined ? [] : [connection.color]),
    ...(connection.readOnly === true ? ['read-only'] : []),
    ...(connection.tls === undefined ? [] : ['TLS']),
    ...(ssh === undefined ? [] : [`SSH ${ssh.username}@${ssh.host}`]),
    ...(connection.oplog === undefined ? [] : ['redis-oplog']),
    ...connection.notes,
  ].join(' · ');
}

function takenQuestion(names: readonly string[]): Outcome {
  const [first = ''] = names;
  return ask({
    title: transferText.importTitle,
    text: `${names.length === 1 ? transferText.oneTaken(first) : transferText.manyTaken(names.length)}${names.length === 1 ? '' : ` ${names.slice(0, 10).join(', ')}`}\n${transferText.takenDetail}`,
    button: transferText.importButton,
    fields: [
      {
        kind: 'pick-one',
        key: 'taken',
        label: transferText.importTitle,
        default: 'skip',
        choices: [
          { value: 'skip', label: transferText.skip },
          { value: 'replace', label: transferText.replace },
          { value: 'keep', label: transferText.keepBoth },
        ],
      },
    ],
  });
}

function folderQuestion(context: Context, fromFile: boolean): Outcome {
  return ask({
    title: transferText.folderTitle,
    button: transferText.importButton,
    fields: [
      {
        kind: 'pick-one',
        key: 'folder',
        label: transferText.folderPlaceholder,
        choices: [
          ...(fromFile ? [{ value: 'from-file', label: transferText.foldersFromFile }] : []),
          { value: 'no-folder', label: organizeText.noFolder },
          ...foldersInUse(context.state).map((folder) => ({ value: `folder:${folder}`, label: folder })),
          { value: 'new-folder', label: organizeText.newFolder },
        ],
      },
    ],
  });
}

/** Where the imported connections go: their own folders, one folder, none; or the question to ask. */
function folderChoice(
  context: Context,
  answers: Answers,
  chosen: readonly FileConnection[],
): ImportChoices['folder'] | Outcome {
  const started = argumentsOf(answers)['folder'];
  if (typeof started === 'string' && started !== '') {
    return { kind: 'one', folder: started };
  }
  const picked = answers['folder'];
  if (picked === undefined) {
    return folderQuestion(
      context,
      chosen.some((each) => each.folder !== undefined),
    );
  }
  if (picked === 'from-file') {
    return { kind: 'from-file' };
  }
  if (picked === 'new-folder') {
    const typed = answers['folderName'];
    return typeof typed === 'string' ? { kind: 'one', folder: typed.trim() } : ask(newFolderQuestion('folderName'));
  }
  return typeof picked === 'string' && picked.startsWith('folder:')
    ? { kind: 'one', folder: picked.slice('folder:'.length) }
    : { kind: 'none' };
}

/** Feature: connection.import — asks where, the passphrase, which, what to do with taken names and the folder. */
export function plan(context: Context, answers: Answers): Outcome {
  const where = answers['source'] ?? argumentsOf(answers)['source'];
  if (where !== 'file' && where !== 'clipboard') {
    return whereQuestion();
  }
  const source = sourceOf(answers);
  if (source === undefined) {
    return needRead('source-read', 'connection.import:source', { source: where });
  }
  if (source === null) {
    return importPlan(context, { chosen: [], same: [], saved: [], taken: 'skip', folder: { kind: 'none' } });
  }
  const read = parsed(source, answers);
  if (isOutcome(read)) {
    return read;
  }
  const file = read.file ?? { format: 'list', connections: [], skipped: 0 };
  if (file.connections.length === 0) {
    return refuse('connection.import/nothing-found', transferText.nothingFound(source.name, skippedText(file)));
  }
  const saved = connectionsOf(context.state).saved;
  const base: ImportChoices = { chosen: [], same: read.same ?? [], saved, taken: 'skip', folder: { kind: 'none' } };
  const picked = answers['chosen'];
  if (!Array.isArray(picked)) {
    return chooseQuestion(source, file, base);
  }
  const chosen = file.connections.filter((_, index) => picked.includes(String(index)));
  const taken = chosen.filter((each) => saved.some((other) => other.name === each.name)).map((each) => each.name);
  const answer = answers['taken'];
  if (taken.length > 0 && answer === undefined) {
    return takenQuestion([...new Set(taken)]);
  }
  const folder = folderChoice(context, answers, chosen);
  if (isOutcome(folder)) {
    return folder;
  }
  return importPlan(context, {
    ...base,
    chosen,
    all: file.connections,
    taken: answer === 'replace' ? 'replace' : answer === 'keep' ? 'keep' : 'skip',
    folder,
  });
}

/** The plan being built: its steps, the names and ids taken so far, and what the notification counts. */
interface Building {
  readonly context: Context;
  readonly choices: ImportChoices;
  readonly steps: Step[];
  readonly names: Set<string>;
  readonly ids: string[];
  /** The id and the name each connection of the file was saved under. */
  readonly saved: Map<FileConnection, { readonly id: ConnectionId; readonly name: string }>;
  /** The Redis connections saved or added, by host, port and user name. */
  readonly redis: Map<string, { readonly id: ConnectionId; readonly name: string }>;
  readonly counts: { added: number; replaced: number; skipped: number };
  readonly without: string[];
}

function addressKey(connectionString: string): string | undefined {
  const fields = redisFromString(connectionString);
  return isRedisStringProblem(fields) ? undefined : `${fields.host}:${String(fields.port)}:${fields.username}`;
}

function folderFor(building: Building, connection: FileConnection): string | undefined {
  const folder = building.choices.folder;
  switch (folder.kind) {
    case 'from-file':
      return connection.folder;
    case 'none':
      return undefined;
    case 'one':
      return folder.folder === '' ? undefined : folder.folder;
  }
}

/** Where a connection is saved: its id, its name and its folder. */
interface Given {
  readonly id: ConnectionId;
  readonly name: string;
  readonly folder: string | undefined;
}

function saveStep(building: Building, file: FileConnection, given: Given, before?: ConnectionView): void {
  const save = connectionOfFile(file, given, before);
  const text = before === undefined ? planText.saveConnection(given.name) : transferText.replaceStep(given.name);
  building.steps.push(appStep('connection.import-one', save as unknown as Json, text));
  building.saved.set(file, { id: given.id, name: given.name });
  building.names.add(given.name);
  const key = file.engine === 'redis' ? addressKey(file.connectionString) : undefined;
  if (key !== undefined && !building.redis.has(key)) {
    building.redis.set(key, { id: given.id, name: given.name });
  }
}

function newId(building: Building): ConnectionId {
  const id = newConnectionId(building.context.now, building.ids);
  building.ids.push(id);
  return id;
}

function importOne(building: Building, file: FileConnection): void {
  const before = building.choices.saved.find((each) => each.name === file.name);
  const folder = folderFor(building, file);
  if (before !== undefined && building.choices.taken === 'skip') {
    building.counts.skipped += 1;
    return;
  }
  if (file.notes.includes(fileText.noPassword) || file.notes.includes(fileText.encrypted)) {
    building.without.push(file.name);
  }
  if (before !== undefined && building.choices.taken === 'replace' && before.engine === file.engine) {
    if (hasClient(connectionState(connectionsOf(building.context.state), before.id))) {
      building.steps.push(disconnectStep(before));
    }
    saveStep(building, file, { id: before.id, name: before.name, folder }, before);
    building.counts.replaced += 1;
    return;
  }
  const name = before === undefined ? file.name : numberedName(file.name, building.names);
  saveStep(building, file, { id: newId(building), name, folder });
  building.counts.added += 1;
}

/** The Redis connection a link leads to: one imported now, one saved with the same address, or a new one. */
function linkTarget(building: Building, mongo: FileConnection): { id: ConnectionId; name: string } | undefined {
  const oplog = mongo.oplog;
  const entry =
    oplog?.connection === undefined ? undefined : building.choices.all?.find((each) => each.id === oplog.connection);
  const imported = entry === undefined ? undefined : building.saved.get(entry);
  if (imported !== undefined) {
    return imported;
  }
  const address = oplog?.url ?? entry?.connectionString;
  const key = address === undefined ? undefined : addressKey(address);
  if (address === undefined || key === undefined) {
    return undefined;
  }
  const known = building.redis.get(key);
  if (known !== undefined) {
    return known;
  }
  const name = hostsOf('redis', address);
  const redis: FileConnection = { name, engine: 'redis', connectionString: address, notes: [] };
  saveStep(building, redis, { id: newId(building), name, folder: folderFor(building, mongo) });
  building.counts.added += 1;
  return building.saved.get(redis);
}

function link(building: Building, mongo: FileConnection): void {
  const from = building.saved.get(mongo);
  const to = from === undefined || mongo.oplog === undefined ? undefined : linkTarget(building, mongo);
  if (from !== undefined && to !== undefined) {
    const text = organizeText.link(from.name, to.name);
    building.steps.push(appStep('connection.link', { connection: from.id, to: to.id }, text));
  }
}

function summary(building: Building): string {
  const { added, replaced, skipped } = building.counts;
  const counts =
    added + replaced === 0 ? transferText.nothingImported : transferText.imported(added, replaced, skipped);
  const names = building.without.slice(0, 5).join(', ');
  return `${counts}${names === '' ? '' : transferText.withoutPassword(names)}`;
}

function knownRedis(saved: readonly ConnectionView[]): Building['redis'] {
  return new Map(
    saved.flatMap((each) => {
      const key = each.engine === 'redis' && each.address !== undefined ? addressKey(each.address) : undefined;
      return key === undefined ? [] : [[key, { id: each.id, name: each.name }] as const];
    }),
  );
}

/** The plan of the import: the Redis connections first, so that the links of the MongoDB ones find them. */
export function importPlan(context: Context, choices: ImportChoices): Outcome {
  const saved = choices.saved;
  const building: Building = {
    context,
    choices,
    steps: [],
    names: new Set(saved.map((each) => each.name)),
    ids: saved.map((each) => each.id),
    saved: new Map(),
    redis: knownRedis(saved),
    counts: { added: 0, replaced: 0, skipped: 0 },
    without: [],
  };
  const ordered = [...choices.chosen].sort((a, b) => (a.engine === b.engine ? 0 : a.engine === 'redis' ? -1 : 1));
  for (const each of ordered) {
    importOne(building, each);
  }
  for (const each of ordered) {
    link(building, each);
  }
  return run({
    title: transferText.importTitle,
    steps: building.steps,
    danger: noDanger,
    undo: { cannot: transferText.cannotUndoImport },
    publishes: false,
    after: [{ kind: 'notify', level: 'success', text: summary(building) }],
  });
}
