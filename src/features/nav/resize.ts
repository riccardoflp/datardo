/**
 * Feature: nav.resize
 *
 * The gap between two islands is a handle: dragging it, double-clicking it or moving it with the keyboard changes the
 * width of the explorer or of the inspector island. The widths are remembered for the window; what a narrow window
 * shows of them is `nav.layout`'s, which never changes them.
 */
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { defaultIslandWidths } from '../../shared/state/nav';
import { explorerMinimum, gapWidth, inspectorMinimum, mainMinimum, railWidth, rightMargin } from './layout';
import { appPlan, appStep, startArgs } from './types';

/** The two islands that can be resized. */
export type ResizedIsland = 'explorer' | 'inspector';

/** The widest the explorer can be, in px (Datardo's choice). */
export const explorerMaximum = 480;
/** The widest the inspector island can be, in px (Datardo's choice). */
export const inspectorMaximum = 640;
/** How far beyond its minimum an island is dragged before it hides, in px (Datardo's choice). */
export const hideBeyondMinimum = 60;
/** How far `Left` and `Right` move a gap that has the focus, in px (Datardo's choice). */
export const keyStep = 16;

/** The widths an island can take in a window. */
export interface WidthLimits {
  readonly minimum: number;
  readonly maximum: number;
  readonly default: number;
}

/** What a drag leaves: the island hidden, or at a width within its limits. */
export type DragResult = { readonly hidden: true } | { readonly hidden: false; readonly width: number };

/**
 * The limits of an island in a window `windowWidth` px wide, where the other island takes `otherWidth` px when it is
 * shown, so that the main island is never left less than 480 px.
 */
export function widthLimits(island: ResizedIsland, windowWidth: number, otherWidth?: number): WidthLimits {
  const [minimum, maximum] =
    island === 'explorer' ? [explorerMinimum, explorerMaximum] : [inspectorMinimum, inspectorMaximum];
  const other = otherWidth === undefined ? 0 : otherWidth + gapWidth;
  const room = windowWidth - railWidth - rightMargin - gapWidth - other - mainMinimum;
  return { minimum, maximum: Math.max(minimum, Math.min(maximum, room)), default: defaultWidth(island) };
}

/** The width an island takes before the user changes it. */
export function defaultWidth(island: ResizedIsland): number {
  return island === 'explorer' ? defaultIslandWidths.explorer : defaultIslandWidths.inspector;
}

/** Where a drag to `width` leaves the island: hidden beyond 60 px under its minimum, else stopped at its limits. */
export function dragged(width: number, limits: WidthLimits): DragResult {
  if (width < limits.minimum - hideBeyondMinimum) {
    return { hidden: true };
  }
  return { hidden: false, width: Math.round(Math.min(limits.maximum, Math.max(limits.minimum, width))) };
}

/** The width a key gives a gap that has the focus, or `undefined` for a key that does not move it. */
export function keyWidth(key: string, width: number, limits: WidthLimits, direction: 1 | -1): number | undefined {
  switch (key) {
    case 'ArrowRight':
      return Math.min(limits.maximum, Math.max(limits.minimum, width + keyStep * direction));
    case 'ArrowLeft':
      return Math.min(limits.maximum, Math.max(limits.minimum, width - keyStep * direction));
    case 'Home':
      return limits.minimum;
    case 'End':
      return limits.maximum;
    case 'Enter':
      return limits.default;
    default:
      return undefined;
  }
}

function islandWords(island: ResizedIsland): string {
  return island === 'explorer' ? 'the explorer' : 'the inspector island';
}

function widthStep(island: ResizedIsland, width: number): ReturnType<typeof appStep> {
  return appStep(`set the width of ${islandWords(island)} to ${String(width)} px`, 'nav.set-widths', {
    [island]: width,
  });
}

/**
 * Sets the width of an island: `args` is `{ island, width, windowWidth?, otherWidth? }` for a drag or a key, the width
 * as dragged; or `{ reset: true }` for **Reset island widths**.
 */
export function plan(_context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  if (args['reset'] === true) {
    return run(
      appPlan('Reset island widths', [
        widthStep('explorer', defaultIslandWidths.explorer),
        widthStep('inspector', defaultIslandWidths.inspector),
      ]),
    );
  }
  const island: ResizedIsland = args['island'] === 'inspector' ? 'inspector' : 'explorer';
  const width = typeof args['width'] === 'number' ? args['width'] : defaultWidth(island);
  const windowWidth = typeof args['windowWidth'] === 'number' ? args['windowWidth'] : Number.POSITIVE_INFINITY;
  const otherWidth = typeof args['otherWidth'] === 'number' ? args['otherWidth'] : undefined;
  const limits = widthLimits(island, windowWidth, otherWidth);
  const result = dragged(width, limits);
  const title = island === 'explorer' ? 'Resize the explorer' : 'Resize the inspector island';
  if (result.hidden) {
    const hide = appStep(
      `hide ${islandWords(island)}`,
      island === 'explorer' ? 'nav.set-explorer' : 'nav.set-inspector',
      { hidden: true },
    );
    return run(appPlan(title, [widthStep(island, limits.minimum), hide]));
  }
  return run(appPlan(title, [widthStep(island, result.width)]));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('nav.resize'), plan };
