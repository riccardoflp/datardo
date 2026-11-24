/**
 * Feature: table.export-formatting
 *
 * Writes formatting rules to a file, to pass them to someone else; nothing of the connection is in it. Asks which of
 * the scopes that reach the collection and have rules, then where, with the system's save dialog (the app read
 * `table.export-formatting:file`, which answers the path or null when the dialog was closed); then writes the file
 * `table.formatting-file` gives. Nothing is written to a deployment, so it works on a view and through a read-only
 * connection.
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
  type Outcome,
  type ReadFeature,
} from '../../shared/feature';
import { formatScopes, type FormatScope } from '../../shared/formatting-rules';
import { featureId } from '../../shared/ids';
import { rulesByScope, type RulesByScope } from './format-scopes';
import { formattingFileSuffix, formattingFileText } from './formatting-file';
import { connectionName, sectionTitle } from './parts/formatting-plan';
import { text } from './text';
import { collectionOf, startArgs, tablePlan, type TableCollection } from './types';

/** The identifier of the read of the file's place, with the system's save dialog. */
export const exportFileRead = 'table.export-formatting:file';

/** The app action of the main process that shows the system's save dialog and answers the path chosen. */
export const chooseExportFileAction = 'table.choose-formatting-file';

/** The writer of the main process that writes the text of a formatting file (`FileStep.content`). */
export const formattingFileWriter = 'table.formatting-file';

/**
 * The name the save dialog proposes: `<collection>.datardo-formatting.json`, every character of the collection's name
 * other than a letter, a digit, `.`, `-` or `_` written `_`.
 */
export function proposedFileName(collection: string): string {
  return `${collection.replace(/[^\p{L}\p{N}._-]/gu, '_')}${formattingFileSuffix}`;
}

/** How the list of scopes names one: **Collection orders**, **Database shop**, **Connection Local**, **Everywhere**. */
function scopeChoice(scope: FormatScope, context: Context, where: TableCollection): string {
  if (scope === 'collection') {
    return text.exportFile.collection(where.collection);
  }
  return sectionTitle(scope, { database: where.database, connection: connectionName(context, where.connection) });
}

function scopesQuestion(context: Context, where: TableCollection, rules: RulesByScope): Outcome {
  const offered = formatScopes.filter((scope) => rules[scope].length > 0);
  return ask({
    title: text.exportFile.title,
    button: text.exportFile.next,
    fields: [
      {
        kind: 'pick-many',
        key: 'scopes',
        label: text.exportFile.choose,
        choices: offered.map((scope) => ({
          value: scope,
          label: scopeChoice(scope, context, where),
          description: text.formattingFile.rules(rules[scope].length),
        })),
        default: offered,
      },
    ],
  });
}

/** What the save dialog is asked with: its title, its button, the name it proposes in the home folder, the type. */
export function dialogArgs(collection: string): Json {
  return {
    title: text.exportFile.title,
    button: text.exportFile.button,
    name: proposedFileName(collection),
    kind: text.exportFile.kind,
    extensions: ['json'],
  };
}

function fileName(path: string): string {
  return path.split(/[\\/]/u).pop() ?? path;
}

function exportPlan(path: string, written: string, count: number): Outcome {
  return run({
    title: text.exportFile.title,
    steps: [
      {
        kind: 'file',
        action: 'write',
        path,
        text: text.exportFile.write(path),
        content: { writer: formattingFileWriter, args: { text: written } },
      },
    ],
    danger: noDanger,
    undo: { cannot: text.exportFile.nothingToUndo },
    publishes: false,
    after: [{ kind: 'notify', level: 'success', text: text.exportFile.exported(count, fileName(path)) }],
  });
}

/**
 * Feature: table.export-formatting
 *
 * Refused when no scope that reaches the collection has a rule (`/no-rules`); else asks which scopes, all checked,
 * then where; then `write <path of the file>`. Dismissing either question, or choosing no scope, writes nothing.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const where = collectionOf(context, startArgs(answers));
  const rules = rulesByScope(context.state.table.formatting, where);
  if (formatScopes.every((scope) => rules[scope].length === 0)) {
    return refuse('table.export-formatting/no-rules', text.exportFile.noRules);
  }
  const picked = answers['scopes'];
  if (!Array.isArray(picked)) {
    return scopesQuestion(context, where, rules);
  }
  const chosen = formatScopes.filter((scope) => picked.includes(scope) && rules[scope].length > 0);
  if (chosen.length === 0) {
    return run(tablePlan(text.exportFile.title, []));
  }
  if (!('file' in answers)) {
    return needRead('file', exportFileRead, dialogArgs(where.collection));
  }
  const path = answers['file'];
  if (typeof path !== 'string' || path === '') {
    return run(tablePlan(text.exportFile.title, []));
  }
  const count = chosen.reduce((sum, scope) => sum + rules[scope].length, 0);
  return exportPlan(path, formattingFileText(rules, chosen, where), count);
}

/** `table.export-formatting:file`: the system's save dialog, an app read that answers the path, or null when closed. */
export const fileRead: ReadFeature = {
  kind: 'read',
  id: featureId(exportFileRead),
  request: (_context: Context, args: Json) => ({ kind: 'app', action: chooseExportFileAction, args }),
  parse: (replies) => (typeof replies[0] === 'string' ? replies[0] : null),
};
