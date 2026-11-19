/**
 * The text of the interface of the Index advisor, word for word as the cards of `docs/features/advisor.md` write it
 * (R10.1).
 */
import { groupThousands } from '../../shared/text-units';

function plural(count: number, one: string, many: string): string {
  return `${groupThousands(count)} ${count === 1 ? one : many}`;
}

/** The words of the Index advisor. */
export const text = {
  page: 'Index advisor',
  /** The name of a tab: `Index advisor`, `Index advisor · shop`, `Index advisor · shop.orders`. */
  tab: (scope?: string) => (scope === undefined ? 'Index advisor' : `Index advisor · ${scope}`),
  openPlan: 'Open the Index advisor',
  commands: { show: 'Index advisor', turnOnProfiler: 'Turn on the profiler' },
  toolbar: {
    everyDatabase: 'every database',
    analyzedAt: (time: string) => `Analyzed at ${time}`,
    refresh: 'Refresh',
    refreshTooltip: 'Read the indexes and the slow operations again',
    analyzing: 'Analyzing…',
  },
  summary: {
    collections: (count: number) => plural(count, 'collection', 'collections'),
    indexes: (count: number) => plural(count, 'index', 'indexes'),
    size: (size: string) => `${size} of indexes`,
    suggestions: (count: number) => plural(count, 'suggestion', 'suggestions'),
    nothing: 'nothing to suggest',
    loading: 'Reading the indexes and the slow operations…',
  },
  sources: {
    line: (threshold: number, parts: string, since: string) =>
      `Slow operations (slower than ${String(threshold)} ms): ${parts}, since ${since}.`,
    none: (threshold: number) => `Slow operations (slower than ${String(threshold)} ms): none.`,
    fromProfiler: (count: number, database?: string) =>
      `${plural(count, 'operation', 'operations')} from the profiler${database === undefined ? '' : ` of ${database}`}`,
    fromLog: (count: number) => `${plural(count, 'operation', 'operations')} from the server log`,
    logUnreadable: (message: string) => `The server log can't be read: ${message}`,
    profilerOff: (database: string) =>
      `The profiler of ${database} is off: only the slow operations still in the server log are seen.`,
    profilersOff: (count: number) =>
      `The profiler is off on ${groupThousands(count)} databases: only the slow operations still in the server log are seen.`,
    turnOn: 'Turn on…',
    turnOnFor: (database: string) => `Turn on for ${database}…`,
    turnOnTooltip: (database: string, threshold: number) =>
      `Record the operations on ${database} slower than ${String(threshold)} ms`,
    failed: (what: string, message: string) => `${what}: ${message}`,
  },
  lists: {
    create: 'Indexes to create',
    redundant: 'Redundant indexes',
    unused: 'Unused indexes',
  },
  create: {
    why: (operations: number, total: string, reason: string) =>
      `${plural(operations, 'slow operation', 'slow operations')}, ${total} in total, ${reason}.`,
    serves: 'This index (equality fields, then sort, then range) can serve it.',
    servesAll: (shapes: number) =>
      `This index (equality fields, then sort, then range) can serve all ${groupThousands(shapes)} query shapes.`,
    collectionScan: 'read the whole collection',
    inMemorySort: 'sorted in memory',
    examinedMany: 'examined many more documents than they returned',
    query: (times: number, average: string, examined: string, returned: string) =>
      `${plural(times, 'time', 'times')} · avg ${average} · ${examined} examined / ${returned} returned`,
    collectionScanMark: 'collection scan',
    inMemorySortMark: 'in-memory sort',
    open: 'Open',
    openTooltip: 'Open the slowest of these queries in the collection tab',
    explain: 'Explain',
    explainTooltip: 'Open it and show how the server runs it now',
    more: (count: number) => `+${groupThousands(count)} more ${count === 1 ? 'query' : 'queries'}`,
    fewer: 'Fewer queries',
    createIndex: 'Create index…',
    createTooltip: (keys: string, namespace: string) => `Create ${keys} on ${namespace}`,
    copy: 'Copy',
    copyTooltip: 'Copy the mongosh command',
  },
  redundant: {
    why: (by: string) =>
      `Every query that can use it can use ${by}, which starts with the same fields: this one only costs writes and memory.`,
    used: (uses: number, since: string) =>
      `Used ${plural(uses, 'time', 'times')} since ${since} (the planner may pick either index).`,
    dropReason: (by: string) => `Its fields are the start of ${by}, which serves the same queries.`,
  },
  unused: {
    note: 'Use is counted since the server started (or the index was created), on the server Datardo is connected to: on a replica set, check the other members too before dropping. Unique and TTL indexes are not listed: they work without being read by queries.',
    tooRecent: (count: number) =>
      count === 1
        ? '1 more index wasn’t used yet, but its statistics started less than a day ago: check again later.'
        : `${groupThousands(count)} more indexes weren’t used yet, but their statistics started less than a day ago: check again later.`,
    since: (ago: string, when: string) => `Not used by any query since ${ago} (${when}).`,
    sinceStart: 'Not used by any query since the statistics started.',
    hidden:
      'Hidden: no query uses it, yet every write keeps it up to date. If nothing got slower since it was hidden, drop it.',
    dropReason: (ago: string) => `No query used it since ${ago}.`,
    hiddenDropReason: 'It is hidden, so no query uses it.',
  },
  buttons: {
    hide: 'Hide',
    hideTooltip: 'Queries stop using it, but it is kept up to date: unhide it at once if something gets slower',
    unhide: 'Unhide',
    unhideTooltip: 'Let queries use the index again',
    drop: 'Drop…',
  },
  empty: {
    create: 'No slow operation needs a new index.',
    noSlowOperations:
      'No slow operations recorded yet: turn on the profiler, use the application for a while, then refresh.',
    redundant: 'No index is the start of another one.',
    unusedTooRecent: 'No index has been unused for a day or more.',
    unused: 'Every index was used since the statistics started.',
  },
  readOnlyTooltip: 'The connection is read-only',
  readOnlyStatus: 'Read-only',
  ago: {
    minute: 'a minute ago',
    minutes: (count: number) => `${groupThousands(count)} minutes ago`,
    hours: (count: number) => `${groupThousands(count)} hours ago`,
    days: (count: number) => `${groupThousands(count)} days ago`,
  },
  turnOn: {
    title: (database: string) => `Turn on the profiler of ${database}`,
    question: (database: string) => `Turn on the profiler of ${database}?`,
    says: (database: string, threshold: number) =>
      `Operations on ${database} slower than ${String(threshold)} ms will be recorded in ${database}.system.profile (a small capped collection), so the advisor can see which queries need an index. Profiling adds a little work to slow operations; it can be turned off from the Monitor page.`,
    button: 'Turn on',
    cannotUndo:
      'It changes a setting of the server, not documents. The Slow queries section of the Monitor page turns the profiler off again.',
    done: (database: string, threshold: number) =>
      `The profiler of ${database} records operations slower than ${String(threshold)} ms. Use the application for a while, then refresh.`,
    failed: (message: string) => `Profiler not changed: ${message}`,
    readOnly: (connection: string) => `The connection ${connection} is read-only: the profiler can't be changed.`,
  },
} as const;
