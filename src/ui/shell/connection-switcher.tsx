/**
 * `nav.switch-connection`: the connection switcher, a list to pick from under the connection island. The filter has the
 * focus; `Up` and `Down` move, `Enter` chooses, `Esc` or a click outside closes without choosing.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { currentOf } from '../../features/nav/current-connection';
import { switcherView, type SwitcherRow } from '../../features/nav/switch-connection';
import { text } from '../../features/nav/text';
import type { NavInput } from '../../features/nav/types';
import { ConnectionContextMenu } from '../connection/connection-menu';
import { FolderMenuButton } from '../connection/folder-menu';
import { startFeature } from './intent';
import styles from './explorer.module.css';

/** The narrowest the switcher is, in px (`nav.switch-connection`, Datardo's choice). */
const switcherMinimum = 320;

interface Placed {
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

function placeUnder(): Placed {
  const anchor = document.querySelector('[data-island="connection"]') ?? document.querySelector('[data-island="main"]');
  const rect = anchor?.getBoundingClientRect();
  if (rect === undefined) {
    return { left: 0, top: 0, width: switcherMinimum };
  }
  const isConnectionIsland = anchor?.getAttribute('data-island') === 'connection';
  return {
    left: rect.left,
    top: isConnectionIsland ? rect.bottom + 4 : rect.top,
    width: Math.max(switcherMinimum, isConnectionIsland ? rect.width : 0),
  };
}

/** `Shift+F10` or the menu key in the filter: the menu of the active line (`connection.menu`), under it. */
function openRowMenu(row: SwitcherRow | undefined): void {
  const element = row === undefined ? null : document.getElementById(`connection-${row.connection.id}`);
  const rect = element?.getBoundingClientRect();
  if (element !== null && rect !== undefined) {
    const at = { bubbles: true, cancelable: true, clientX: rect.left + 16, clientY: rect.bottom };
    element.dispatchEvent(new MouseEvent('contextmenu', at));
  }
}

/** A line of the switcher: a saved connection, with its menu. */
function Row(props: {
  readonly row: SwitcherRow;
  readonly active: boolean;
  readonly choose: (row: SwitcherRow) => void;
  readonly onClose: () => void;
}): React.JSX.Element {
  const { row } = props;
  return (
    <ConnectionContextMenu connection={row.connection.id} place="connection-switcher" onChosen={props.onClose}>
      <div
        id={`connection-${row.connection.id}`}
        role="option"
        aria-selected={props.active}
        className={styles['row']}
        onClick={() => {
          props.choose(row);
        }}
      >
        <span className={styles['color']} data-color={row.connection.color} aria-hidden="true" />
        <span className={styles['dot']} data-dot={row.dot} aria-hidden="true" />
        <span className={styles['name']}>{row.connection.name}</span>
        <span className={styles['muted']}>{row.engine}</span>
        {row.connection.readOnly ? <span className={styles['muted']}>{text.connection.readOnly}</span> : null}
        {row.current ? <span className="codicon codicon-check" aria-hidden="true" /> : null}
      </div>
    </ConnectionContextMenu>
  );
}

/** The connection switcher, open until it is closed. */
export function ConnectionSwitcher(props: {
  readonly input: NavInput;
  readonly onClose: () => void;
}): React.JSX.Element {
  const { input, onClose } = props;
  const [filter, setFilter] = useState('');
  const [placed] = useState<Placed>(placeUnder);
  const box = useRef<HTMLDivElement>(null);
  const shown = switcherView(input, filter);
  const rows = shown.groups.flatMap((group) => group.rows);
  const currentIndex = rows.findIndex((row) => row.connection.id === currentOf(input)?.id);
  const [active, setActive] = useState(Math.max(0, currentIndex));
  useEffect(() => {
    const outside = (event: PointerEvent): void => {
      const inMenu = event.target instanceof Element && event.target.closest('[role="menu"]') !== null;
      if (box.current !== null && !box.current.contains(event.target as Node) && !inMenu) {
        onClose();
      }
    };
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
    };
  }, [onClose]);
  const choose = (row: SwitcherRow | undefined): void => {
    if (row !== undefined) {
      startFeature('nav.switch-connection', { place: 'connection-switcher', args: { connection: row.connection.id } });
    }
    onClose();
  };
  const keys = (event: KeyboardEvent<HTMLInputElement>): void => {
    const moves: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
    const step = moves[event.key];
    if (step !== undefined && rows.length > 0) {
      event.preventDefault();
      setActive((active + step + rows.length) % rows.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(rows[active]);
    } else if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') {
      event.preventDefault();
      openRowMenu(rows[active]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };
  return (
    <div
      ref={box}
      className={styles['switcher']}
      style={{ left: placed.left, top: placed.top, width: placed.width }}
      role="dialog"
      aria-label={text.switcher.question}
    >
      <input
        className={styles['filter']}
        aria-label={shown.placeholder}
        placeholder={shown.placeholder}
        value={filter}
        autoFocus
        role="combobox"
        aria-expanded="true"
        aria-controls="connection-switcher-list"
        {...(rows[active] === undefined ? {} : { 'aria-activedescendant': `connection-${rows[active].connection.id}` })}
        onChange={(event) => {
          setFilter(event.target.value);
          setActive(0);
        }}
        onKeyDown={keys}
      />
      <div id="connection-switcher-list" className={styles['list']} role="listbox" aria-label={text.switcher.question}>
        {shown.empty === undefined ? null : <p className={styles['empty']}>{shown.empty}</p>}
        {shown.groups.map((group) => (
          <div key={group.folder ?? ''} role="group" aria-label={group.folder ?? text.switcher.question}>
            {group.folder === undefined ? null : (
              <div className={styles['folder-heading']}>
                <div className={styles['heading']}>{group.folder}</div>
                <FolderMenuButton
                  folder={group.folder}
                  place="connection-switcher"
                  className={styles['small-button']}
                  onChosen={onClose}
                />
              </div>
            )}
            {group.rows.map((row) => (
              <Row key={row.connection.id} row={row} active={rows[active] === row} choose={choose} onClose={onClose} />
            ))}
          </div>
        ))}
      </div>
      <button
        type="button"
        className={styles['add']}
        data-feature={shown.add.element}
        onClick={() => {
          startFeature('connection.add', { place: 'connection-switcher' });
          onClose();
        }}
      >
        <span className="codicon codicon-add" aria-hidden="true" /> {shown.add.label}
      </button>
    </div>
  );
}
