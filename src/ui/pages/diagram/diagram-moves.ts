/**
 * What moves the drawing of a Relationship diagram as a whole (`relation.diagram`): bringing boxes into view, **Fit**,
 * which also runs once when the drawing is first drawn after a layout, and the zoom of **+** and **−** around the
 * middle of the page.
 */
import { fitMargin, fitScale, zoomed } from '../../../features/relation/diagram';
import type { DrawingView } from '../../../features/relation/model/drawing';
import { changeDiagramTab, diagramTabOf } from './diagram-store';

/** Brings boxes into view: the middle of them at the middle of the page. */
export function bringIntoView(tabId: string, drawn: DrawingView, names: readonly string[], page: DOMRect): void {
  const boxes = drawn.boxes.filter((box) => names.includes(box.name));
  if (boxes.length === 0) {
    return;
  }
  const left = Math.min(...boxes.map((box) => box.left));
  const right = Math.max(...boxes.map((box) => box.left + box.width));
  const top = Math.min(...boxes.map((box) => box.top));
  const bottom = Math.max(...boxes.map((box) => box.top + box.height));
  changeDiagramTab(tabId, (state) => ({
    ...state,
    offset: {
      x: page.width / 2 - ((left + right) / 2) * state.kept.scale,
      y: page.height / 2 - ((top + bottom) / 2) * state.kept.scale,
    },
  }));
}

/** Fits the drawing in the page: **Fit**, and once when it is first drawn after a layout. */
export function fit(tabId: string, drawn: DrawingView, page: DOMRect | undefined): void {
  if (page === undefined) {
    return;
  }
  const scale = fitScale(drawn, page);
  changeDiagramTab(tabId, (state) => ({
    ...state,
    kept: { ...state.kept, scale },
    fitted: true,
    offset: {
      x: (page.width - drawn.width * scale) / 2,
      y: Math.max(fitMargin, (page.height - drawn.height * scale) / 2),
    },
  }));
}

/** Zooms by a step around the middle of the page (**+**, **−**). */
export function zoomStep(tabId: string, factor: number, page: DOMRect | undefined): void {
  const state = diagramTabOf(tabId);
  if (state === undefined || page === undefined) {
    return;
  }
  const after = zoomed(state.kept.scale, factor);
  const ratio = after / state.kept.scale;
  const middle = { x: page.width / 2, y: page.height / 2 };
  changeDiagramTab(tabId, (before) => ({
    ...before,
    kept: { ...before.kept, scale: after },
    offset: { x: middle.x - (middle.x - before.offset.x) * ratio, y: middle.y - (middle.y - before.offset.y) * ratio },
  }));
}
