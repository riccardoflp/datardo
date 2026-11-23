/**
 * What the Definition and the Validation sections start through the bridge: the options of the collection or view
 * (`manage.read-options`) when the section is first shown, on **Reload** and after a save; the sample of a collection
 * without rules (`manage.validation:sample`); and **Save** (`manage.edit-view`, `manage.edit-validation`), whose
 * refusal or failure is shown under the editor while the text stays unsaved.
 */
import { notApplied } from '../../../features/manage/definition';
import type { CollectionOptions } from '../../../features/manage/read-options';
import type { SampleSummary } from '../../../features/manage/generate-json-schema';
import type { IntentResult } from '../../../shared/bridge';
import type { Json } from '../../../shared/engine-request';
import { featureId, type ConnectionId, type Place, type TabId } from '../../../shared/ids';
import { startFeature } from '../../shell/intent';
import { changeSection, sectionOf } from './section-store';

/** The collection or view of a section's tab. */
export interface SectionPlace {
  readonly tab: TabId;
  readonly connection: ConnectionId;
  readonly database: string;
  readonly collection: string;
  readonly view: boolean;
}

/** Which section: the Definition of a view, or the Validation of a collection. */
export type SectionKind = 'definition' | 'validation';

function start(place: SectionPlace, feature: string, args: Json, from?: Place): Promise<IntentResult> {
  return window.datardo.start({
    feature: featureId(feature),
    target: {
      kind: 'collection',
      connection: place.connection,
      database: place.database,
      collection: place.collection,
    },
    ...(from === undefined ? {} : { place: from }),
    args: { connection: place.connection, database: place.database, collection: place.collection, ...(args as object) },
  });
}

function messageOf(result: IntentResult): string {
  return result.kind === 'failed' || result.kind === 'refused' ? result.message : '';
}

/**
 * Reads the options again; the text typed is forgotten when `forget` is set (**Reload**, a save). What the section
 * shows stays until the answer comes, which replaces it at once: nothing reads *Reading…* meanwhile but a first read.
 */
export async function readSection(place: SectionPlace, forget: boolean): Promise<void> {
  changeSection(place.tab, (before) => ({ ...before, asked: true, confirmReload: false }));
  const typedBefore = sectionOf(place.tab).typed;
  const result = await start(place, 'manage.read-options', {});
  changeSection(place.tab, (before) => {
    const { typed: _typed, refused: _refused, sample: _sample, ...rest } = before;
    // A text typed while the options were read is the user's newer work: it stays.
    const kept = before.typed === typedBefore ? rest : { ...rest, typed: before.typed };
    return {
      ...(forget ? kept : before),
      read:
        result.kind === 'read'
          ? { kind: 'read', options: result.result as CollectionOptions }
          : { kind: 'error', message: messageOf(result) },
    };
  });
}

/** Reads the sample of a collection without rules, once. */
export async function readSample(place: SectionPlace): Promise<void> {
  changeSection(place.tab, (before) => ({ ...before, sample: { kind: 'reading' } }));
  const result = await start(place, 'manage.validation:sample', {});
  changeSection(place.tab, (before) => ({
    ...before,
    sample:
      result.kind === 'read'
        ? { kind: 'read', summary: result.result as SampleSummary }
        : { kind: 'error', message: messageOf(result) },
  }));
}

/** The text typed in the editor. */
export function typeInSection(tab: TabId, typed: string): void {
  changeSection(tab, (before) => ({ ...before, typed }));
}

/** **Discard changes**: the text as it was read, or as generated. */
export function discardSection(tab: TabId): void {
  changeSection(tab, (before) => {
    const { typed: _typed, refused: _refused, ...rest } = before;
    return { ...rest, confirmReload: false };
  });
}

/** **Reload**: asks first when the text was changed. */
export function reloadSection(place: SectionPlace, changed: boolean): void {
  if (changed) {
    changeSection(place.tab, (before) => ({ ...before, confirmReload: true }));
    return;
  }
  void readSection(place, true);
}

/** Closes **Discard your changes…?** without reading again. */
export function keepSectionChanges(tab: TabId): void {
  changeSection(tab, (before) => ({ ...before, confirmReload: false }));
}

/**
 * **Save** (`Ctrl+S`): the text of the editor to `manage.edit-view` or `manage.edit-validation`. Once done, the
 * options are read again; a refusal or an error of MongoDB stays under the editor until the text changes.
 */
export async function saveSection(place: SectionPlace, kind: SectionKind, text: string, from?: Place): Promise<void> {
  const result =
    kind === 'definition'
      ? await start(place, 'manage.edit-view', { definition: text }, from)
      : await start(place, 'manage.edit-validation', { rules: text }, from);
  switch (result.kind) {
    case 'done':
      await readSection(place, true);
      return;
    case 'refused':
      changeSection(place.tab, (before) => ({ ...before, refused: { text, message: result.message } }));
      return;
    case 'failed':
      changeSection(place.tab, (before) => ({ ...before, refused: { text, message: notApplied(result.message) } }));
      return;
    case 'cancelled':
    case 'read':
      return;
  }
}

/** Shows a section of the tab: `documents`, `definition` or `validation` (`tab.open` on the tab's collection). */
export function showSection(place: SectionPlace, section: string, element: Place): void {
  startFeature('tab.open', {
    place: element,
    args: {
      shows: {
        kind: 'collection',
        connection: place.connection,
        database: place.database,
        collection: place.collection,
        ...(place.view ? { view: true } : {}),
      },
      section,
    },
  });
}

/** Whether the options of a section were asked for since its tab opened. */
export function isAsked(tab: TabId): boolean {
  return sectionOf(tab).asked;
}
