/**
 * The **Columns** panel (`table.columns`, `@list`): the search box, **Show all**, **Reset**, and one row per column of
 * the page, children indented, each with its checkbox and, at the top level, its pin button. A row is dragged to move
 * its column, but not while a search is typed. `Esc` and a click outside close it; the arrows move through the rows,
 * `Space` ticks, `Alt+↑` and `Alt+↓` move the row among its siblings.
 */
import { useEffect, useRef, useState } from 'react';
import type { LayoutChange } from '../../features/table/arrange-columns';
import { view } from '../../features/table/columns';
import { text } from '../../features/table/text';
import { closeColumnsPanel } from './columns-panel-store';
import { ColumnsRows } from './columns-rows';
import { arrange } from './table-start';
import type { TablePartProps } from './table-parts';
import styles from './table-panels.module.css';

/** Closes the panel on `Esc` and on a click outside it and outside the button that opened it. */
function useClosing(panel: React.RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const outside = (event: PointerEvent): void => {
      const target = event.target as Element | null;
      if (target === null || panel.current?.contains(target) === true) {
        return;
      }
      if (target.closest('[data-feature="table.columns@toolbar"]') !== null) {
        return;
      }
      closeColumnsPanel();
    };
    document.addEventListener('pointerdown', outside, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
    };
  }, [panel]);
}

function focusButton(): void {
  const button = document.querySelector<HTMLElement>('[data-feature="table.columns@toolbar"]');
  button?.focus();
}

/** The panel, open under its button. */
export function ColumnsPanel(props: TablePartProps): React.JSX.Element {
  const [search, setSearch] = useState('');
  const panel = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  useClosing(panel);
  useEffect(() => {
    field.current?.focus();
  }, []);
  const shown = view({ columns: props.columns.columns, layout: props.columns.layout, search });
  const change = (each: LayoutChange): void => {
    arrange(props.collectionRef, props.columns, each, 'table.arrange-columns@list');
  };
  return (
    <div
      ref={panel}
      className={styles['panel']}
      role="dialog"
      aria-label={text.names.columnsPanel}
      data-feature="table.columns@list"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          closeColumnsPanel();
          focusButton();
        }
      }}
    >
      <div className={styles['panel-head']}>
        <input
          ref={field}
          className={styles['search']}
          type="search"
          aria-label={shown.search.placeholder}
          placeholder={shown.search.placeholder}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
        {[
          { button: shown.showAll, change: { kind: 'show-all' } as const },
          { button: shown.reset, change: { kind: 'reset' } as const },
        ].map((each) => (
          <button
            key={each.button.label}
            type="button"
            className={styles['button']}
            data-feature={each.button.element}
            title={each.button.tip}
            onClick={() => {
              change(each.change);
            }}
          >
            {each.button.label}
          </button>
        ))}
      </div>
      {shown.empty === undefined ? (
        <ColumnsRows rows={shown.rows} draggable={shown.draggable} onChange={change} />
      ) : (
        <p className={styles['empty']}>{shown.empty}</p>
      )}
    </div>
  );
}
