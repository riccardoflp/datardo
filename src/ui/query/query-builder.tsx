/**
 * The query builder under the bar (`query.builder`): **Match** *all* or *any* **of these conditions**, **Condition**
 * and **Clear** with their icons, one row per condition, and the note when there is something to say. Opened with an
 * empty filter, it shows one empty row with the cursor in its field. In the query pane (`query.position`) **Condition**
 * and **Clear** are on a line of their own under **Match … of these conditions**.
 */
import { useEffect, useRef, useState } from 'react';
import { emptyRow, view, withOperator, type BuilderRows } from '../../features/query/builder';
import type { BuilderRow, Combine } from '../../features/query/builder-filter';
import { runFromBar } from './bar-actions';
import { builderRowsOf, changeRows, clearRows } from './builder-actions';
import { BuilderRowControls, type RowActions } from './builder-row';
import { readHints, type CollectionRef } from './collection-reads';
import type { CollectionTab } from './collection-store';
import styles from './query-bar.module.css';

function useFocusOnOpen(): React.RefObject<HTMLDivElement | null> {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Opened by **Builder**: the cursor goes in the field of the first row. A tab restored open keeps its focus.
    if (document.activeElement?.getAttribute('data-feature') === 'query.builder@query-bar') {
      box.current?.querySelector('input')?.focus();
    }
  }, []);
  return box;
}

function rowActions(ref: CollectionRef, shown: BuilderRows, index: number, set: (rows: readonly BuilderRow[]) => void) {
  const row = shown.rows[index] ?? emptyRow;
  const replaced = (next: BuilderRow): readonly BuilderRow[] =>
    shown.rows.map((each, at) => (at === index ? next : each));
  const actions: RowActions = {
    change: (next) => {
      set(replaced(next));
    },
    operator: (operator) => {
      set(replaced(withOperator(row, operator)));
    },
    remove: () => {
      set(shown.rows.filter((_each, at) => at !== index));
    },
    run: () => {
      runFromBar(ref);
    },
    needFields: () => {
      void readHints(ref);
    },
  };
  return { row, actions };
}

/** The builder of a tab. */
export function QueryBuilder({
  collectionRef,
  collection,
}: {
  readonly collectionRef: CollectionRef;
  readonly collection: CollectionTab;
}): React.JSX.Element {
  const [note, setNote] = useState<string | undefined>(undefined);
  const box = useFocusOnOpen();
  const shown = builderRowsOf(collectionRef.tab, collection);
  const fields = collection.hints.kind === 'read' ? collection.hints.fields : [];
  const built = view({ rows: shown, fields, ...(note === undefined ? {} : { note }) });
  const set = (rows: readonly BuilderRow[], combine: Combine = shown.combine): void => {
    setNote(changeRows(collectionRef.tab, rows, combine));
  };
  const { head } = built;
  return (
    <div ref={box} className={styles['builder']} role="group" aria-label={head.match} data-feature={built.element}>
      <div className={styles['builder-head']}>
        <label>
          {head.match}{' '}
          <select
            className={styles['select']}
            value={head.combine}
            disabled={head.disabled}
            data-feature={built.element}
            onChange={(event) => {
              set(shown.rows, event.target.value as Combine);
            }}
          >
            {head.choices.map((choice) => (
              <option key={choice.combine} value={choice.combine}>
                {choice.label}
              </option>
            ))}
          </select>{' '}
          {head.ofThese}
        </label>
        <span className={styles['spacer']} />
        <button
          type="button"
          className={styles['button']}
          title={head.add.tip}
          aria-label={head.add.name}
          disabled={head.add.disabled}
          data-feature={head.add.element}
          onClick={() => {
            set([...shown.rows, emptyRow]);
          }}
        >
          <span className={`codicon codicon-${head.add.icon}`} aria-hidden="true" />
          <span>{head.add.label}</span>
        </button>
        <button
          type="button"
          className={styles['button']}
          title={head.clear.tip}
          data-feature={head.clear.element}
          onClick={() => {
            setNote(undefined);
            clearRows(collectionRef.tab);
          }}
        >
          <span className={`codicon codicon-${head.clear.icon}`} aria-hidden="true" />
          <span>{head.clear.label}</span>
        </button>
      </div>
      {built.rows.map((rowView, index) => {
        const { row, actions } = rowActions(collectionRef, shown, index, (rows) => {
          set(rows);
        });
        return <BuilderRowControls key={String(index)} view={rowView} row={row} actions={actions} />;
      })}
      {built.note === undefined ? null : <p className={styles['note']}>{built.note}</p>}
    </div>
  );
}
