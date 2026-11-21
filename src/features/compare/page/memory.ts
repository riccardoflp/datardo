/**
 * What the tab of a comparison keeps (`compare.show`, `tab.restore`): the two sides as the page shows them (after
 * **⇄** too), the filter, **Ignore** and the two options, as the text the tab's memory holds (`TabMemory.choices`).
 * The page starts `compare.show` with `{ keep: { tab, choices } }` when they change, which changes the tab's title
 * and memory with the app step `compare.keep`.
 */
import { connectionId } from '../../../shared/ids';
import type { TabShows } from '../../../shared/state/tabs';
import type { ComparisonOptions, SideRef } from '../types';

/** What the page keeps with its tab. */
export interface KeptComparison {
  readonly left: SideRef;
  readonly right?: SideRef;
  readonly options: ComparisonOptions;
}

/** The options of a new page: no filter, nothing ignored, both options on. */
export const defaultOptions: ComparisonOptions = { filter: '', ignore: '', ignoreOrder: true, numbersByValue: true };

function sideChoices(prefix: 'left' | 'right', side: SideRef): Readonly<Record<string, string>> {
  return {
    [`${prefix}.connection`]: side.connection,
    [`${prefix}.database`]: side.database,
    [`${prefix}.collection`]: side.collection,
    [`${prefix}.view`]: String(side.view),
  };
}

/** The comparison as the tab's memory keeps it. */
export function choicesOf(kept: KeptComparison): Readonly<Record<string, string>> {
  return {
    ...sideChoices('left', kept.left),
    ...(kept.right === undefined ? {} : sideChoices('right', kept.right)),
    filter: kept.options.filter,
    ignore: kept.options.ignore,
    ignoreOrder: String(kept.options.ignoreOrder),
    numbersByValue: String(kept.options.numbersByValue),
  };
}

function sideOf(choices: Readonly<Record<string, string>>, prefix: 'left' | 'right'): SideRef | undefined {
  const connection = choices[`${prefix}.connection`];
  const database = choices[`${prefix}.database`];
  const collection = choices[`${prefix}.collection`];
  return connection === undefined || database === undefined || collection === undefined
    ? undefined
    : { connection: connectionId(connection), database, collection, view: choices[`${prefix}.view`] === 'true' };
}

/** The left side a tab was opened on: its connection, its database and the collection its `of` names. */
export function leftOfShows(shows: TabShows): SideRef | undefined {
  if (shows.kind !== 'page' || shows.database === undefined) {
    return undefined;
  }
  const [namespace] = shows.of ?? [];
  const prefix = `${shows.database}.`;
  return namespace?.startsWith(prefix) === true
    ? {
        connection: shows.connection,
        database: shows.database,
        collection: namespace.slice(prefix.length),
        view: false,
      }
    : undefined;
}

/** The comparison a tab keeps: what its memory says, else the collection it was opened on and the default options. */
export function keptOf(
  shows: TabShows,
  choices: Readonly<Record<string, string>> | undefined,
): KeptComparison | undefined {
  const opened = leftOfShows(shows);
  const kept = choices ?? {};
  const left = sideOf(kept, 'left') ?? opened;
  if (left === undefined) {
    return undefined;
  }
  const right = sideOf(kept, 'right');
  return {
    left,
    ...(right === undefined ? {} : { right }),
    options: {
      filter: kept['filter'] ?? defaultOptions.filter,
      ignore: kept['ignore'] ?? defaultOptions.ignore,
      ignoreOrder: kept['ignoreOrder'] !== 'false',
      numbersByValue: kept['numbersByValue'] !== 'false',
    },
  };
}
