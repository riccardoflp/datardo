/**
 * Feature: nav.layout
 *
 * How the islands share the window: the width of each from the width of the window, so that the main island always
 * has room to work in. The remembered widths and the user's choices are inputs only: widening the window gives
 * everything back.
 */

/** The rail's width at the left of the window, in px (`nav.rail`, Datardo's choice). */
export const railWidth = 48;
/** The gap between two islands, in px (`nav.resize`, Datardo's choice). */
export const gapWidth = 8;
/** What the window keeps free at its right, in px. */
export const rightMargin = 8;
/** The narrowest the main island is ever left, in px (Datardo's choice). */
export const mainMinimum = 480;
/** The narrowest the explorer can be, in px (Datardo's choice). */
export const explorerMinimum = 200;
/** The narrowest the inspector island can be, in px (Datardo's choice). */
export const inspectorMinimum = 240;

/** One of the two islands as the layout receives it: whether it is wanted, and its remembered width. */
export interface WantedIsland {
  readonly wanted: boolean;
  readonly width: number;
}

/** One of the two islands as the layout gives it. */
export interface PlacedIsland {
  readonly shown: boolean;
  readonly width: number;
}

/** How the window is shared. */
export interface Layout {
  readonly explorer: PlacedIsland;
  readonly inspector: PlacedIsland;
  readonly main: number;
}

/** The widths of one line of the rules: `undefined` for an island that is not shown. */
type Widths = readonly [explorer: number | undefined, inspector: number | undefined];

/** The width of the main island when the explorer and the inspector island take these widths. */
function mainWidth(windowWidth: number, [explorer, inspector]: Widths): number {
  const taken = (width: number | undefined): number => (width === undefined ? 0 : width + gapWidth);
  return windowWidth - railWidth - rightMargin - taken(explorer) - taken(inspector);
}

/** A width narrowed by what is missing, down to its minimum. */
function narrowed(width: number | undefined, minimum: number, missing: number): number | undefined {
  return width === undefined ? undefined : Math.max(Math.min(width, minimum), width - Math.max(0, missing));
}

/** The width of each island and of the main island, by the first of the rules of the card that fits. */
export function layout(windowWidth: number, explorer: WantedIsland, inspector: WantedIsland): Layout {
  const wantedExplorer = explorer.wanted ? explorer.width : undefined;
  const wantedInspector = inspector.wanted ? inspector.width : undefined;
  const missing = (widths: Widths): number => mainMinimum - mainWidth(windowWidth, widths);
  const lines: readonly (() => Widths)[] = [
    () => [wantedExplorer, wantedInspector],
    () => [wantedExplorer, narrowed(wantedInspector, inspectorMinimum, missing([wantedExplorer, wantedInspector]))],
    () => {
      const atMinimum = wantedInspector === undefined ? undefined : Math.min(wantedInspector, inspectorMinimum);
      return [narrowed(wantedExplorer, explorerMinimum, missing([wantedExplorer, atMinimum])), atMinimum];
    },
    () => [narrowed(wantedExplorer, explorerMinimum, missing([wantedExplorer, undefined])), undefined],
  ];
  for (const line of lines) {
    const widths = line();
    if (mainWidth(windowWidth, widths) >= mainMinimum) {
      return placed(windowWidth, widths, explorer, inspector);
    }
  }
  return placed(windowWidth, [undefined, undefined], explorer, inspector);
}

function placed(windowWidth: number, widths: Widths, explorer: WantedIsland, inspector: WantedIsland): Layout {
  const [explorerWidth, inspectorWidth] = widths;
  return {
    explorer: { shown: explorerWidth !== undefined, width: explorerWidth ?? explorer.width },
    inspector: { shown: inspectorWidth !== undefined, width: inspectorWidth ?? inspector.width },
    main: mainWidth(windowWidth, widths),
  };
}
