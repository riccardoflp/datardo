/**
 * The explorer: the connection island (`nav.connection-island`, `nav.linked-connection`) and the tree island, which
 * shows the pins of the current connection (`nav.pin`) and, before any connection, what `nav.empty` says. The engine's
 * tree is `tree.show`'s (M8).
 */
import { islandElement, switcherElement, view as islandView } from '../../features/nav/connection-island';
import type { CurrentConnectionView } from '../../features/nav/connection-island';
import { currentOf } from '../../features/nav/current-connection';
import { view as emptyView } from '../../features/nav/empty';
import { pinLabels } from '../../features/nav/pin';
import { text } from '../../features/nav/text';
import type { NavInput } from '../../features/nav/types';
import type { ConnectionId } from '../../shared/ids';
import { ConnectionMenuButton } from '../connection/connection-menu';
import { startFeature } from './intent';
import styles from './explorer.module.css';

/** What the explorer is given: the nav input, its width, and how to open the connection switcher. */
export interface ExplorerProps {
  readonly input: NavInput;
  readonly width: number;
  readonly openSwitcher: () => void;
}

function onConnection(connection: ConnectionId): { readonly kind: 'connection'; readonly connection: ConnectionId } {
  return { kind: 'connection', connection };
}

function Current(props: {
  readonly island: CurrentConnectionView;
  readonly input: NavInput;
  readonly openSwitcher: () => void;
}): React.JSX.Element {
  const { island, input } = props;
  const current = currentOf(input);
  const target = current === undefined ? undefined : onConnection(current.id);
  return (
    <>
      <button
        type="button"
        className={styles['current']}
        data-feature={switcherElement}
        data-focus-first
        aria-haspopup="dialog"
        onClick={props.openSwitcher}
      >
        <span className={styles['first-line']}>
          <span className={styles['dot']} data-dot={island.dot} aria-hidden="true" />
          <span className={styles['name']} title={island.name}>
            {island.name}
          </span>
          {island.readOnly === undefined ? null : <span className={styles['badge']}>{island.readOnly}</span>}
          <span className="codicon codicon-chevron-down" aria-hidden="true" />
        </span>
        <span className={styles['second-line']} data-slow={island.slow ? 'true' : undefined} title={island.lineTooltip}>
          {island.line}
        </span>
      </button>
      <div className={styles['island-buttons']}>
        {island.buttons.map((button) => (
          <button
            key={button.label}
            type="button"
            className={styles['small-button']}
            data-feature={button.element}
            onClick={() => {
              startFeature(button.feature, { place: 'connection-island', ...(target === undefined ? {} : { target }) });
            }}
          >
            {button.label}
          </button>
        ))}
        {current === undefined ? null : (
          <ConnectionMenuButton connection={current.id} place="connection-island" className={styles['small-button']} />
        )}
      </div>
      {island.linked.map((row) => (
        <button
          key={row.kind === 'connection' ? row.connection : 'more'}
          type="button"
          className={styles['linked']}
          data-feature={row.element}
          title={row.kind === 'connection' ? row.tooltip : undefined}
          onClick={() => {
            if (row.kind === 'more') {
              props.openSwitcher();
            } else {
              startFeature('nav.switch-connection', {
                place: 'connection-island',
                args: { connection: row.connection },
              });
            }
          }}
        >
          {row.kind === 'connection' ? (
            <>
              <span className={styles['dot']} data-dot={row.dot} aria-hidden="true" /> {row.name} · {row.engine}
            </>
          ) : (
            row.label
          )}
        </button>
      ))}
    </>
  );
}

function ConnectionIsland(props: { readonly input: NavInput; readonly openSwitcher: () => void }): React.JSX.Element {
  const island = islandView(props.input);
  const color = currentOf(props.input)?.color;
  return (
    <section
      className={styles['connection-island']}
      data-color={color}
      aria-label={text.islands.connectionIsland}
      data-island="connection"
      data-feature={islandElement}
      tabIndex={-1}
    >
      {island.kind === 'no-connection-saved' ? (
        <>
          <p className={styles['heading']}>{island.heading}</p>
          <button
            type="button"
            className={styles['small-button']}
            data-feature="connection.add@tree"
            data-focus-first
            onClick={() => {
              startFeature(island.add.feature, { place: 'tree' });
            }}
          >
            {island.add.label}
          </button>
        </>
      ) : island.kind === 'none-current' ? (
        <button
          type="button"
          className={styles['current']}
          data-feature={switcherElement}
          data-focus-first
          aria-haspopup="dialog"
          onClick={props.openSwitcher}
        >
          <span className={styles['first-line']}>
            <span className={styles['name']}>{island.heading}</span>
            <span className="codicon codicon-chevron-down" aria-hidden="true" />
          </span>
        </button>
      ) : (
        <Current island={island} input={props.input} openSwitcher={props.openSwitcher} />
      )}
    </section>
  );
}

function TreeIsland(props: { readonly input: NavInput; readonly openSwitcher: () => void }): React.JSX.Element {
  const empty = emptyView(props.input);
  const current = currentOf(props.input);
  const pins = current === undefined ? [] : (props.input.nav.pins[current.id] ?? []);
  const labels = pinLabels(pins);
  return (
    <section className={styles['tree-island']} aria-label={text.islands.treeIsland} data-island="tree" tabIndex={-1}>
      {empty === undefined ? null : (
        <div className={styles['empty']}>
          <p>{empty.line}</p>
          {empty.kind === 'none-current' ? (
            <button type="button" className={styles['small-button']} onClick={props.openSwitcher}>
              {empty.choose.label}
            </button>
          ) : null}
        </div>
      )}
      {labels.length === 0 ? null : (
        <div role="group" aria-label={text.tree.pinned}>
          <div className={styles['section-heading']}>{text.tree.pinned}</div>
          {labels.map((label, index) => (
            <div key={`${label.name} ${label.rest ?? ''} ${String(index)}`} className={styles['pin']}>
              {label.name} {label.rest === undefined ? null : <span className={styles['muted']}>{label.rest}</span>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** The explorer, as wide as the layout gives it. */
export function Explorer({ input, width, openSwitcher }: ExplorerProps): React.JSX.Element {
  return (
    <div className={styles['explorer']} style={{ width }} aria-label={text.islands.explorer} role="group">
      <ConnectionIsland input={input} openSwitcher={openSwitcher} />
      <TreeIsland input={input} openSwitcher={openSwitcher} />
    </div>
  );
}
