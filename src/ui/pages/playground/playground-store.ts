/**
 * What the window keeps of its playgrounds: the edits on their way to the main process, sent 300 ms after the last
 * key (`playground.show:edit`), and what autocomplete has read, kept 120 seconds (`playground.autocomplete`). The
 * main process keeps the text; the window only coalesces what it sends.
 */
import {
  collectionsReadId,
  hintsKeptMs,
  sampleReadId,
  type CompletionHints,
  type CompletionNeed,
  type FieldHint,
} from '../../../features/playground/autocomplete';
import { editReadId, statementsDelayMs } from '../../../features/playground/show';
import type { TextRange } from '../../../features/playground/types';
import { featureId, type ConnectionId, type TabId } from '../../../shared/ids';
import { appTarget } from '../../../shared/target';

interface PendingEdit {
  readonly text: string;
  readonly selection?: TextRange;
  readonly timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<TabId, PendingEdit>();

function sendEdit(tab: TabId, edit: Omit<PendingEdit, 'timer'>): Promise<unknown> {
  return window.datardo.start({
    feature: featureId(editReadId),
    target: appTarget,
    place: 'editor',
    args: { tab, text: edit.text, ...(edit.selection === undefined ? {} : { selection: { ...edit.selection } }) },
  });
}

/** Sends the text and the selection of a playground 300 ms after the last change, once. */
export function editPlayground(tab: TabId, text: string, selection: TextRange | undefined): void {
  const before = pending.get(tab);
  if (before !== undefined) {
    clearTimeout(before.timer);
  }
  const timer = setTimeout(() => {
    flushPlayground(tab);
  }, statementsDelayMs);
  pending.set(tab, { text, ...(selection === undefined ? {} : { selection }), timer });
}

/** Sends at once what a playground has not sent yet, before a run or a save reads it. */
export function flushPlayground(tab: TabId): void {
  const edit = pending.get(tab);
  if (edit === undefined) {
    return;
  }
  clearTimeout(edit.timer);
  pending.delete(tab);
  void sendEdit(tab, edit);
}

/** Sends at once what every playground has not sent yet: before a command of the window reads them. */
export function flushPlaygrounds(): void {
  for (const tab of [...pending.keys()]) {
    flushPlayground(tab);
  }
}

interface Kept<Value> {
  readonly value: Value;
  readonly at: number;
}

interface ConnectionHints {
  readonly collections: Map<string, Kept<readonly string[]>>;
  readonly fields: Map<string, Kept<readonly FieldHint[]>>;
  readonly reading: Set<string>;
}

const hints = new Map<ConnectionId, ConnectionHints>();

function hintsOf(connection: ConnectionId): ConnectionHints {
  const found = hints.get(connection);
  if (found !== undefined) {
    return found;
  }
  const made: ConnectionHints = { collections: new Map(), fields: new Map(), reading: new Set() };
  hints.set(connection, made);
  return made;
}

function fresh<Value>(kept: ReadonlyMap<string, Kept<Value>>, now: number): Record<string, Value> {
  return Object.fromEntries(
    [...kept.entries()].filter(([, each]) => now - each.at < hintsKeptMs).map(([key, each]) => [key, each.value]),
  );
}

/** What autocomplete knows of a connection now: what was read in the last 120 seconds. */
export function completionHints(
  connection: ConnectionId,
  defaultDatabase: string,
  connected: boolean,
): CompletionHints {
  const kept = hintsOf(connection);
  const now = Date.now();
  return { defaultDatabase, connected, collections: fresh(kept.collections, now), fields: fresh(kept.fields, now) };
}

function needKey(need: CompletionNeed): string {
  return need.kind === 'collections' ? need.database : `${need.database}.${need.collection}`;
}

async function readNeed(connection: ConnectionId, need: CompletionNeed): Promise<void> {
  const kept = hintsOf(connection);
  const result = await window.datardo.start({
    feature: featureId(need.kind === 'collections' ? collectionsReadId : sampleReadId),
    target: { kind: 'connection', connection },
    place: 'editor',
    args: { connection, ...need },
  });
  const at = Date.now();
  if (need.kind === 'collections') {
    const names = result.kind === 'read' && Array.isArray(result.result) ? (result.result as readonly string[]) : [];
    kept.collections.set(needKey(need), { value: names, at });
  } else {
    const fields =
      result.kind === 'read' && Array.isArray(result.result) ? (result.result as readonly FieldHint[]) : [];
    kept.fields.set(needKey(need), { value: fields, at });
  }
}

/**
 * Reads what autocomplete would like to know and does not, once at a time for each; `then` is called once something
 * new is known, so that an open list is read again.
 */
export function readNeeds(connection: ConnectionId, needs: readonly CompletionNeed[], then: () => void): void {
  const kept = hintsOf(connection);
  for (const need of needs) {
    const key = `${need.kind} ${needKey(need)}`;
    if (kept.reading.has(key)) {
      continue;
    }
    kept.reading.add(key);
    void readNeed(connection, need)
      .then(then)
      .finally(() => {
        kept.reading.delete(key);
      });
  }
}
