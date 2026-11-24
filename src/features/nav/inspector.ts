/**
 * Feature: nav.inspector
 *
 * The inspector island, at the right of the main island, for the thing selected in the page, and, beside the table of
 * a collection, for the formatting rules that color it. It belongs to the window, not to a tab: whether the user hid
 * it and the view chosen are one choice for every tab; what it shows follows the active tab.
 */
import type { InspectorView as ChosenView } from '../../shared/state/nav';
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
  | { readonly kind: 'selected' }
  /** The Formatting view: the formatting rules of the active tab's collection (`table.formatting`). */
  | { readonly kind: 'formatting' };

/** The two views as tabs of the first row, on a page that offers Formatting, the one shown marked. */
export interface InspectorTabs {
  readonly selection: string;
  readonly formatting: string;
  readonly shown: ChosenView;
}

/** The inspector island: not shown, or shown with its first row and its body. */
export type InspectorView =
  | { readonly kind: 'not-shown'; readonly why: 'nothing-to-inspect' | 'hidden-by-user' }
  | {
      readonly kind: 'shown';
      readonly title: string;
      readonly hide: { readonly label: string; readonly feature: 'nav.toggle-inspector' };
      /** On a page that offers Formatting: the views as tabs; what is selected is then the first line of Selection. */
      readonly views?: InspectorTabs;
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

/**
 * Whether the page of the active tab offers the Formatting view: the Documents section of a collection tab, in
 * **Find** and in **Aggregate** (`table.formatting`).
 */
export function offersFormatting(tab: ActiveTab): boolean {
  return tab.kind === 'collection' && (tab.section ?? 'documents') === 'documents';
}

/** The view the island shows: Formatting when it is chosen and the page offers it, else the selection. */
export function shownView(input: NavInput): ChosenView {
  return input.nav.inspectorView === 'formatting' && offersFormatting(input.activeTab) ? 'formatting' : 'selection';
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
  const views = offersFormatting(input.activeTab)
    ? { selection: text.inspector.selection, formatting: text.inspector.formatting, shown: shownView(input) }
    : undefined;
  return {
    kind: 'shown',
    title: inspection.selected === 1 ? (inspection.title ?? '') : '',
    hide: { label: text.inspector.hide, feature: 'nav.toggle-inspector' },
    ...(views === undefined ? {} : { views }),
    body: views?.shown === 'formatting' ? { kind: 'formatting' } : body(inspection),
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
