/**
 * What a document tab does (`document.open`): it reads its document (`document.read`) when it opens, after a save and
 * on **Revert**; it keeps its text as the tab's draft while it differs from what was loaded (`tab.restore`); `Ctrl+S`
 * and **Save** start `document.save`, and on a new document `Ctrl+S` and **Insert** start
 * `document.insert-from-tab`, after which the tab becomes the tab of the inserted document.
 */
import { editedValueOf } from '../../../features/document/keep-numeric-types';
import { documentTabText, newDocumentText } from '../../../features/document/open';
import type { CopyFormat } from '../../../features/table/copy-text';
import { emptyDocumentText } from '../../../features/document/insert-template';
import { isRecord } from '../../../features/document/types';
import type { IntentResult } from '../../../shared/bridge';
import type { Json } from '../../../shared/engine-request';
import { featureId, type Place, type TabId } from '../../../shared/ids';
import type { Tab, TabShows } from '../../../shared/state/tabs';
import { appTarget } from '../../../shared/target';
import { startFeature } from '../../shell/intent';
import { flashCopied } from '../../table/copied-flash';
import { documentShows } from './document-actions';
import { changeTabDocument, forgetTabDocument, tabDocumentOf } from './document-tab-store';

/** What a document tab shows. */
export type DocumentShows = Extract<TabShows, { kind: 'document' }>;

/** How long typing pauses before the draft is kept, in milliseconds. */
const draftDelayMs = 500;

const draftTimers = new Map<TabId, ReturnType<typeof setTimeout>>();

function idOf(shows: DocumentShows): Json | undefined {
  if (shows.idJson === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(shows.idJson) as Json;
  } catch {
    // An `_id` saved by hand that is not JSON reads no document: the tab says so with Retry.
    return undefined;
  }
}

function collectionArgs(shows: DocumentShows): { readonly [key: string]: Json } {
  return {
    connection: shows.connection,
    database: shows.database,
    collection: shows.collection,
    ...(shows.view === true ? { view: true } : {}),
  };
}

function start(shows: DocumentShows, feature: string, place: Place | undefined, args: Json): Promise<IntentResult> {
  return window.datardo.start({
    feature: featureId(feature),
    target: {
      kind: 'collection',
      connection: shows.connection,
      database: shows.database,
      collection: shows.collection,
    },
    ...(place === undefined ? {} : { place }),
    args,
  });
}

/** Reads the tab's document; `keepText` keeps what is typed (a draft restored after a crash). */
export async function readTabDocument(tab: TabId, shows: DocumentShows, keepText?: string): Promise<void> {
  const id = idOf(shows);
  changeTabDocument(tab, (before) => ({ ...before, load: { kind: 'loading' }, confirmRevert: false }));
  const result =
    id === undefined
      ? ({ kind: 'failed', message: `The _id ${shows.id} cannot be read.` } as const)
      : await start(shows, 'document.read', undefined, { ...collectionArgs(shows), id });
  changeTabDocument(tab, (before) => {
    if (result.kind !== 'read') {
      const message = result.kind === 'failed' || result.kind === 'refused' ? result.message : '';
      return { ...before, load: { kind: 'error', message } };
    }
    if (!isRecord(result.result)) {
      return { ...before, load: { kind: 'gone' } };
    }
    const document = result.result as Json;
    const loadedText = documentTabText(document);
    const text = keepText ?? loadedText;
    return {
      load: { kind: 'loaded', document },
      text,
      loadedText,
      original: JSON.stringify(document),
      confirmRevert: false,
    };
  });
}

/** Opens what the window keeps of a tab the first time it is drawn: the new document's text, or its document read. */
export function openTabDocument(tab: Tab, shows: DocumentShows): void {
  if (tabDocumentOf(tab.id) !== undefined) {
    return;
  }
  if (shows.newDocument !== undefined) {
    const text = newDocumentText(tab.draft?.text);
    changeTabDocument(tab.id, () => ({
      load: { kind: 'new' },
      text,
      loadedText: emptyDocumentText,
      confirmRevert: false,
    }));
    return;
  }
  void readTabDocument(tab.id, shows, tab.draft?.text);
}

function keepDraft(tab: TabId): void {
  const kept = tabDocumentOf(tab);
  if (kept === undefined) {
    return;
  }
  const draft =
    kept.text === kept.loadedText
      ? null
      : { text: kept.text, ...(kept.original === undefined ? {} : { original: kept.original }) };
  startFeature('tab.restore', { args: { tab, draft } });
}

/** What is typed: the text changes now, and the draft once typing pauses. */
export function typeInTab(tab: TabId, text: string): void {
  const before = tabDocumentOf(tab);
  changeTabDocument(tab, (kept) => ({ ...kept, text }));
  const wasUnsaved = before !== undefined && before.text !== before.loadedText;
  const isUnsaved = before !== undefined && text !== before.loadedText;
  clearTimeout(draftTimers.get(tab));
  if (wasUnsaved !== isUnsaved) {
    keepDraft(tab);
    return;
  }
  draftTimers.set(
    tab,
    setTimeout(() => {
      draftTimers.delete(tab);
      keepDraft(tab);
    }, draftDelayMs),
  );
}

function dropDraft(tab: TabId): Promise<IntentResult> {
  clearTimeout(draftTimers.get(tab));
  return window.datardo.start({ feature: featureId('tab.restore'), target: appTarget, args: { tab, draft: null } });
}

function problemOf(result: IntentResult): string | undefined {
  return result.kind === 'failed' ? result.message : undefined;
}

/** `Ctrl+S` and **Save**: replaces the document with the text, then reads it again. */
export async function saveTab(tab: TabId, shows: DocumentShows, place?: Place): Promise<void> {
  const kept = tabDocumentOf(tab);
  const id = idOf(shows);
  if (kept === undefined || id === undefined) {
    return;
  }
  const original = kept.original === undefined ? {} : { original: JSON.parse(kept.original) as Json };
  const result = await start(shows, 'document.save', place, {
    ...collectionArgs(shows),
    tab,
    id,
    text: kept.text,
    ...original,
  });
  const problem = problemOf(result);
  changeTabDocument(tab, (before) => {
    const { problem: _problem, ...rest } = before;
    return problem === undefined ? rest : { ...rest, problem };
  });
  if (result.kind === 'done') {
    await dropDraft(tab);
    await readTabDocument(tab, shows);
  }
}

/** The `_id` written in the text of a new document, when it has one the window can read. */
function writtenId(text: string): Json | undefined {
  const read = editedValueOf(text, { now: Date.now(), newId: () => '' });
  if (!read.ok || !isRecord(read.edited.value)) {
    return undefined;
  }
  const id = read.edited.value['_id'];
  // `ObjectId()` with nothing in it makes an `_id` the window cannot know before the insert.
  return isRecord(id) && id['$oid'] === '' ? undefined : id;
}

/**
 * `Ctrl+S` and **Insert** on a new document: inserts it, then the tab becomes the tab of the inserted document when
 * its `_id` was written in the text; otherwise it closes, since the `_id` the server gives is in a reply (Q65).
 */
export async function insertFromTab(tab: TabId, shows: DocumentShows, place: Place): Promise<void> {
  const kept = tabDocumentOf(tab);
  if (kept === undefined) {
    return;
  }
  const result = await start(shows, 'document.insert-from-tab', place, {
    ...collectionArgs(shows),
    tab,
    text: kept.text,
  });
  const problem = problemOf(result);
  changeTabDocument(tab, (before) => {
    const { problem: _problem, ...rest } = before;
    return problem === undefined ? rest : { ...rest, problem };
  });
  if (result.kind !== 'done') {
    return;
  }
  const id = writtenId(kept.text);
  await dropDraft(tab);
  if (id !== undefined) {
    startFeature('tab.open', { args: { shows: documentShows(shows, id, shows.view === true) } });
  }
  forgetTabDocument(tab);
  startFeature('tab.close', { args: { tab } });
}

/** **Revert**: loads the document again and drops the changes; with changes, **Discard your changes…?** first. */
export function revertTab(tab: TabId, shows: DocumentShows, confirmed: boolean): void {
  const kept = tabDocumentOf(tab);
  if (kept === undefined) {
    return;
  }
  if (!confirmed && kept.text !== kept.loadedText) {
    changeTabDocument(tab, (before) => ({ ...before, confirmRevert: true }));
    return;
  }
  void dropDraft(tab).then(() => readTabDocument(tab, shows));
}

/** Closes **Discard your changes…?** without dropping anything. */
export function keepChanges(tab: TabId): void {
  changeTabDocument(tab, (before) => ({ ...before, confirmRevert: false }));
}

/** **Copy as**: the document as loaded, in a format (`table.copy-as`). */
export async function copyTabDocument(shows: DocumentShows, document: Json, format: CopyFormat): Promise<void> {
  const result = await start(shows, 'table.copy-as', undefined, {
    ...collectionArgs(shows),
    documents: [document],
    format,
  });
  if (result.kind === 'done') {
    flashCopied();
  }
}
