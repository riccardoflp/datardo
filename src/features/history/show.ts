/**
 * Feature: history.show
 *
 * The document history page: the writes to one document that are still in the oplog, newest first, with the version
 * after each. `view` says what the page shows from what was read (`history.oplog-window`, `history.read-writes`,
 * `history.versions`, `history.own-writes`); `plan` is what **History** and Go to start: it opens the page in a tab of
 * the connection's group, one per document, titled **History: `<_id>`**.
 *
 * Started on a collection with `{ id, idText }`: the `_id` as canonical Extended JSON and as the table shows it. From
 * Go to with no such arguments, the active document tab gives them; with neither, it is refused.
 */
import type { Json } from '../../shared/engine-request';
import { refuse, run, type Answers, type Context, type Outcome } from '../../shared/feature';
import { featureId, type ConnectionId } from '../../shared/ids';
import { activeTabOf, type TabShows } from '../../shared/state/tabs';
import type { OplogPoint } from './oplog-window';
import type { ReadStop } from './read-writes';
import { changesText, commandText, copyText, showText } from './text';
import { durationText, isoTime, localDateTime } from './time/time-text';
import { objectOf, type CollectionCommand, type DocumentHistory, type DocumentVersion } from './types';
import { updateChangesText } from './update-changes';
import { timestampText, writeTime, type DetailControl } from './version-detail';

/** The page of a document history, as its tab shows it. */
export const historyPage = 'history';

/** Where the page is: loading, loaded, without an oplog to read, or failed. */
export type HistoryStatus =
  | { readonly kind: 'loading'; readonly older: boolean }
  | { readonly kind: 'loaded' }
  | { readonly kind: 'no-oplog'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string };

/** What the page is drawn from. */
export interface HistoryPageInput {
  readonly connectionName: string;
  readonly readOnly: boolean;
  readonly database: string;
  readonly collection: string;
  /** The `_id` as the table shows it. */
  readonly idText: string;
  readonly offsetMinutes: number;
  readonly status: HistoryStatus;
  /** The oplog's first and last oplog entry (`history.oplog-window`). */
  readonly oplog?: { readonly first?: OplogPoint; readonly last?: OplogPoint };
  /** Where the reads so far stopped, with the writes they found and how long they took. */
  readonly read?: { readonly stop: ReadStop; readonly writes: number; readonly durationMs: number };
  readonly history?: DocumentHistory;
  /** Whether the document exists now. */
  readonly exists: boolean;
  /** The titles in the undo history of the writes made from Datardo, by the key of their version. */
  readonly own: Readonly<Record<string, string>>;
  /** The message of the last restore. */
  readonly restoreMessage?: string;
  /** The key of the selected write; the newest when none is. */
  readonly selected?: string;
}

/** A mark under **by**: its text and tooltip. */
export interface ByMark {
  readonly text: string;
  readonly tooltip?: string;
}

/** One line of the list of writes. */
export interface WriteRow {
  readonly key: string;
  readonly time: string;
  readonly timeTip: string;
  readonly write: string;
  readonly changes: string;
  readonly by: readonly ByMark[];
  readonly version?: { readonly text: string; readonly tooltip: string };
  readonly restore?: DetailControl;
  readonly selected: boolean;
  /** Selecting the line shows its version in the inspector. */
  readonly select: string;
}

/** What is shown in place of the list, or the list. */
export type HistoryBody =
  | { readonly kind: 'loading'; readonly text: string }
  | { readonly kind: 'message'; readonly text: string }
  | { readonly kind: 'empty'; readonly text: string }
  | { readonly kind: 'list'; readonly columns: readonly string[]; readonly rows: readonly WriteRow[] };

/** What the page shows, from the top. */
export interface HistoryPageView {
  readonly toolbar: {
    readonly place: string;
    readonly id: string;
    readonly openDocument: { readonly label: string; readonly tooltip: string; readonly feature: string };
    readonly refresh: DetailControl;
  };
  readonly oplogLine?: string;
  readonly restoreMessage?: string;
  readonly conflict?: string;
  readonly loadingOlder?: string;
  readonly body: HistoryBody;
  readonly endNote?: string;
  readonly more?: { readonly text: string; readonly loadOlder: DetailControl };
  /** The key of the write whose version the inspector shows. */
  readonly selected?: string;
}

function commandChange(command: CollectionCommand | undefined): string {
  switch (command?.kind) {
    case 'collection-dropped':
      return commandText.collectionDropped;
    case 'database-dropped':
      return commandText.databaseDropped;
    case 'renamed-to':
      return commandText.renamedTo(command.to);
    case 'renamed-from':
      return commandText.renamedFrom(command.from);
    case undefined:
      return '';
  }
}

/** The **changes** of a write. */
export function changesOf(version: DocumentVersion): string {
  const fields = Object.keys(version.write.o).length;
  switch (version.kind) {
    case 'insert':
      return changesText.inserted(fields);
    case 'replace':
      return changesText.replaced(fields);
    case 'delete':
      return changesText.deleted;
    case 'update':
      return version.changes === undefined ? changesText.noChange : updateChangesText(version.changes);
    case 'drop':
    case 'renamed':
      return commandChange(version.write.command);
  }
}

function transactionTip(version: DocumentVersion): string | undefined {
  const { write } = version;
  const parts = [
    ...(write.session === undefined ? [] : [showText.session(write.session)]),
    ...(write.transactionNumber === undefined ? [] : [showText.transactionNumber(write.transactionNumber)]),
    ...(write.partial === true ? [showText.largeTransaction] : []),
    ...(write.prepared === true ? [showText.preparedTransaction] : []),
  ];
  return parts.length === 0 ? undefined : parts.join(' · ');
}

/** The **by** of a write: Datardo, a transaction, a batch, a retryable write, a chunk migration. */
export function byOf(version: DocumentVersion, ownTitle: string | undefined): readonly ByMark[] {
  const { write } = version;
  const marks: ByMark[] = [];
  if (ownTitle !== undefined) {
    marks.push({ text: showText.datardo, tooltip: showText.datardoTip(ownTitle) });
  }
  const tip = transactionTip(version);
  if (write.group === 'transaction') {
    marks.push({ text: showText.transaction, ...(tip === undefined ? {} : { tooltip: tip }) });
  } else if (write.group === 'batch') {
    marks.push({ text: showText.batch, tooltip: showText.batchTip });
  } else if (write.session !== undefined && write.transactionNumber !== undefined) {
    marks.push({ text: showText.retryableWrite, tooltip: showText.session(write.session) });
  }
  if (write.migration === true) {
    marks.push({ text: showText.chunkMigration, tooltip: showText.chunkMigrationTip });
  }
  return marks;
}

/** The **version** of a write: current, partial, unknown, no document, or nothing for an exact version. */
export function versionMark(
  version: DocumentVersion,
  current: boolean,
): { readonly text: string; readonly tooltip: string } | undefined {
  if (current) {
    return { text: showText.current, tooltip: showText.currentTip };
  }
  switch (version.state) {
    case 'partial':
      return { text: showText.partial, tooltip: showText.partialTip((version.unknown ?? []).join(', ')) };
    case 'unknown':
      return { text: showText.unknown, tooltip: showText.unknownTip };
    case 'absent':
      return { text: showText.absent, tooltip: showText.absentTip };
    case 'exact':
      return undefined;
  }
}

function restoreOf(input: HistoryPageInput, version: DocumentVersion, current: boolean): DetailControl | undefined {
  if (version.state !== 'exact' || current) {
    return undefined;
  }
  const writable = input.exists ? showText.restoreTip : showText.insertAgainTip;
  const loading = input.status.kind === 'loading';
  return {
    label: input.exists ? showText.restore : showText.insertAgain,
    element: 'document.restore-version@list',
    feature: 'document.restore-version',
    args: { key: version.key },
    tooltip: input.readOnly ? showText.readOnly(input.connectionName) : writable,
    ...(loading || input.readOnly ? { disabled: true } : {}),
  };
}

/** The versions newest first, with the key of the current one. */
function newestFirst(input: HistoryPageInput): {
  readonly versions: readonly DocumentVersion[];
  readonly current?: string;
} {
  const versions = [...(input.history?.versions ?? [])].reverse();
  const newest = versions[0];
  return newest !== undefined && input.exists ? { versions, current: newest.key } : { versions };
}

function rowOf(
  input: HistoryPageInput,
  version: DocumentVersion,
  current: boolean,
  selected: string | undefined,
): WriteRow {
  const time = writeTime(version);
  const mark = versionMark(version, current);
  const restore = restoreOf(input, version, current);
  return {
    key: version.key,
    time: localDateTime(time, input.offsetMinutes),
    timeTip: `${isoTime(time)} · ${timestampText(version.write.t, version.write.i)}`,
    write: showText.kinds[version.kind],
    changes: changesOf(version),
    by: byOf(version, input.own[version.key]),
    ...(mark === undefined ? {} : { version: mark }),
    ...(restore === undefined ? {} : { restore }),
    selected: version.key === selected,
    select: 'history.version-detail@list',
  };
}

/** The line on the oplog: how far back it goes, then how many writes were found and in how long. */
export function oplogLine(input: HistoryPageInput): string | undefined {
  const { first, last } = input.oplog ?? {};
  if (input.oplog === undefined) {
    return undefined;
  }
  const back =
    first === undefined || last === undefined
      ? showText.oplogEmpty
      : showText.oplogBack(
          localDateTime(first.time, input.offsetMinutes),
          durationText((last.time - first.time) / 1000),
        );
  const found =
    input.read === undefined ? '' : ` ${showText.found(input.read.writes, (input.read.durationMs / 1000).toFixed(1))}`;
  return `${back}${found}`;
}

function bodyOf(input: HistoryPageInput, rows: readonly WriteRow[]): HistoryBody {
  const { status } = input;
  if (status.kind === 'no-oplog' || status.kind === 'error') {
    return { kind: 'message', text: status.message };
  }
  if (status.kind === 'loading' && !status.older) {
    return { kind: 'loading', text: showText.loading };
  }
  if (rows.length > 0) {
    const { columns } = showText;
    return { kind: 'list', columns: [columns.time, columns.write, columns.changes, columns.by, columns.version], rows };
  }
  const first = input.oplog?.first;
  return input.read?.stop.complete === true && first !== undefined
    ? { kind: 'empty', text: showText.emptyWhole(localDateTime(first.time, input.offsetMinutes)) }
    : { kind: 'empty', text: showText.emptyPart };
}

/** The notes after the list: older versions gone, or where the read stopped with **Load older**. */
function endOf(
  input: HistoryPageInput,
  oldest: DocumentVersion | undefined,
): Pick<HistoryPageView, 'endNote' | 'more'> {
  const stop = input.read?.stop;
  if (stop === undefined || input.status.kind === 'no-oplog' || input.status.kind === 'error') {
    return {};
  }
  if (stop.complete) {
    return oldest !== undefined && oldest.kind !== 'insert' ? { endNote: showText.olderGone } : {};
  }
  const date = localDateTime(stop.readBackTo.t * 1000, input.offsetMinutes);
  const loadOlder: DetailControl = {
    label: showText.loadOlder,
    element: 'history.read-writes@list',
    feature: 'history.read-writes',
    args: { readBackTo: { t: stop.readBackTo.t, i: stop.readBackTo.i } },
    tooltip: showText.loadOlderTip,
    ...(input.status.kind === 'loading' ? { disabled: true } : {}),
  };
  return { more: { text: stop.timedOut ? showText.timeLimit(date) : showText.readBack(date), loadOlder } };
}

/** Feature: history.show — what the document history page shows. */
export function view(input: HistoryPageInput): HistoryPageView {
  const { versions, current } = newestFirst(input);
  const selected = versions.some((version) => version.key === input.selected) ? input.selected : versions[0]?.key;
  const rows = versions.map((version) => rowOf(input, version, version.key === current, selected));
  const line = oplogLine(input);
  const loading = input.status.kind === 'loading';
  const body = bodyOf(input, rows);
  return {
    toolbar: {
      place: `${input.database}.${input.collection}`,
      id: `_id: ${input.idText}`,
      openDocument: { label: showText.openDocument, tooltip: showText.openDocumentTip, feature: 'document.open' },
      refresh: {
        label: showText.refresh,
        element: 'history.read-writes@toolbar',
        feature: 'history.read-writes',
        args: null,
        tooltip: showText.refreshTip,
        ...(loading ? { disabled: true } : {}),
      },
    },
    ...(line === undefined || body.kind === 'message' ? {} : { oplogLine: line }),
    ...(input.restoreMessage === undefined ? {} : { restoreMessage: input.restoreMessage }),
    ...(input.history?.conflict === true && body.kind === 'list' ? { conflict: showText.conflict } : {}),
    ...(input.status.kind === 'loading' && input.status.older ? { loadingOlder: showText.loadingOlder } : {}),
    body,
    ...(body.kind === 'list' ? endOf(input, versions[versions.length - 1]) : endOf(input, undefined)),
    ...(selected === undefined || body.kind !== 'list' ? {} : { selected }),
  };
}

/** The document a history is of, as the page's tab says it. */
export interface HistoryOf {
  readonly connection: ConnectionId;
  readonly database: string;
  readonly collection: string;
  /** The `_id` as canonical Extended JSON. */
  readonly id: Json;
  /** The `_id` as the table shows it. */
  readonly idText: string;
}

/** What the page's tab shows: one tab per document, told apart by the `_id` as canonical Extended JSON. */
export function historyShows(of: HistoryOf): TabShows {
  return {
    kind: 'page',
    connection: of.connection,
    page: historyPage,
    title: showText.tabTitle(of.idText),
    database: of.database,
    of: [of.collection, JSON.stringify(of.id)],
  };
}

function parsedId(text: string): Json | undefined {
  try {
    return JSON.parse(text) as Json;
  } catch {
    return undefined;
  }
}

/** The document of the active document tab, when it is one. */
function activeDocument(context: Context): HistoryOf | undefined {
  const shows = activeTabOf(context.state.tabs)?.shows;
  if (shows?.kind !== 'document' || shows.idJson === undefined) {
    return undefined;
  }
  const id = parsedId(shows.idJson);
  const { connection, database, collection } = shows;
  return id === undefined ? undefined : { connection, database, collection, id, idText: shows.id };
}

/** The document the page is started on: from the arguments on a collection, or the active document tab. */
export function historyOf(context: Context, answers: Answers): HistoryOf | undefined {
  const fields = objectOf(answers['args'] as Json | undefined);
  const { target } = context;
  const id = fields['id'];
  const idText = fields['idText'];
  if (target.kind === 'collection' && id !== undefined && id !== null && typeof idText === 'string') {
    return { connection: target.connection, database: target.database, collection: target.collection, id, idText };
  }
  return activeDocument(context);
}

/** Feature: history.show — opens the page of the document, or makes its tab active; it then reads the oplog again. */
export function plan(context: Context, answers: Answers): Outcome {
  const of = historyOf(context, answers);
  if (of === undefined) {
    return refuse('history.show/no-document', showText.noDocument);
  }
  return run({
    title: showText.command,
    steps: [],
    danger: { kind: 'none' },
    undo: { cannot: copyText.cannotUndo },
    publishes: false,
    after: [
      {
        kind: 'start',
        feature: featureId('tab.open'),
        target: { kind: 'collection', connection: of.connection, database: of.database, collection: of.collection },
        args: { shows: historyShows(of) as unknown as Json },
      },
    ],
  });
}
