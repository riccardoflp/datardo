/**
 * The header of the tree island (`tree.show`): **Filter**, shown as on while a filter applies, **Refresh** and
 * **Collapse all**; and the field of the filter while it is open (`tree.filter`), which the tree follows 300 ms after
 * the last key. `Escape` in the field empties it, closes it and gives the focus back to the tree; `Down` moves to the
 * first node shown.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { filterDelayMs } from '../../features/tree/filter';
import type { TreeHeader } from '../../features/tree/show';
import type { Control } from '../../features/tree/types';
import styles from './tree-island.module.css';

/** What the header is given. */
export interface HeaderProps {
  readonly header: TreeHeader;
  readonly press: (control: Control) => void;
  /** The filter's text applies: 300 ms after the last key, or at once when it is emptied by a key or a button. */
  readonly applyFilter: (typed: string) => void;
  /** `Escape` in the field: it is emptied and closed, and the focus goes back to the tree. */
  readonly closeFilter: () => void;
  /** `Down` in the field: the focus goes to the first node shown. */
  readonly leaveFilter: () => void;
  /** Asks for the focus in the field: it changes each time **Filter** or `Ctrl+F` opens it. */
  readonly focusFilter: number;
}

function HeaderButton(props: {
  readonly control: Control;
  readonly icon: string;
  readonly pressed?: boolean;
  readonly press: (control: Control) => void;
}): React.JSX.Element {
  const { control } = props;
  return (
    <button
      type="button"
      className={styles['header-button']}
      {...(control.element === undefined ? {} : { 'data-feature': control.element })}
      {...(props.pressed === undefined ? {} : { 'aria-pressed': props.pressed })}
      aria-label={control.label}
      title={control.label}
      onClick={() => {
        props.press(control);
      }}
    >
      <span className={`codicon codicon-${props.icon}`} aria-hidden="true" />
    </button>
  );
}

function FilterField(props: HeaderProps & { readonly field: NonNullable<TreeHeader['field']> }): React.JSX.Element {
  const { field } = props;
  const [typed, setTyped] = useState(field.text);
  const input = useRef<HTMLInputElement>(null);
  const hint = useId();
  // The latest way to apply the text: the timer of the last key must not start again each time the island is drawn.
  const apply = useRef(props.applyFilter);
  useEffect(() => {
    apply.current = props.applyFilter;
  });
  useEffect(() => {
    if (typed === field.text) {
      return undefined;
    }
    const timer = setTimeout(() => {
      apply.current(typed);
    }, filterDelayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [typed, field.text]);
  useEffect(() => {
    if (props.focusFilter > 0) {
      input.current?.focus();
    }
  }, [props.focusFilter]);
  const empty = (): void => {
    setTyped('');
    props.applyFilter('');
  };
  return (
    <div className={styles['filter']}>
      <div className={styles['filter-row']}>
        <input
          ref={input}
          type="search"
          className={styles['field']}
          data-feature="tree.filter@tree"
          aria-label={field.label}
          aria-describedby={hint}
          placeholder={field.placeholder}
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setTyped('');
              props.closeFilter();
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              props.leaveFilter();
            }
          }}
        />
        <HeaderButton control={field.clear} icon="close" press={empty} />
      </div>
      <p id={hint} className={styles['hint']}>
        {field.hint}
      </p>
    </div>
  );
}

/** The header of the tree island, and the field of the filter while it is open. */
export function TreeHeaderBar(props: HeaderProps): React.JSX.Element {
  const { header, press } = props;
  return (
    <>
      <div className={styles['header']}>
        <HeaderButton control={header.filter} icon="filter" pressed={header.filter.on} press={press} />
        <HeaderButton control={header.refresh} icon="refresh" press={press} />
        <HeaderButton control={header.collapseAll} icon="collapse-all" press={press} />
      </div>
      {header.field === undefined ? null : <FilterField {...props} field={header.field} />}
    </>
  );
}
