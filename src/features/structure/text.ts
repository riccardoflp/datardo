/**
 * The text of the structure area (R10.1): the words of the cards of docs/features/structure.md, word for word, and
 * Mongoster's own where a card keeps them (its summaries, its notes, its script). Datardo is said where Mongoster said
 * Mongoster, and sentence case where it had title case.
 */
import { groupThousands } from '../../shared/text-units';
import type { CollectionType, DifferenceKind } from './types';
import { plural } from './model/values';

/** The name of a type of collection in a sentence. */
const typeNames: Readonly<Record<CollectionType, string>> = {
  collection: 'collection',
  view: 'view',
  timeseries: 'time series collection',
};

function capitalized(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** The text of the structure area. */
export const text = {
  typeName: (type: CollectionType): string => typeNames[type],
  summaries: {
    missingOnRight: (type: CollectionType, indexes: number): string =>
      `${capitalized(typeNames[type])} missing on the right${indexes > 0 ? `, with ${plural(indexes, 'index')}` : ''}`,
    viewMissingOnRight: (on: string): string => `View missing on the right (on ${on})`,
    onlyOnRight: (type: CollectionType): string => `${capitalized(typeNames[type])} only on the right`,
    otherType: (left: CollectionType, right: CollectionType): string =>
      `A ${typeNames[left]} on the left, a ${typeNames[right]} on the right`,
    viewOn: (on: string): string => `View on ${on}`,
    sameOptions: (names: readonly string[]): string =>
      names.length === 0 ? 'Same options (none)' : `Same options: ${names.join(', ')}`,
    different: (names: readonly string[]): string => `Different ${names.join(', ')}`,
    indexMissing: (keys: string): string => `Missing on the right: ${keys}`,
    indexOnlyRight: (keys: string): string => `Only on the right: ${keys}`,
    sameKeysOtherName: (keys: string, rightName: string, others: readonly string[]): string =>
      `Same keys ${keys}, named ${rightName} on the right${others.length > 0 ? `; different ${others.join(', ')}` : ''}`,
    sameNameOtherKeys: (left: string, right: string): string =>
      `Same name, different keys: ${left} on the left, ${right} on the right`,
    searchMissing: (type: string): string => `Missing on the right (${type})`,
    searchOnlyRight: (type: string): string => `Only on the right (${type})`,
    searchDefinition: 'Different definition',
    searchTypes: (left: string, right: string): string => `${left} on the left, ${right} on the right`,
    shardedLeft: (key: string): string => `Sharded on the left by ${key}, not on the right`,
    shardedRight: (key: string): string => `Sharded on the right by ${key}, not on the left`,
    shardKeys: (left: string, right: string): string => `Shard key ${left} on the left, ${right} on the right`,
  },
  stepNotes: {
    documentsDeleted: 'Its documents and indexes are deleted.',
    recreated: (right: CollectionType, left: CollectionType): string =>
      `The ${typeNames[right]} is dropped and created again as a ${typeNames[left]}${right === 'view' ? '' : ': its documents are deleted'}.`,
    viewCollation: "A view's collation can't be changed: the view is dropped and created again.",
    timeseries:
      "The time series options (other than a coarser granularity) can't be changed: create the collection again and copy its documents.",
    convertToCapped:
      'convertToCapped rewrites the collection: the oldest documents beyond the size are lost, and its indexes other than _id are dropped.',
    uncapped: "A capped collection can't be made uncapped: create it again and copy its documents.",
    collation:
      "The default collation of a collection can't be changed: create it again with the collation and copy its documents.",
    clustered: "A collection can't become clustered or stop being clustered: create it again and copy its documents.",
    rebuilt: (what: readonly string[]): string =>
      `MongoDB can't change ${what.join(', ')} of an index: it is dropped and built again. Queries can't use it in the meantime.`,
    searchType: "The type of a search index can't be changed: it is dropped and built again.",
    shardIndex: 'The collection needs an index that starts with the shard key.',
    unshard:
      'A sharded collection is made unsharded with unshardCollection (MongoDB 8.0 or later), which moves its data to one shard.',
    reshard: (key: string): string =>
      `Changing the shard key means resharding: reshardCollection with key ${key} (MongoDB 5.0 or later), which copies the whole collection.`,
  },
  notes: {
    searchUnreadable: (side: string, reason: string): string =>
      `Search indexes are not compared: they could not be read on the ${side}: ${reason}`,
    noSearch: (side: string, count: number, other: string): string =>
      `Search indexes are not compared: the ${side} server has no search (${plural(count, 'search index')} on the ${other}).`,
    shardKeys: (side: string): string => `Shard keys are not compared: only the ${side} is a sharded cluster.`,
    unknownError: 'unknown error',
  },
  objects: {
    collection: 'collection',
    timeseries: 'time series',
    view: 'view',
    options: 'options',
    index: 'index',
    'search-index': 'search index',
    'shard-key': 'shard key',
  },
  script: {
    makes: (right: string, left: string): string => `// Makes ${right} like ${left}.`,
    generated: '// Generated by Datardo (Compare structure).',
    commentedOut: '// Steps that drop something are commented out: remove the // in front of them to run them too.',
    marked: '// Steps marked DESTRUCTIVE drop indexes, collections or data: check them before running the script.',
    nothing: '// Nothing to change: the structures are the same.',
    optional: '// DESTRUCTIVE, optional: remove the // to run it.',
    destructive: '// DESTRUCTIVE',
  },
  copy: {
    title: 'Copy script',
    whole: (right: string, left: string): string => `copy the script that makes ${right} like ${left} to the clipboard`,
    one: (difference: string): string => `copy the steps of ${difference} to the clipboard`,
    copied: 'Copied to the clipboard',
  },
  playground: {
    title: 'Open in playground',
    step: (right: string, left: string): string =>
      `open a playground on ${right} with the script that makes it like ${left}`,
  },
  apply: {
    titleOne: (right: string, difference: string): string => `Apply to ${right}: ${difference}`,
    titleMany: (right: string, left: string): string => `Make ${right} like ${left}`,
    changes: (count: number, commands: string): string => `${plural(count, 'change')}: ${commands}.`,
    drops: (count: number, commands: string): string =>
      `${plural(count, 'step')} ${count === 1 ? 'drops' : 'drop'} something: ${commands}.`,
    leftOut: (count: number): string =>
      `${plural(count, 'difference')} can't be applied by a command and ${count === 1 ? 'is' : 'are'} left out (the script says what to do).`,
    lost: (collection: string, count: number | undefined): string =>
      count === undefined
        ? `${collection} is dropped with its documents and indexes.`
        : `${collection} is dropped with its ${plural(count, 'document')} and indexes.`,
    always: "Index builds can take a while on large collections. These changes can't be undone from the undo history.",
    notRecorded: "These changes can't be undone from the undo history.",
    apply: 'Apply',
    applyAndDrop: 'Apply and drop',
    drop: 'Drop',
    applyIncludingDrops: 'Apply including drops',
    applyDrops: 'Apply drops',
    question: 'Apply all…',
    withoutDrops: 'Apply without drops',
    includingDrops: 'Apply including drops',
    next: 'Continue',
    applied: (count: number, right: string): string => `Applied ${plural(count, 'change')} to ${right}.`,
    nothingChanged: (right: string): string => `Nothing was changed in ${right}.`,
    failed: (count: number, failures: readonly string[]): string =>
      `${plural(count, 'difference')} failed: ${failures.slice(0, 3).join(' · ')}${failures.length > 3 ? ' …' : ''}`,
  },
  refusals: {
    readOnly: (connection: string): string =>
      `The connection ${connection} is read-only. Its structure can't be changed.`,
    comparing: 'Wait for the comparison to finish.',
    stale: 'Nothing to change: compare again.',
    noCommand: "These differences can't be applied by a command: the script says what to do.",
  },
  show: {
    page: 'Structure',
    commandTitle: 'Compare structure with…',
    title: (left: string, right: string | undefined): string =>
      right === undefined || right === left ? `Structure: ${left}` : `Structure: ${left} ↔ ${right}`,
    left: 'Left · model',
    swap: '⇄',
    swapHint: 'Swap the sides: the script then changes the other database',
    right: 'Right · changed by the script',
    connection: 'Connection',
    connectionHint: 'The connection of the other database, which the script changes (e.g. production)',
    database: 'Database',
    sameConnection: 'same connection',
    readOnly: 'read-only',
    readOnlyHint: (connection: string): string => `The connection ${connection} is read-only.`,
    explanation: 'The script and **Apply…** make the right database like the left one.',
    compare: 'Compare',
    compareHint: 'Read both structures again',
    chips: {
      same: (count: number): string => `${groupThousands(count)} same`,
      different: (count: number): string => `${groupThousands(count)} different`,
      'only-left': (count: number): string => `${groupThousands(count)} only left`,
      'only-right': (count: number): string => `${groupThousands(count)} only right`,
    } satisfies Record<DifferenceKind, (count: number) => string>,
    chipHints: {
      same: 'Show only what is the same',
      different: 'Show only what is different',
      'only-left': 'Show only what is only left',
      'only-right': 'Show only what is only right',
    } satisfies Record<DifferenceKind, string>,
    kinds: {
      same: 'Same',
      different: 'Different',
      'only-left': 'Only left',
      'only-right': 'Only right',
    } satisfies Record<DifferenceKind, string>,
    differences: (count: number, seconds: string): string => `${plural(count, 'difference')} · ${seconds}`,
    sameStructures: (seconds: string): string => `The structures are the same · ${seconds}`,
    onlyDifferences: 'Only differences',
    onlyDifferencesHint: 'Only what differs',
    all: 'All',
    allHint: 'Also what is the same on both sides',
    includeDrops: 'Include drops in the script',
    includeDropsHint: 'Steps that drop indexes, collections or data are in the script without the // in front',
    copyScript: 'Copy script',
    copyScriptHint: 'Copy the mongosh script that makes the right database like the left one',
    copyStepsHint: 'Copy the steps of this difference',
    openInPlayground: 'Open in playground',
    openInPlaygroundHint: 'Open the script in a new playground on the right connection',
    applyAll: 'Apply all…',
    applyAllHint: 'Apply every difference to the right database, after a confirmation',
    apply: 'Apply…',
    applyGroupHint: (count: number, collection: string): string =>
      `Apply the ${String(count)} differences of ${collection} to the right database`,
    applyHint: 'Change the right database (after a confirmation)',
    applyDropHint: 'Change the right database, dropping something (after a confirmation)',
    groupCount: (count: number): string => `· ${plural(count, 'difference')}`,
    groupSame: '· same',
    sameOnBoth: 'The same on both sides',
    noCommand: 'No command can do this: the script says what to do',
    field: 'field',
    leftColumn: 'left',
    rightColumn: 'right',
    missing: '—',
    missingHint: 'Missing on this side',
    leftDefinition: 'Left',
    rightDefinition: 'Right',
    stepsOnRight: 'Steps on the right',
    reading: (left: string, right: string): string => `Reading the structures… left ${left}, right ${right}`,
    progress: (done: number, total: number): string => `${String(done)} of ${plural(total, 'collection')}`,
    unknownProgress: '…',
    swapping: 'Swapping the sides…',
    empty: 'No differences: the collections, options and indexes are the same on both sides.',
    nothingOfKind: 'Nothing of this kind.',
    noOtherDatabase: (connection: string): string => `${connection} has no other database to compare with.`,
    couldNotConnect: (connection: string, message: string): string => `Could not connect to ${connection}: ${message}`,
    openPlan: 'Open the structure comparison',
  },
};
