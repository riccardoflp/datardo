/**
 * What the user does on a Relationship diagram tab (`relation.diagram`): **Sample**, **Refresh** and opening the page
 * sample the collections (`relation.read`, in the main process); **Keys only**, **Reset layout**, moving a box and
 * zooming change the options, which the tab keeps once they settle while it is the active tab; selecting a box or a
 * relation; opening a box's collection; **Copy Mermaid** and **Save SVG…**.
 */
import { diagramChoices, type KeptDiagram } from '../../../features/relation/model/page';
import { placedBoxes, type DiagramSelection } from '../../../features/relation/model/drawing';
import type { ReferenceGraph } from '../../../features/relation/types';
import type { Json } from '../../../shared/engine-request';
import { startFeature } from '../../shell/intent';
import { changeDiagramTab, diagramTabOf, type DiagramTab } from './diagram-store';

/** How long the options stay unchanged before the tab keeps them, in ms (Datardo's choice, as the Server page). */
const settleMs = 600;

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const held = new Set<string>();

function targetOf(state: DiagramTab) {
  return { kind: 'database' as const, connection: state.connection, database: state.database };
}

function keepOptions(tab: string): void {
  timers.delete(tab);
  const state = diagramTabOf(tab);
  if (state !== undefined) {
    startFeature('relation.diagram', {
      place: 'toolbar',
      target: targetOf(state),
      args: { choices: JSON.parse(diagramChoices(state.kept)['diagram'] ?? '{}') as Json },
    });
  }
}

/** Changes the options of a tab; the tab keeps them once they settle. */
export function changeOptions(tab: string, change: (kept: KeptDiagram) => KeptDiagram): void {
  changeDiagramTab(tab, (state) => ({ ...state, kept: change(state.kept) }));
  const timer = timers.get(tab);
  if (timer !== undefined) {
    clearTimeout(timer);
  }
  timers.set(
    tab,
    setTimeout(() => {
      keepOptions(tab);
    }, settleMs),
  );
}

/** The tab stops being shown: options not kept yet wait until it is shown again. */
export function holdOptions(tab: string): void {
  const timer = timers.get(tab);
  if (timer !== undefined) {
    clearTimeout(timer);
    timers.delete(tab);
    held.add(tab);
  }
}

/** The tab is shown again: the options it held are kept now. */
export function keepHeldOptions(tab: string): void {
  if (held.delete(tab)) {
    keepOptions(tab);
  }
}

/** Samples the collections of the tab's database with the size of **Sample**; the boxes are laid out again. */
export function sample(tab: string): void {
  const state = diagramTabOf(tab);
  if (state === undefined) {
    return;
  }
  if (state.kept.moved.length > 0) {
    changeOptions(tab, (kept) => ({ ...kept, moved: [] }));
  }
  changeDiagramTab(tab, (before) => ({ ...before, fitted: false }));
  startFeature('relation.diagram', {
    place: 'toolbar',
    target: targetOf(state),
    args: { tab, sample: state.kept.sample },
  });
}

/** Lays the boxes out again (**Reset layout**, **Keys only**), and fits the drawing in the tab. */
export function layOutAgain(tab: string, change: (kept: KeptDiagram) => KeptDiagram = (kept) => kept): void {
  changeOptions(tab, (kept) => ({ ...change(kept), moved: [] }));
  changeDiagramTab(tab, (state) => ({ ...state, fitted: false }));
}

/** Selects a box or a relation; none clears the selection. */
export function select(tab: string, selection: DiagramSelection | undefined): void {
  changeDiagramTab(tab, ({ selection: _selection, ...state }) =>
    selection === undefined ? state : { ...state, selection },
  );
}

/** Opens the collection tab of a box (`tab.open`). */
export function openCollection(tab: string, collection: string, view: boolean): void {
  const state = diagramTabOf(tab);
  if (state !== undefined) {
    const shows = { kind: 'collection', connection: state.connection, database: state.database, collection };
    startFeature('tab.open', { place: 'toolbar', args: { shows: view ? { ...shows, view: true } : shows } });
  }
}

/** **Copy Mermaid** and **Save SVG…**: the diagram as the page draws it, with the boxes where they are. */
export function exportDiagram(
  tab: string,
  feature: 'relation.export-mermaid' | 'relation.export-svg',
  graph: ReferenceGraph,
): void {
  const state = diagramTabOf(tab);
  if (state === undefined) {
    return;
  }
  const boxes = placedBoxes(graph, state.kept.keysOnly, state.kept.moved);
  startFeature(feature, {
    place: 'toolbar',
    target: targetOf(state),
    args: JSON.parse(
      JSON.stringify({
        connection: state.connection,
        database: state.database,
        graph,
        keysOnly: state.kept.keysOnly,
        ...(feature === 'relation.export-svg' ? { boxes } : {}),
      }),
    ) as Json,
  });
}
