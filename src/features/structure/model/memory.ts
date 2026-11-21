/**
 * What the tab of a structure comparison keeps (`structure.show`, `tab.restore`): the two sides as the page shows them
 * (after **⇄** too), **Only differences** or **All**, the chip pressed, the folded groups and **Include drops in the
 * script**, as the text the tab's memory holds (`TabMemory.choices`). The page starts `structure.show` with
 * `{ keep: { tab, choices } }` when they change: the app step `structure.keep` changes the tab's title and memory, an
 * Operation with an app step as D57 says of what Datardo remembers.
 */
import { run, type Context, type Outcome } from '../../../shared/feature';
import type { TabShows } from '../../../shared/state/tabs';
import { appPlan, appStep } from '../../nav/types';
import { text } from '../text';
import { differenceKinds, type DifferenceKind, type StructureSide } from '../types';

/** The app action that keeps the sides and the choices of a structure comparison with its tab. */
export const keepAction = 'structure.keep';

/** What the page keeps with its tab. */
export interface KeptStructure {
  readonly left: StructureSide;
  readonly right: { readonly connection?: string; readonly database?: string };
  readonly showAll: boolean;
  readonly chip?: DifferenceKind;
  readonly folded: readonly string[];
  readonly drops: boolean;
}

function optional(key: string, value: string | undefined): Readonly<Record<string, string>> {
  return value === undefined ? {} : { [key]: value };
}

/** The comparison as the tab's memory keeps it; the folded groups as a JSON list. */
export function choicesOf(kept: KeptStructure): Readonly<Record<string, string>> {
  return {
    'left.connection': kept.left.connection,
    'left.database': kept.left.database,
    ...optional('right.connection', kept.right.connection),
    ...optional('right.database', kept.right.database),
    showAll: String(kept.showAll),
    ...optional('chip', kept.chip),
    folded: JSON.stringify(kept.folded),
    drops: String(kept.drops),
  };
}

function foldedOf(value: string | undefined): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(value ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((each): each is string => typeof each === 'string') : [];
  } catch {
    // A memory written by hand that is not a list folds nothing.
    return [];
  }
}

function chipOf(value: string | undefined): DifferenceKind | undefined {
  return differenceKinds.find((kind) => kind === value);
}

/** The structure comparison a tab keeps: what its memory says, else the database it was opened on. */
export function keptOf(
  shows: TabShows,
  choices: Readonly<Record<string, string>> | undefined,
): KeptStructure | undefined {
  if (shows.kind !== 'page' || shows.database === undefined) {
    return undefined;
  }
  const kept = choices ?? {};
  const [connection, database] = [kept['left.connection'], kept['left.database']];
  const chip = chipOf(kept['chip']);
  return {
    left:
      connection === undefined || database === undefined
        ? { connection: shows.connection, database: shows.database }
        : { connection, database },
    right: {
      ...optional('connection', kept['right.connection']),
      ...optional('database', kept['right.database']),
    },
    showAll: kept['showAll'] === 'true',
    ...(chip === undefined ? {} : { chip }),
    folded: foldedOf(kept['folded']),
    drops: kept['drops'] === 'true',
  };
}

function choicesRecord(value: unknown): Readonly<Record<string, string>> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

/** The plan that keeps what the page shows with its tab; nothing when the tab is gone. */
export function keepPlan(context: Context, keep: unknown): Outcome {
  const fields = typeof keep === 'object' && keep !== null ? (keep as Readonly<Record<string, unknown>>) : {};
  const tab = context.state.tabs.tabs.find((each) => each.id === fields['tab']);
  const choices = choicesRecord(fields['choices']);
  const kept = tab === undefined || choices === undefined ? undefined : keptOf(tab.shows, choices);
  if (tab === undefined || kept === undefined) {
    return run(appPlan(text.show.keepPlan, []));
  }
  const title = text.show.title(kept.left.database, kept.right.database);
  const step = appStep(text.show.keepStep(title), keepAction, { tab: tab.id, title, choices: choicesOf(kept) });
  return run(appPlan(text.show.keepPlan, [step]));
}
