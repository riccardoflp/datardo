/**
 * `tree.show`: the tree island of the explorer, drawn from what its View returns for the current connection — the
 * header, **Pinned**, **Databases** and **Pages of <name>** — with its context menus, its keys (`tree.keyboard`) and
 * the window's memory of each connection's island. Before any connection, and while none is current, it shows what
 * `nav.empty` says.
 */
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { view as emptyView } from '../../features/nav/empty';
import { text as navText } from '../../features/nav/text';
import type { NavInput } from '../../features/nav/types';
import { runnableFeatures } from '../../features/registry';
import { view, type TreeIslandView } from '../../features/tree/show';
import { currentConnection, type TreeInput } from '../../features/tree/types';
import type { ConnectionView } from '../../shared/connection';
import type { AppState } from '../../shared/state';
import { Tree, type TreeHandle } from '../components/tree';
import { useAppState } from '../state/store';
import { useActiveTabReveal, useConnectionReads, useLoadingClock } from './tree-hooks';
import { setFilterOpener } from './tree-commands';
import { useTreeActions } from './tree-use-actions';
import { TreeHeaderBar } from './tree-header';
import { TreeMenu } from './tree-menu';
import { RowContent, rowOf, type IslandRow } from './tree-rows';
import { rememberScroll, scrollOf, useTree, type WindowTree } from './tree-store';
import styles from './tree-island.module.css';

/** The features that are built: an entry of a menu is shown only when the feature it starts is (roadmap, M8). */
const built: ReadonlySet<string> = new Set(runnableFeatures().keys());

function isAvailable(feature: string): boolean {
  return built.has(feature);
}

/** What the tree of the current connection is drawn from. */
interface ConnectionTreeProps {
  readonly state: AppState;
  readonly connection: ConnectionView;
  readonly tree: WindowTree;
  readonly input: TreeInput;
  readonly shown: Extract<TreeIslandView, { kind: 'tree' }>;
}

function ConnectionTree(props: ConnectionTreeProps): React.JSX.Element {
  const { shown } = props;
  const treeRef = useRef<TreeHandle>(null);
  const { actions, header, rowEvents, menu, closeMenu, choose } = useTreeActions({ ...props, treeRef });
  const { openFilter } = header;
  useEffect(() => {
    setFilterOpener(openFilter);
    return () => {
      setFilterOpener(undefined);
    };
  }, [openFilter]);
  const rowContext = { engine: props.connection.engine, press: actions.press, openMenu: actions.openMenu };
  return (
    <div className={styles['island']}>
      <TreeHeaderBar
        header={shown.header}
        press={actions.press}
        applyFilter={header.applyFilter}
        closeFilter={header.closeFilter}
        leaveFilter={header.leaveFilter}
        focusFilter={header.focusFilter}
      />
      <Tree<IslandRow>
        ref={treeRef}
        label={shown.label}
        rows={shown.items.map((item) => rowOf(item, props.connection.engine))}
        focus={props.tree.focus}
        {...rowEvents}
        renderRow={(row) => <RowContent row={row} context={rowContext} />}
      />
      <TreeMenu menu={menu} onChoose={choose} onClose={closeMenu} />
    </div>
  );
}

function Empty(props: { readonly input: NavInput; readonly openSwitcher: () => void }): React.JSX.Element | null {
  const empty = emptyView(props.input);
  if (empty === undefined) {
    return null;
  }
  return (
    <div className={styles['empty']}>
      <p>{empty.line}</p>
      {empty.kind === 'none-current' ? (
        <button type="button" className={styles['small-button']} onClick={props.openSwitcher}>
          {empty.choose.label}
        </button>
      ) : null}
    </div>
  );
}

/** The tree island: the engine's tree of the current connection, or what `nav.empty` says without one. */
export function TreeIsland(props: { readonly input: NavInput; readonly openSwitcher: () => void }): React.JSX.Element {
  const state = useAppState();
  const connection = currentConnection(state);
  const tree = useTree(connection?.id);
  const now = useLoadingClock(tree.island);
  const section = useRef<HTMLElement>(null);
  const input: TreeInput = { state, island: tree.island, now, isAvailable };
  const shown = view(input);
  useConnectionReads(state, connection, tree.island);
  const reveal = useCallback((node: string) => {
    section.current?.querySelector(`[data-row="${CSS.escape(node)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, []);
  useActiveTabReveal(state, connection, reveal);
  const id = connection?.id;
  useLayoutEffect(() => {
    if (id !== undefined && section.current !== null) {
      section.current.scrollTop = scrollOf(id);
    }
  }, [id]);
  return (
    <section
      ref={section}
      className={styles['section']}
      aria-label={navText.islands.treeIsland}
      data-island="tree"
      tabIndex={-1}
      onScroll={(event) => {
        if (id !== undefined) {
          rememberScroll(id, event.currentTarget.scrollTop);
        }
      }}
    >
      {shown.kind === 'tree' && connection !== undefined ? (
        <ConnectionTree
          key={connection.id}
          state={state}
          connection={connection}
          tree={tree}
          input={input}
          shown={shown}
        />
      ) : (
        <Empty input={props.input} openSwitcher={props.openSwitcher} />
      )}
    </section>
  );
}
