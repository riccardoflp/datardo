/**
 * The islands of the window under the top bar: the rail, the explorer, the main island, the inspector island and the
 * status line, shared as `nav.layout` says, with the gaps that resize them (`nav.resize`) and the keys that move
 * between them (`nav.focus-island`) and show or hide them.
 */
import * as Tooltip from '@radix-ui/react-tooltip';
import '@vscode/codicons/dist/codicon.css';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { isInspectorWanted } from '../../features/nav/inspector';
import { layout, railWidth, rightMargin, type Layout } from '../../features/nav/layout';
import { dragged, widthLimits, type ResizedIsland } from '../../features/nav/resize';
import { navInput, type NavInput } from '../../features/nav/types';
import { useCollectionStatus } from '../query/collection-status';
import { pageKindOf, tabExtras, usePageExtrasChanges } from '../pages';
import { useAppState } from '../state/store';
import { ConnectionSwitcher } from './connection-switcher';
import { Explorer } from './explorer';
import { focusIsland, rememberFocus } from './focus';
import { Inspector } from './inspector';
import { startFeature } from './intent';
import { MainIsland } from './main-island';
import { Rail } from './rail';
import { ResizeGap } from './resize-gap';
import { StatusLine } from './status-line';
import { useShellKeys } from './shell-keys';
import styles from './islands.module.css';

function subscribeToWidth(listener: () => void): () => void {
  window.addEventListener('resize', listener);
  return () => {
    window.removeEventListener('resize', listener);
  };
}

/** The inner width of the window, in px after the zoom. */
function useWindowWidth(): number {
  return useSyncExternalStore(subscribeToWidth, () => window.innerWidth);
}

/** A drag of a gap in progress: the width the pointer gives. */
interface Drag {
  readonly island: ResizedIsland;
  readonly width: number;
}

/** How the window is shared, with a drag in progress followed as it goes. */
function placedIslands(input: NavInput, windowWidth: number, drag: Drag | undefined): Layout {
  const { widths } = input.nav;
  const explorerLimits = widthLimits('explorer', windowWidth);
  const inspectorLimits = widthLimits('inspector', windowWidth);
  const onExplorer = drag?.island === 'explorer' ? dragged(drag.width, explorerLimits) : undefined;
  const onInspector = drag?.island === 'inspector' ? dragged(drag.width, inspectorLimits) : undefined;
  return layout(
    windowWidth,
    {
      wanted: !input.nav.explorerHidden && onExplorer?.hidden !== true,
      width: onExplorer?.hidden === false ? onExplorer.width : widths.explorer,
    },
    {
      wanted: isInspectorWanted(input) && onInspector?.hidden !== true,
      width: onInspector?.hidden === false ? onInspector.width : widths.inspector,
    },
  );
}

/** Puts the focus in the page when the island that held it was hidden. */
function useFocusKeptWhenHidden(shown: boolean): void {
  const before = useRef(shown);
  useEffect(() => {
    if (before.current && !shown && (document.activeElement === null || document.activeElement === document.body)) {
      focusIsland('main');
    }
    before.current = shown;
  }, [shown]);
}

/** The active tab with what its page adds: the count of the status line, what the inspector island shows. */
function withPageExtras(input: NavInput, state: ReturnType<typeof useAppState>): NavInput {
  const tab = input.activeTab;
  const extras = tab.tab === undefined ? undefined : tabExtras[pageKindOf(tab)]?.(state, tab.tab);
  return extras === undefined ? input : { ...input, activeTab: { ...tab, ...extras } };
}

/** The islands. */
export function Islands(): React.JSX.Element {
  const state = useAppState();
  usePageExtrasChanges();
  const input = withPageExtras(useCollectionStatus(state, navInput(state)), state);
  const windowWidth = useWindowWidth();
  const [drag, setDrag] = useState<Drag | undefined>(undefined);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const openSwitcher = useCallback(() => {
    setSwitcherOpen(true);
  }, []);
  const closeSwitcher = useCallback(() => {
    setSwitcherOpen(false);
    focusIsland('connection');
  }, []);
  useShellKeys(openSwitcher);
  const placed = placedIslands(input, windowWidth, drag);
  useFocusKeptWhenHidden(placed.explorer.shown);
  useFocusKeptWhenHidden(placed.inspector.shown);
  const otherOf = (island: ResizedIsland): number | undefined => {
    const other = island === 'explorer' ? placed.inspector : placed.explorer;
    return other.shown ? other.width : undefined;
  };
  const gap = (island: ResizedIsland, width: number): React.JSX.Element => (
    <ResizeGap
      island={island}
      width={width}
      limits={widthLimits(island, windowWidth, otherOf(island))}
      onDrag={(dragging) => {
        setDrag(dragging === undefined ? undefined : { island, width: dragging });
      }}
      onSet={(set) => {
        startFeature('nav.resize', { args: { island, width: set, windowWidth, otherWidth: otherOf(island) ?? null } });
      }}
    />
  );
  const draggingExplorer = drag?.island === 'explorer';
  const draggingInspector = drag?.island === 'inspector';
  return (
    <Tooltip.Provider delayDuration={400}>
      <div
        className={styles['islands']}
        onFocus={(event) => {
          rememberFocus(event.target);
        }}
      >
        <div className={styles['row']} style={{ paddingRight: rightMargin }}>
          <div className={styles['rail-column']} style={{ width: railWidth }}>
            <Rail input={input} />
          </div>
          {placed.explorer.shown ? (
            <Explorer input={input} width={placed.explorer.width} openSwitcher={openSwitcher} />
          ) : null}
          {placed.explorer.shown || draggingExplorer ? gap('explorer', placed.explorer.width) : null}
          <MainIsland input={input} openSwitcher={openSwitcher} />
          {placed.inspector.shown || draggingInspector ? gap('inspector', placed.inspector.width) : null}
          {placed.inspector.shown ? <Inspector input={input} width={placed.inspector.width} /> : null}
        </div>
        <StatusLine input={input} openSwitcher={openSwitcher} />
        {switcherOpen ? <ConnectionSwitcher input={input} onClose={closeSwitcher} /> : null}
      </div>
    </Tooltip.Provider>
  );
}
