/**
 * Feature: nav.inspector
 *
 * The inspector island, at the right of the main island, for the thing selected in the page. It belongs to the
 * window, not to a tab: whether the user hid it is one choice for every tab; what it shows follows the active tab.
 */
import type { ActiveTab, NavInput } from './types';
import { text } from './text';

/** How long a read runs before the island shows the sign that turns, in ms (Datardo's choice). */
export const loadingSignDelayMs = 200;

/** What the island shows under its first row. */
export type InspectorBody =
  | { readonly kind: 'nothing-selected'; readonly heading: string; readonly line: string }
  | { readonly kind: 'several'; readonly heading: string; readonly line: string }
  | { readonly kind: 'loading'; readonly label: string; readonly delayMs: number }
  | { readonly kind: 'error'; readonly message: string; readonly retry: string }
  /** One thing selected: the page's feature draws it. */
  | { readonly kind: 'selected' };

/** The inspector island: not shown, or shown with its first row and its body. */
export type InspectorView =
  | { readonly kind: 'not-shown'; readonly why: 'nothing-to-inspect' | 'hidden-by-user' }
  | {
      readonly kind: 'shown';
      readonly title: string;
      readonly hide: { readonly label: string; readonly feature: 'nav.toggle-inspector' };
      readonly body: InspectorBody;
    };

/**
 * The pages that always have something to inspect, known from what the tab shows: a collection tab inspects its
 * documents (`document.inspect`). The main process has no inspection of the window's page, and offers
 * `nav.toggle-inspector` on these.
 */
const inspectingPages: ReadonlySet<ActiveTab['kind']> = new Set(['collection']);

/** Whether the page of the active tab has something to inspect: a page with nothing to inspect gives no inspection. */
export function hasSomethingToInspect(tab: ActiveTab): boolean {
  return tab.inspection !== undefined || inspectingPages.has(tab.kind);
}

/** Whether the inspector island is wanted: the page has something to inspect and the user did not hide it. */
export function isInspectorWanted(input: NavInput): boolean {
  return hasSomethingToInspect(input.activeTab) && !input.nav.inspectorHidden;
}

/** What the inspector island shows; whether a narrow window leaves it room is `nav.layout`'s. */
export function view(input: NavInput): InspectorView {
  const inspection = input.activeTab.inspection;
  if (inspection === undefined) {
    return { kind: 'not-shown', why: 'nothing-to-inspect' };
  }
  if (input.nav.inspectorHidden) {
    return { kind: 'not-shown', why: 'hidden-by-user' };
  }
  return {
    kind: 'shown',
    title: inspection.selected === 1 ? (inspection.title ?? '') : '',
    hide: { label: text.inspector.hide, feature: 'nav.toggle-inspector' },
    body: body(inspection),
  };
}

function body(inspection: NonNullable<ActiveTab['inspection']>): InspectorBody {
  if (inspection.error !== undefined) {
    return { kind: 'error', message: inspection.error, retry: text.inspector.retry };
  }
  if (inspection.selected === 0) {
    return { kind: 'nothing-selected', heading: text.inspector.nothingSelected, line: inspection.emptyLine };
  }
  if (inspection.selected > 1) {
    return { kind: 'several', heading: text.inspector.selected(inspection.selected), line: inspection.emptyLine };
  }
  if (inspection.loadingSince !== undefined) {
    return { kind: 'loading', label: text.inspector.loading, delayMs: loadingSignDelayMs };
  }
  return { kind: 'selected' };
}
