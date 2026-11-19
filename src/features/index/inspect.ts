/**
 * Feature: index.inspect
 *
 * Shows the index selected in the Indexes section in full: its definition as the server reports it, the command that
 * creates it, and where it is used. Shown in the inspector island.
 */
import { editableDefinition } from './change-plan';
import { indexCommand, searchIndexCommand } from './command';
import { idIndex } from './hide';
import { badges, dateText, type Badge } from './properties';
import { isSearchType } from './create-search';
import { definitionType } from './search-checks';
import { text } from './text';
import type { IndexInfo, JsonDocument, SearchHost, SearchIndexInfo } from './types';

/** What is selected in the Indexes section, if anything. */
export type InspectedIndex =
  { readonly kind: 'index'; readonly index: IndexInfo } | { readonly kind: 'search'; readonly index: SearchIndexInfo };

/** What the inspector is drawn from. */
export interface InspectState {
  readonly collection: string;
  readonly readOnly: boolean;
  readonly selected?: InspectedIndex;
}

/** An action of the inspector, with the control it is. */
export interface InspectAction {
  readonly label: string;
  readonly tooltip?: string;
  readonly element:
    | 'index.edit@inspector'
    | 'index.duplicate@inspector'
    | 'index.hide@inspector'
    | 'index.drop@inspector'
    | 'index.edit-search@inspector'
    | 'index.drop-search@inspector';
}

/** What the inspector shows. */
export type InspectView =
  | { readonly kind: 'empty'; readonly text: string }
  | {
      readonly kind: 'index';
      readonly name: string;
      readonly badges: readonly Badge[];
      readonly actions: readonly InspectAction[];
      /** The name, the key and every option as the server reports them, drawn as a tree. */
      readonly definition: JsonDocument;
      readonly command: string;
      /** **Usage by member**: only when more than one member reports uses. */
      readonly members: readonly string[];
    }
  | {
      readonly kind: 'search';
      readonly name: string;
      readonly type: string;
      readonly status?: string;
      readonly actions: readonly InspectAction[];
      readonly definition: JsonDocument;
      readonly command: string;
      readonly message?: string;
      readonly hosts: readonly string[];
    };

/** The actions of an index: none for `_id_` or on a read-only connection. */
export function indexActions(index: IndexInfo, readOnly: boolean): readonly InspectAction[] {
  if (readOnly || index.name === idIndex) {
    return [];
  }
  const menu = text.show.menu;
  return [
    { label: menu.edit, tooltip: text.show.editHint, element: 'index.edit@inspector' },
    { label: menu.duplicate, tooltip: text.show.duplicateHint, element: 'index.duplicate@inspector' },
    { label: index.options['hidden'] === true ? menu.unhide : menu.hide, element: 'index.hide@inspector' },
    { label: menu.drop, element: 'index.drop@inspector' },
  ];
}

/** The actions of a search index: none while it is being dropped or on a read-only connection. */
export function searchActions(index: SearchIndexInfo, readOnly: boolean): readonly InspectAction[] {
  if (readOnly || index.status === 'DELETING') {
    return [];
  }
  return [
    { label: text.show.menu.edit, tooltip: text.show.editSearchHint, element: 'index.edit-search@inspector' },
    { label: text.show.menu.drop, element: 'index.drop-search@inspector' },
  ];
}

/** A line of **Status by host**: `mongot1:27028: READY · queryable · new definition BUILDING — <message>`. */
export function hostLine(host: SearchHost): string {
  const parts = [
    host.status ?? text.inspect.unknownStatus,
    ...(host.queryable === true ? [text.inspect.queryable] : []),
    ...(host.staged === undefined ? [] : [text.show.staged(host.staged)]),
  ];
  const message = host.message === undefined || host.message === '' ? '' : ` — ${host.message}`;
  return `${host.host}: ${parts.join(' · ')}${message}`;
}

function memberLines(index: IndexInfo): readonly string[] {
  return (index.members ?? []).map((member) => {
    const where = member.shard === undefined ? member.host : `${member.shard} · ${member.host}`;
    const since = member.since === undefined ? '' : dateText(member.since);
    return text.inspect.memberUses(where, text.show.uses(member.uses), since).trimEnd();
  });
}

function searchView(collection: string, index: SearchIndexInfo, readOnly: boolean): InspectView {
  const type = isSearchType(index.type) ? index.type : (definitionType(index.definition) ?? 'search');
  return {
    kind: 'search',
    name: index.name,
    type: text.search.typeNames[type],
    ...(index.status === undefined ? {} : { status: index.status }),
    actions: searchActions(index, readOnly),
    definition: index.definition,
    command: searchIndexCommand(collection, { name: index.name, type, definition: index.definition }),
    ...(index.message === undefined || index.message === '' ? {} : { message: index.message }),
    hosts: (index.hosts ?? []).map(hostLine),
  };
}

/** Feature: index.inspect — what the inspector shows for the row selected. */
export function view(state: InspectState): InspectView {
  const { selected, collection, readOnly } = state;
  if (selected === undefined) {
    return { kind: 'empty', text: text.inspect.empty };
  }
  if (selected.kind === 'search') {
    return searchView(collection, selected.index, readOnly);
  }
  const { index } = selected;
  return {
    kind: 'index',
    name: index.name,
    badges: badges(index),
    actions: indexActions(index, readOnly),
    definition: { name: index.name, key: index.key, ...index.options },
    command: indexCommand(collection, editableDefinition(index.name, index.key, index.options)),
    members: memberLines(index),
  };
}
