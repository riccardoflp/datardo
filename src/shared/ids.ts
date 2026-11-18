/**
 * The identifiers Datardo's parts share, each a type of its own so that one is never passed for another (R6.4).
 */

/** A card's identifier, `area.action`: `document.delete`. */
export type FeatureId = string & { readonly __brand: 'FeatureId' };

/** A refusal's code, `area.action/reason`: `document.delete/read-only`. */
export type RefusalCode = string & { readonly __brand: 'RefusalCode' };

/** The identifier of a saved connection. */
export type ConnectionId = string & { readonly __brand: 'ConnectionId' };

/** The identifier of an open tab. */
export type TabId = string & { readonly __brand: 'TabId' };

/** The identifier of one piece of work in progress (a read, a plan, a task). */
export type WorkId = string & { readonly __brand: 'WorkId' };

/** The identifier of a question or a confirmation the runner has opened in the window. */
export type QuestionId = string & { readonly __brand: 'QuestionId' };

/** Where a control is (feature-contract.md, "Places"). */
export type Place =
  | 'top-bar'
  | 'rail'
  | 'connection-island'
  | 'connection-switcher'
  | 'tree'
  | 'tree-menu'
  | 'tab-strip'
  | 'tab-menu'
  | 'scope-bar'
  | 'section-bar'
  | 'inspector'
  | 'status-line'
  | 'home'
  | 'notification'
  | 'tray'
  | 'app-menu'
  | 'toolbar'
  | 'query-bar'
  | 'table'
  | 'column-menu'
  | 'row-menu'
  | 'cell-menu'
  | 'selection-bar'
  | 'list'
  | 'item-menu'
  | 'editor'
  | 'form'
  | 'dialog'
  | 'empty-state'
  | 'paging'
  | 'chart';

/** A card's identifier, from text written whole at the call (`featureId('document.delete')`). */
export function featureId(identifier: string): FeatureId {
  return identifier as FeatureId;
}

/** A connection's identifier, from the text stored for it. */
export function connectionId(identifier: string): ConnectionId {
  return identifier as ConnectionId;
}

/** A tab's identifier, from the text made for it. */
export function tabId(identifier: string): TabId {
  return identifier as TabId;
}
