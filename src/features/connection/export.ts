/**
 * Feature: connection.export — writes the chosen connections to a file for Datardo, for Compass, or as a list of
 * connection strings, with or without their passwords. The questions carry names and choices; the main process reads
 * the secrets and writes the file (`connection.write-file`).
 */
import type { ConnectionView } from '../../shared/connection';
import type { Answers, Context, Danger, Outcome } from '../../shared/feature';
import { ask, needRead, noDanger, refuse, run } from '../../shared/feature';
import type { Field } from '../../shared/question';
import { byFolder } from './edit';
import { fileText, transferText } from './text';
import { argumentsOf, connectionsOf, fileOfConnection, jsonFields, nothingToDo } from './types';
import { exportNotes, type ExportFormat, type ExportSecrets } from './write-file';

const formats: readonly ExportFormat[] = ['datardo', 'compass', 'list'];
const modes: readonly ExportSecrets[] = ['remove', 'encrypt', 'include'];

/** The file the save dialog proposes for each format, in the home folder. */
export const proposedNames: Readonly<Record<ExportFormat, string>> = {
  datardo: 'datardo-connections.json',
  compass: 'compass-connections.json',
  list: 'connections.txt',
};

function describe(connection: ConnectionView): string {
  return [
    connection.engine === 'mongodb' ? 'MongoDB' : 'Redis',
    ...(connection.folder === undefined ? [] : [connection.folder]),
    ...(connection.ssh === undefined ? [] : ['SSH']),
    ...(connection.tls === undefined ? [] : ['TLS']),
    ...(connection.publishesTo === undefined ? [] : ['redis-oplog']),
    ...(connection.readOnly ? ['read-only'] : []),
  ].join(' · ');
}

function one(title: string, field: Field, button = transferText.next): Outcome {
  return ask({ title, button, fields: [field] });
}

function chooseQuestion(saved: readonly ConnectionView[], folder: string | undefined): Outcome {
  const sorted = byFolder(saved);
  const checked = sorted.filter((each) => folder === undefined || each.folder === folder).map((each) => each.id);
  return one(transferText.exportTitle, {
    kind: 'pick-many',
    key: 'chosen',
    label: transferText.chooseExport,
    default: checked,
    choices: sorted.map((each) => ({ value: each.id, label: each.name, description: describe(each) })),
  });
}

function formatQuestion(chosen: readonly ConnectionView[]): Outcome {
  const offered = formats.filter((each) => each !== 'compass' || chosen.some((one) => one.engine === 'mongodb'));
  return one(transferText.formatTitle, {
    kind: 'pick-one',
    key: 'format',
    label: transferText.formatTitle,
    default: 'datardo',
    choices: offered.map((each) => ({ value: each, label: transferText.formatNames[each] })),
  });
}

function passwordsQuestion(format: ExportFormat): Outcome {
  return one(transferText.passwordsTitle, {
    kind: 'pick-one',
    key: 'secrets',
    label: transferText.includePasswords,
    default: 'remove',
    choices: modes
      .filter((each) => each !== 'encrypt' || format !== 'list')
      .map((each) => ({ value: each, label: transferText.modes[each] })),
  });
}

function passphraseQuestion(answers: Answers): Outcome | undefined {
  const first = answers['passphrase'];
  if (typeof first !== 'string') {
    return one(transferText.passphrase1, {
      kind: 'text',
      key: 'passphrase',
      label: transferText.passphrase1,
      secret: true,
      rules: [{ kind: 'pattern', pattern: '^[\\s\\S]{8,}$', message: transferText.atLeast8 }],
    });
  }
  return typeof answers['passphrase2'] === 'string'
    ? undefined
    : one(transferText.passphrase2, {
        kind: 'text',
        key: 'passphrase2',
        label: transferText.sameAgain,
        secret: true,
        rules: [{ kind: 'equals', value: first, message: transferText.noMatch }],
      });
}

/** What goes into the file: the chosen connections whose connection string is saved, and the linked Redis ones. */
export function exported(
  saved: readonly ConnectionView[],
  chosen: readonly ConnectionView[],
  format: ExportFormat,
): { readonly connections: readonly ConnectionView[]; readonly linked: number } {
  const written = chosen.filter((each) => each.secrets.connectionString);
  const ids = new Set(written.map((each) => each.id));
  const linked =
    format === 'datardo'
      ? saved.filter(
          (each) =>
            !ids.has(each.id) &&
            each.secrets.connectionString &&
            written.some((mongo) => mongo.publishesTo === each.id),
        )
      : [];
  return { connections: [...written, ...linked], linked: linked.length };
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** The questions, in order, until each has an answer; then what was answered. */
function answered(
  context: Context,
  answers: Answers,
): Outcome | { chosen: readonly ConnectionView[]; format: ExportFormat; secrets: ExportSecrets } {
  const saved = connectionsOf(context.state).saved;
  const picked = answers['chosen'];
  if (!Array.isArray(picked)) {
    const folder = argumentsOf(answers)['folder'];
    return chooseQuestion(saved, typeof folder === 'string' && folder !== '' ? folder : undefined);
  }
  const chosen = byFolder(saved).filter((each) => picked.includes(each.id));
  const format = formats.find((each) => each === answers['format']);
  if (format === undefined) {
    return formatQuestion(chosen);
  }
  const secrets = modes.find((each) => each === answers['secrets']);
  if (secrets === undefined) {
    return passwordsQuestion(format);
  }
  const passphrase = secrets === 'encrypt' ? passphraseQuestion(answers) : undefined;
  return passphrase ?? { chosen, format, secrets };
}

const clearText: Danger = {
  kind: 'confirm',
  text: `${transferText.clearTitle}\n${transferText.clearDetail}`,
  button: transferText.clearButton,
};

/** Feature: connection.export — asks which, the format, the passwords and where; then `write <path>`. */
export function plan(context: Context, answers: Answers): Outcome {
  const saved = connectionsOf(context.state).saved;
  if (saved.length === 0) {
    return refuse('connection.export/no-connections', transferText.noConnections);
  }
  const asked = answered(context, answers);
  if ('kind' in asked) {
    return asked;
  }
  const { chosen, format, secrets } = asked;
  const where = answers['path'];
  if (where === undefined) {
    return needRead('path', 'connection.export:path', { name: proposedNames[format] });
  }
  const path = jsonFields(where as never)['path'];
  if (typeof path !== 'string') {
    return nothingToDo(transferText.exportTitle, transferText.cannotUndoExport);
  }
  const { connections, linked } = exported(saved, chosen, format);
  const inFile = format === 'compass' ? connections.filter((each) => each.engine === 'mongodb') : connections;
  const notes = [
    ...(linked > 0 ? [fileText.linkedAdded(linked)] : []),
    ...exportNotes(
      connections.map((each) => fileOfConnection(each, each.address ?? '', {})),
      format,
    ),
  ];
  const passphrase = typeof answers['passphrase'] === 'string' ? answers['passphrase'] : '';
  const done = transferText.exported(inFile.length, fileName(path));
  return run({
    title: transferText.exportTitle,
    steps: [
      {
        kind: 'file',
        action: 'write',
        path,
        content: {
          writer: 'connection.write-file',
          args: { ids: connections.map((each) => each.id), format, secrets, passphrase },
        },
        text: transferText.write(path),
      },
    ],
    danger: secrets === 'include' ? clearText : noDanger,
    undo: { cannot: transferText.cannotUndoExport },
    publishes: false,
    after: [
      {
        kind: 'notify',
        level: 'success',
        text: `${done}${notes.length === 0 ? '' : transferText.note(notes.join('; '))}`,
      },
    ],
  });
}
