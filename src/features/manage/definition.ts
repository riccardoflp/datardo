/**
 * Feature: manage.definition
 *
 * The Definition section of a view's tab: the source and the pipeline of the view in an editor, in mongosh syntax,
 * where they are changed and saved (`manage.edit-view`). `view` says what the section shows from its state; `plan` is
 * what **Edit view definition…** starts: the view's tab opens on this section. The toolbar and the states are shared
 * with the Validation section (`manage.validation`).
 */
import type { Json } from '../../shared/engine-request';
import { run, type After, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { appPlan } from '../nav/types';
import { viewDefinition, type CollectionOptions } from './read-options';
import { text } from './text';
import {
  connectionTarget,
  editorText,
  knownPlace,
  namespaceOf,
  pickCollection,
  placeOf,
  type KnownPlace,
  type ManagePlace,
} from './types';

/** The section's name, as `tab.open` and `tab.activate` take it. */
export const definitionSection = 'definition';

/** What `manage.read-options` gave the section: nothing yet, an error, or the options. */
export type OptionsRead =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'read'; readonly options: CollectionOptions };

/** A save that was refused: the text it was for, and the message shown under the editor until the text changes. */
export interface RefusedSave {
  readonly text: string;
  readonly message: string;
}

/** What the Definition section is drawn from. */
export interface DefinitionState {
  readonly database: string;
  readonly view: string;
  readonly readOnly: boolean;
  readonly read: OptionsRead;
  /** The text typed and not saved, kept while the tab is open. */
  readonly typed?: string;
  readonly refused?: RefusedSave;
}

/** The toolbar of a section that edits a definition. */
export interface SectionToolbar {
  readonly save?: {
    readonly label: string;
    readonly key: string;
    readonly enabled: boolean;
    readonly element: 'manage.edit-view@toolbar' | 'manage.edit-validation@toolbar';
  };
  readonly discard?: { readonly label: string; readonly enabled: boolean };
  /** With unsaved changes, **Reload** asks first. */
  readonly reload: { readonly label: string; readonly confirm?: { readonly title: string; readonly button: string } };
}

/** What a section that edits a definition shows. */
export interface SectionView {
  readonly state: 'loading' | 'error' | 'gone' | 'ready';
  /** The text of the state: *Reading…*, the server's message, *The view shop.recent no longer exists.* */
  readonly message?: string;
  readonly toolbar: SectionToolbar;
  readonly editor?: {
    readonly text: string;
    /** The text **Discard changes** puts back. */
    readonly initial: string;
    readonly readOnly: boolean;
    readonly save?: 'manage.edit-view@editor' | 'manage.edit-validation@editor';
  };
  /** The note above the editor (the rules generated). */
  readonly note?: string;
  /** The message of the last save that was refused. */
  readonly refused?: string;
  readonly statusLine?: string;
}

/** The ids of the elements of a section's save. */
export interface SaveElements {
  readonly toolbar: 'manage.edit-view@toolbar' | 'manage.edit-validation@toolbar';
  readonly editor: 'manage.edit-view@editor' | 'manage.edit-validation@editor';
}

/** What the editor and the toolbar of a section are drawn from, once the definition was read. */
export interface EditorInput {
  readonly readOnly: boolean;
  /** The text of what the server has: **Save** is enabled while the text differs from it. */
  readonly read: string;
  /** The text the editor starts with: what was read, or the rules generated. */
  readonly initial: string;
  readonly typed?: string;
  readonly refused?: RefusedSave;
  readonly elements: SaveElements;
  readonly discardTitle: string;
}

/** Feature: manage.definition — the toolbar, the editor and the message under it, shared with the Validation section. */
export function editorView(input: EditorInput): Omit<SectionView, 'state'> {
  const current = input.typed ?? input.initial;
  const changed = current !== input.initial;
  const { section } = text;
  const toolbar: SectionToolbar = {
    ...(input.readOnly
      ? {}
      : {
          save: {
            label: section.save,
            key: section.saveShortcut,
            enabled: current !== input.read,
            element: input.elements.toolbar,
          },
          discard: { label: section.discard, enabled: changed },
        }),
    reload: {
      label: section.reload,
      ...(changed ? { confirm: { title: input.discardTitle, button: section.discardButton } } : {}),
    },
  };
  return {
    toolbar,
    editor: {
      text: current,
      initial: input.initial,
      readOnly: input.readOnly,
      ...(input.readOnly ? {} : { save: input.elements.editor }),
    },
    ...(input.refused !== undefined && input.refused.text === current ? { refused: input.refused.message } : {}),
    ...(input.readOnly ? { statusLine: section.readOnly } : {}),
  };
}

/** The toolbar while nothing can be edited: **Reload** only. */
export const reloadOnly: SectionToolbar = { reload: { label: text.section.reload } };

/** Feature: manage.definition — the text of a view's definition in the editor. */
export function definitionText(options: Readonly<Record<string, Json>>): string {
  const { viewOn, pipeline } = viewDefinition(options);
  return editorText({ viewOn, pipeline });
}

/** Feature: manage.definition — what the Definition section shows. */
export function view(state: DefinitionState): SectionView {
  const namespace = namespaceOf(state.database, state.view);
  const { read } = state;
  switch (read.kind) {
    case 'loading':
      return { state: 'loading', message: text.section.loading, toolbar: reloadOnly };
    case 'error':
      return { state: 'error', message: read.message, toolbar: reloadOnly };
    case 'read':
      break;
  }
  if (read.options.kind === 'not-found') {
    return { state: 'gone', message: text.section.viewGone(namespace), toolbar: reloadOnly };
  }
  const definition = definitionText(read.options.options);
  return {
    state: 'ready',
    ...editorView({
      readOnly: state.readOnly,
      read: definition,
      initial: definition,
      ...(state.typed === undefined ? {} : { typed: state.typed }),
      ...(state.refused === undefined ? {} : { refused: state.refused }),
      elements: { toolbar: 'manage.edit-view@toolbar', editor: 'manage.edit-view@editor' },
      discardTitle: text.section.discardTitle(namespace),
    }),
  };
}

/** The message under the editor when MongoDB refused a save: *Not applied: …*. */
export function notApplied(message: string): string {
  return text.definition.notApplied(message);
}

/** The After that opens a collection's tab on one of its sections. */
export function openSection(place: KnownPlace, section: string, view: boolean): After {
  const shows = {
    kind: 'collection',
    connection: place.connection.id,
    database: place.database,
    collection: place.collection,
    ...(view ? { view: true } : {}),
  };
  return { kind: 'start', feature: featureId('tab.open'), target: connectionTarget(place), args: { shows, section } };
}

/**
 * The place without its collection when the collection is known to be of the other kind (a collection where a view is
 * edited, or the reverse), so that one of the right kind is picked.
 */
export function otherKind(place: ManagePlace, other: boolean): ManagePlace {
  if (place.view !== other) {
    return place;
  }
  const { collection: _collection, view: _view, tab: _tab, ...rest } = place;
  return rest;
}

/** Feature: manage.definition — **Edit view definition…**: the view's tab opens on its Definition section. */
export function plan(context: Context, answers: Answers): Outcome {
  const started = placeOf(context, answers);
  if (started === undefined) {
    throw new Error('manage.definition needs a connection.');
  }
  const onView = otherKind(started, false);
  const picking = pickCollection(onView, answers, text.section.pickView, ['view']);
  if (picking !== undefined) {
    return picking;
  }
  const place = knownPlace(onView);
  const title = text.section.definitionTitle(namespaceOf(place.database, place.collection));
  return run(appPlan(title, [], [openSection(place, definitionSection, true)]));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('manage.definition'), plan };
