/**
 * Feature: query.position
 *
 * Whether the query of a collection tab (the filter with its buttons, the builder, the sort, the projection, skip and
 * limit, or the stages of a pipeline) sits above the table or in the query pane at its right, and how wide that pane
 * is. One place and one width for every collection tab: the place is the setting `datardo.query.position`, the width
 * is kept in `window.json` with the widths of the islands. The pane takes its room from the table only, never from
 * another island (D71): when the table would be left less than 360 px, the query is above for the moment.
 */
import type { Json } from '../../shared/engine-request';
import {
  noDanger,
  run,
  type Answers,
  type AppStep,
  type Context,
  type OperationFeature,
  type Outcome,
  type Plan,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { defaultQueryPaneWidth } from '../../shared/state/nav';
import type { SettingsState } from '../../shared/state/settings';
import { activeTabOf } from '../../shared/state/tabs';
import { writeSettingAction } from '../settings/change';
import { setting } from '../settings/read';
import { text } from './text';

/** Where the query is put: above the table, or at its right. */
export type QueryPosition = 'top' | 'right';

/** The narrowest the query pane is, in px (Mongoster's). */
export const queryPaneMinimum = 260;
/** The widest the query pane is, in px (Mongoster's). */
export const queryPaneMaximum = 900;
/** The width of the query pane before the user changes it, in px (Mongoster's). */
export const queryPaneDefault = defaultQueryPaneWidth;
/** The splitter between the table and the query pane, in px (Datardo's choice, as the gaps between islands). */
export const splitterWidth = 8;
/** What the table keeps at least beside the query pane, in px (Mongoster's). */
export const resultsMinimum = 360;
/** How far `Left` and `Right` move the splitter, in px, and with `Shift` (Mongoster's). */
export const keySteps = { plain: 20, shift: 60 } as const;

/** The setting that keeps the place. */
export const positionSetting = 'datardo.query.position';

/** The sections of a collection tab that have the query bar, so the toggle (`undefined` is Documents). */
const sectionsWithQuery: ReadonlySet<string> = new Set(['documents', 'schema', 'chart']);

/** The place chosen: the setting, read as `top` when it is neither `top` nor `right` (`settings.read`). */
export function queryPosition(settings: SettingsState): QueryPosition {
  return setting(settings, positionSetting);
}

/** A width within 260 and 900 px; one that is not a number counts as 380 px. */
export function paneWidth(width: unknown): number {
  return typeof width === 'number' && Number.isFinite(width)
    ? Math.round(Math.min(queryPaneMaximum, Math.max(queryPaneMinimum, width)))
    : queryPaneDefault;
}

/** The widest the pane can be in a main island `mainWidth` px wide: what leaves the table 360 px, within the limits. */
export function widestPane(mainWidth: number): number {
  return Math.max(queryPaneMinimum, Math.min(queryPaneMaximum, mainWidth - splitterWidth - resultsMinimum));
}

/** Where the query is drawn, how wide its pane is, and what the toggle says. */
export interface QueryPlace {
  /** The query is in the pane at the right of the table; otherwise above it. */
  readonly side: boolean;
  /** The width of the pane, in px, when it is shown. */
  readonly width: number;
  /** The toggle is pressed: the place chosen is the right, shown or not. */
  readonly pressed: boolean;
  /** The toggle's tooltip, which is also its name for a screen reader. */
  readonly tip: string;
}

/**
 * Where the query is drawn, from the place chosen, the width of the main island and the width remembered: with `right`
 * the pane is as wide as remembered but leaves the table 360 px; under 260 px the query is above for the moment, with
 * the toggle pressed and a tooltip that says why. The remembered width is not changed by this.
 */
export function queryPlace(position: QueryPosition, mainWidth: number, remembered: number): QueryPlace {
  const wanted = paneWidth(remembered);
  if (position === 'top') {
    return { side: false, width: wanted, pressed: false, tip: text.position.toRight };
  }
  const width = Math.min(wanted, mainWidth - splitterWidth - resultsMinimum);
  return width >= queryPaneMinimum
    ? { side: true, width, pressed: true, tip: text.position.toTop }
    : { side: false, width: wanted, pressed: true, tip: text.position.tooNarrow };
}

/** The width a drag of the splitter gives: stopped at 260 px, at 900 px and at the width that leaves the table 360 px. */
export function draggedWidth(width: number, mainWidth: number): number {
  return Math.round(Math.min(widestPane(mainWidth), Math.max(queryPaneMinimum, width)));
}

/**
 * The width a key gives the splitter that has the focus, or `undefined` for a key that does not move it: `Left` widens
 * the pane by 20 px and `Right` narrows it, by 60 px with `Shift`; `Home` gives the minimum, `End` the widest the main
 * island allows, `Enter` the default.
 */
export function keyedWidth(key: string, shift: boolean, width: number, mainWidth: number): number | undefined {
  const step = shift ? keySteps.shift : keySteps.plain;
  switch (key) {
    case 'ArrowLeft':
      return draggedWidth(width + step, mainWidth);
    case 'ArrowRight':
      return draggedWidth(width - step, mainWidth);
    case 'Home':
      return queryPaneMinimum;
    case 'End':
      return widestPane(mainWidth);
    case 'Enter':
      return draggedWidth(queryPaneDefault, mainWidth);
    default:
      return undefined;
  }
}

/** Whether the active tab is a collection tab showing a section with the query bar. */
function showsQueryBar(state: AppState): boolean {
  const active = activeTabOf(state.tabs);
  return active?.shows.kind === 'collection' && sectionsWithQuery.has(active.section ?? 'documents');
}

/**
 * Whether Go to offers `query.position:right` (while the query is above) or `query.position:top` (while it is at the
 * right): on a collection tab that shows a section with the query bar.
 */
export function isOffered(state: AppState, id: string): boolean {
  const position = queryPosition(state.settings);
  const wanted = id === 'query.position:right' ? 'right' : 'top';
  return showsQueryBar(state) && position !== wanted;
}

function step(stepText: string, action: string, args: Json): AppStep {
  return { kind: 'app', text: stepText, action, args };
}

function positionPlan(title: string, steps: readonly AppStep[]): Plan {
  return {
    title,
    steps,
    danger: noDanger,
    undo: { cannot: text.position.nothingRecorded },
    publishes: false,
    after: [],
  };
}

/** What the feature was started with: a place (the variant of its command, or `{ position }`), or `{ width }`. */
function startedWith(answers: Answers): { readonly position?: QueryPosition; readonly width?: number } {
  const args = answers['args'];
  if (args === 'top' || args === 'right') {
    return { position: args };
  }
  if (typeof args !== 'object' || args === null) {
    return {};
  }
  const record = args as Record<string, unknown>;
  const position = record['position'];
  const width = record['width'];
  return {
    ...(position === 'top' || position === 'right' ? { position } : {}),
    ...(typeof width === 'number' && Number.isFinite(width) ? { width } : {}),
  };
}

/**
 * Feature: query.position
 *
 * One app step: for the toggle and Go to, `set datardo.query.position to right` (or `top`, which removes the setting
 * from `settings.json`, since it is the default), the step `settings.change` writes; for the splitter,
 * `set the width of the query pane to 420 px`. Nothing is written to a deployment, nothing runs.
 */
export function plan(_context: Context, answers: Answers): Outcome {
  const asked = startedWith(answers);
  if (asked.position !== undefined) {
    const title = asked.position === 'right' ? text.position.toRight : text.position.toTop;
    const value = asked.position === 'top' ? null : asked.position;
    return run(
      positionPlan(title, [
        step(text.position.setPosition(asked.position), writeSettingAction, { name: positionSetting, value }),
      ]),
    );
  }
  if (asked.width !== undefined) {
    const width = paneWidth(asked.width);
    return run(
      positionPlan(text.position.resize, [step(text.position.setWidth(width), 'nav.set-widths', { queryPane: width })]),
    );
  }
  return run(positionPlan(text.position.resize, []));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('query.position'), plan };
