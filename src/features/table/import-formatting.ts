/**
 * Feature: table.import-formatting
 *
 * Adds the formatting rules of a file to the user's own, where the user chooses; nothing is replaced. The file is
 * chosen in the system's open dialog and read in the main process, 1 MB at most (the app read
 * `table.import-formatting:file`); it is read without trusting it (`table.formatting-file`). Then the groups to import
 * are chosen, and where they go: each into its own scope of the tab's collection, or all into one. Each rule is added
 * after those already there with a new id, a rule equal to one already there is skipped, and a scope keeps 100 rules
 * at most. Nothing is written to a deployment.
 */
import type { Json } from '../../shared/engine-request';
import {
  ask,
  needRead,
  noDanger,
  refuse,
  run,
  type AppStep,
  type Answers,
  type Context,
  type Outcome,
  type ReadFeature,
} from '../../shared/feature';
import { formatScopes, isFormatScope, type FormatRule, type FormatScope } from '../../shared/formatting-rules';
import { featureId } from '../../shared/ids';
import { placeOfScope, rulesByScope, type RulesByScope } from './format-scopes';
import {
  groupsOfFormattingFile,
  rulesWithImported,
  type FormattingFile,
  type FormattingFileProblem,
  type FormattingGroup,
} from './formatting-file';
import { connectionName, newRuleIds, placeLabel, saveScopesStep, sectionTitle } from './parts/formatting-plan';
import { text } from './text';
import { collectionOf, startArgs, tablePlan, type TableCollection } from './types';

/** The identifier of the read of the file, with the system's open dialog. */
export const importFileRead = 'table.import-formatting:file';

/** The app action of the main process that shows the open dialog and reads the file chosen. */
export const readImportFileAction = 'table.read-formatting-file';

/** What the read of the file answers: its name and text, why it could not be read, or nothing when closed. */
export type ImportedFile =
  { readonly name: string; readonly text: string } | { readonly tooLarge: true } | { readonly error: string } | null;

/** What a group is called when the user chooses what to import. */
export function groupLabel(group: FormattingGroup): string {
  switch (group.scope) {
    case 'global':
      return text.importFile.everywhere;
    case 'connection':
      return text.importFile.aConnection;
    case 'database':
      return group.database === undefined ? text.importFile.aDatabase : text.sections.database(group.database);
    case 'collection':
      return group.collection === undefined
        ? text.importFile.aCollection
        : text.importFile.collection(group.database, group.collection);
  }
}

/** The refusal of a text that is not a formatting file, each code written whole. */
function problemRefusal(problem: FormattingFileProblem): Outcome {
  switch (problem.reason) {
    case 'too-large':
      return refuse('table.import-formatting/too-large', problem.message);
    case 'not-json':
      return refuse('table.import-formatting/not-json', problem.message);
    case 'not-formatting':
      return refuse('table.import-formatting/not-formatting', problem.message);
    case 'newer':
      return refuse('table.import-formatting/newer', problem.message);
  }
}

/** The groups of the file the read answered, or what the feature does instead: nothing, or a refusal. */
function fileOf(read: unknown): FormattingFile | Outcome {
  const given = read as ImportedFile;
  if (given === null || typeof given !== 'object') {
    return run(tablePlan(text.importFile.title, []));
  }
  if ('error' in given) {
    return refuse('table.import-formatting/unreadable', text.importFile.unreadable(given.error));
  }
  if ('tooLarge' in given) {
    return refuse('table.import-formatting/too-large', text.formattingFile.tooLarge);
  }
  const file = groupsOfFormattingFile(given.text);
  if ('reason' in file) {
    return problemRefusal(file);
  }
  if (file.groups.length === 0) {
    const message = file.unreadable > 0 ? text.importFile.noUsableRules(file.unreadable) : text.importFile.noRules;
    return refuse('table.import-formatting/empty', message);
  }
  return file;
}

function groupsQuestion(file: FormattingFile): Outcome {
  const values = file.groups.map((_group, index) => String(index));
  return ask({
    title: text.importFile.title,
    button: text.importFile.next,
    fields: [
      {
        kind: 'pick-many',
        key: 'groups',
        label: text.importFile.choose,
        choices: file.groups.map((group, index) => ({
          value: String(index),
          label: groupLabel(group),
          description: text.formattingFile.rules(group.rules.length),
        })),
        default: values,
      },
    ],
  });
}

function whereQuestion(context: Context, where: TableCollection): Outcome {
  const connection = connectionName(context, where.connection);
  const names = { database: where.database, connection };
  const label = (scope: FormatScope): string =>
    text.importFile.allInto(
      scope === 'collection' ? text.exportFile.collection(where.collection) : sectionTitle(scope, names),
    );
  return ask({
    title: text.importFile.title,
    button: text.importFile.button,
    fields: [
      {
        kind: 'pick-one',
        key: 'into',
        label: text.importFile.where,
        default: 'same',
        choices: [
          {
            value: 'same',
            label: text.importFile.sameScopes,
            description: text.importFile.sameScopesTip(where.collection, where.database, connection),
          },
          ...formatScopes.map((scope) => ({ value: scope, label: label(scope) })),
        ],
      },
    ],
  });
}

/** What an import adds to each scope, and the counts the notification says. */
export interface Imported {
  readonly rules: Partial<Record<FormatScope, readonly FormatRule[]>>;
  readonly added: Partial<Record<FormatScope, number>>;
  readonly already: number;
  readonly over: number;
}

/**
 * Feature: table.import-formatting
 *
 * The groups added to the scopes that reach a collection, each into its own scope (`same`) or all into one, in their
 * order, each rule after those already there with an id of `newId` (`table.formatting-file`).
 */
export function importedRules(
  existing: RulesByScope,
  groups: readonly FormattingGroup[],
  into: FormatScope | 'same',
  newId: () => string,
): Imported {
  const rules: Partial<Record<FormatScope, readonly FormatRule[]>> = {};
  const added: Partial<Record<FormatScope, number>> = {};
  let [already, over] = [0, 0];
  for (const group of groups) {
    const scope = into === 'same' ? group.scope : into;
    const merged = rulesWithImported(rules[scope] ?? existing[scope], group.rules, newId);
    if (merged.added > 0) {
      rules[scope] = merged.rules;
      added[scope] = (added[scope] ?? 0) + merged.added;
    }
    already += merged.already;
    over += merged.over;
  }
  return { rules, added, already, over };
}

function importPlan(context: Context, where: TableCollection, imported: Imported, unreadable: number): Outcome {
  const steps: AppStep[] = formatScopes.flatMap((scope) => {
    const rules = imported.rules[scope];
    const count = imported.added[scope] ?? 0;
    const place = placeOfScope(scope, where);
    return rules === undefined
      ? []
      : [saveScopesStep(text.importFile.addStep(count, placeLabel(context, place)), [{ place, rules }])];
  });
  const added = formatScopes.reduce((sum, scope) => sum + (imported.added[scope] ?? 0), 0);
  const summary = text.importFile.summary({ added, already: imported.already, unreadable, over: imported.over });
  return run({
    ...tablePlan(text.importFile.title, steps),
    danger: noDanger,
    undo: { cannot: text.importFile.cannotUndo },
    after: [{ kind: 'notify', level: added > 0 ? 'success' : 'info', text: summary }],
  });
}

/**
 * Feature: table.import-formatting
 *
 * Asks for the file, the groups to import (all checked) and where they go; then one app step for each scope that
 * gets rules: `add 3 formatting rules to Local / shop / orders`. Refused, with the message of `table.formatting-file`,
 * for a file over 1 MB, not JSON, not a file of formatting rules or of a later version; for a file without a rule that
 * can be used (`/empty`); for a file that cannot be read (`/unreadable`). Dismissing any question adds nothing.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const where = collectionOf(context, startArgs(answers));
  if (!('file' in answers)) {
    return needRead('file', importFileRead, null);
  }
  const file = fileOf(answers['file']);
  if ('kind' in file) {
    return file;
  }
  const picked = answers['groups'];
  if (!Array.isArray(picked)) {
    return groupsQuestion(file);
  }
  const groups = file.groups.filter((_group, index) => picked.includes(String(index)));
  if (groups.length === 0) {
    return run(tablePlan(text.importFile.title, []));
  }
  const into = answers['into'];
  if (into !== 'same' && !isFormatScope(into as Json)) {
    return whereQuestion(context, where);
  }
  const ids = newRuleIds(
    context,
    groups.reduce((sum, group) => sum + group.rules.length, 0),
  );
  let next = 0;
  const newId = (): string => ids[next++] ?? `f-${String(context.now)}-${String(next)}`;
  const existing = rulesByScope(context.state.table.formatting, where);
  return importPlan(
    context,
    where,
    importedRules(existing, groups, into as FormatScope | 'same', newId),
    file.unreadable,
  );
}

/** `table.import-formatting:file`: the open dialog and the file's text, an app read; null when it was closed. */
export const fileRead: ReadFeature = {
  kind: 'read',
  id: featureId(importFileRead),
  request: (_context: Context, args: Json) => ({ kind: 'app', action: readImportFileAction, args }),
  parse: (replies) => replies[0] ?? null,
};
