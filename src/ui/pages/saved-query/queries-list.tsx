/**
 * `saved-query.show`: **Queries** in the query bar, and the queries list that opens under it, drawn from what
 * `src/features/saved-query/show.ts` returns. The search field has the focus; the down arrow goes from it through the
 * items and the up arrow back; `Enter` or a click on an item closes the list and runs the query; `Esc` closes it and
 * puts the focus back on **Queries**, and so does a click outside. While it is open, it is read again whenever the
 * queries of the connection change.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import type { CollectionQueries } from '../../../features/saved-query/list';
import {
  view,
  type ControlView,
  type QueriesListView,
  type RecentItemView,
  type SavedItemView,
} from '../../../features/saved-query/show';
import { text } from '../../../features/saved-query/text';
import type { Json } from '../../../shared/engine-request';
import type { Place } from '../../../shared/ids';
import { revisionOf } from '../../../shared/state/saved-query';
import type { CollectionRef } from '../../query/collection-reads';
import { useAppState } from '../../state/store';
import { queryOfTab, setOpenList, startOnCollection, useOpenList, whereOf } from './queries-store';
import styles from './queries-list.module.css';

function placeOf(element: string | undefined): Place | undefined {
  const at = element?.indexOf('@') ?? -1;
  return element === undefined || at < 0 ? undefined : (element.slice(at + 1) as Place);
}

/** Starts what a control of the list starts, on the collection of the tab. */
function startControl(ref: CollectionRef, control: ControlView): void {
  const given = control.args;
  const args = (typeof given === 'object' && given !== null && !Array.isArray(given) ? given : {}) as Readonly<
    Record<string, Json>
  >;
  void startOnCollection(ref, control.feature, { ...args, tab: ref.tab }, placeOf(control.element));
}

/** The focusable items of the list, in order: the run button of each item. */
function itemsOf(list: HTMLElement | null): readonly HTMLElement[] {
  return list === null ? [] : [...list.querySelectorAll<HTMLElement>('[data-item-run]')];
}

function ItemMenu(props: {
  readonly item: SavedItemView;
  readonly onStart: (control: ControlView) => void;
}): React.JSX.Element {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={styles['icon-button']} aria-label={`${text.show.more} ${props.item.name}`}>
          <span className="codicon codicon-ellipsis" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles['menu']} data-queries-menu="" align="end">
          {props.item.menu.map((control) => (
            <DropdownMenu.Item
              key={control.label}
              className={styles['menu-item']}
              {...(control.element === undefined ? {} : { 'data-feature': control.element })}
              title={control.tooltip}
              onSelect={() => {
                props.onStart(control);
              }}
            >
              {control.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function SavedItem(props: {
  readonly item: SavedItemView;
  readonly onRun: (control: ControlView) => void;
  readonly onStart: (control: ControlView) => void;
}): React.JSX.Element {
  const { item } = props;
  return (
    <li className={styles['item']}>
      <button
        type="button"
        className={styles['run']}
        data-item-run=""
        data-feature={item.run.element}
        title={item.hover}
        onClick={() => {
          props.onRun(item.run);
        }}
      >
        <span className={styles['name']}>{item.name}</span>
        {item.description === undefined ? null : <span className={styles['description']}>{item.description}</span>}
        <span className={styles['line']}>{item.line}</span>
      </button>
      <span className={styles['tag']} title={item.tag.tooltip.join('\n')}>
        {item.tag.label}
      </span>
      {item.time === undefined ? null : <span className={styles['time']}>{item.time}</span>}
      <ItemMenu item={item} onStart={props.onStart} />
      <button
        type="button"
        className={styles['icon-button']}
        data-feature={item.delete.element}
        aria-label={`${item.delete.label} ${item.name}`}
        title={item.delete.label}
        onClick={() => {
          props.onStart(item.delete);
        }}
      >
        <span className="codicon codicon-trash" aria-hidden="true" />
      </button>
    </li>
  );
}

function RecentItem(props: {
  readonly item: RecentItemView;
  readonly onRun: (control: ControlView) => void;
  readonly onStart: (control: ControlView) => void;
}): React.JSX.Element {
  const { item } = props;
  return (
    <li className={styles['item']}>
      <button
        type="button"
        className={styles['run']}
        data-item-run=""
        data-feature={item.run.element}
        title={item.hover}
        onClick={() => {
          props.onRun(item.run);
        }}
      >
        <span className={styles['line']}>{item.line}</span>
      </button>
      <span className={styles['time']}>{item.time}</span>
      {[
        { control: item.save, icon: 'save' },
        { control: item.remove, icon: 'close' },
      ].map(({ control, icon }) => (
        <button
          key={control.label}
          type="button"
          className={styles['icon-button']}
          data-feature={control.element}
          aria-label={`${control.label} ${item.line}`}
          title={control.label}
          onClick={() => {
            props.onStart(control);
          }}
        >
          <span className={`codicon codicon-${icon}`} aria-hidden="true" />
        </button>
      ))}
    </li>
  );
}

/** Reads the queries of the collection, again whenever those of the connection change. */
function useQueries(ref: CollectionRef): CollectionQueries | undefined {
  const state = useAppState();
  const revision = revisionOf(state.savedQuery, ref.connection);
  const folder = state.connections.saved.find((each) => each.id === ref.connection)?.queriesFolder ?? '';
  const [queries, setQueries] = useState<CollectionQueries | undefined>(undefined);
  useEffect(() => {
    let current = true;
    void startOnCollection(ref, 'saved-query.list', whereOf(ref)).then((result) => {
      if (current && result.kind === 'read') {
        setQueries(result.result as CollectionQueries);
      }
    });
    return () => {
      current = false;
    };
  }, [ref, revision, folder]);
  return queries;
}

/** `Esc` closes the list; the arrows move between the search field and the items. */
function keyInList(
  event: KeyboardEvent<HTMLDivElement>,
  list: {
    readonly box: RefObject<HTMLDivElement | null>;
    readonly field: RefObject<HTMLInputElement | null>;
    readonly onClose: () => void;
  },
): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    list.onClose();
    return;
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
    return;
  }
  const items = itemsOf(list.box.current);
  const at = items.indexOf(document.activeElement as HTMLElement);
  const inField = document.activeElement === list.field.current;
  if (!inField && at < 0) {
    return;
  }
  event.preventDefault();
  if (event.key === 'ArrowDown') {
    items[inField ? 0 : Math.min(at + 1, items.length - 1)]?.focus();
  } else if (at <= 0) {
    list.field.current?.focus();
  } else {
    items[at - 1]?.focus();
  }
}

/** The queries list, open under **Queries**. */
function QueriesList(props: {
  readonly collectionRef: CollectionRef;
  readonly onClose: () => void;
}): React.JSX.Element {
  const ref = props.collectionRef;
  const [search, setSearch] = useState('');
  const [now] = useState(() => Date.now());
  const queries = useQueries(ref);
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const shown = view({
    where: { connection: ref.connection, database: ref.database, collection: ref.collection },
    ...(queries === undefined ? {} : { queries }),
    search,
    now,
  });
  const { onClose } = props;
  useEffect(() => {
    field.current?.focus();
    const outside = (event: PointerEvent): void => {
      const target = event.target as Element | null;
      if (
        box.current !== null &&
        target !== null &&
        !box.current.contains(target) &&
        target.closest('[data-queries-menu]') === null &&
        target.closest('[data-feature="saved-query.show@query-bar"]') === null
      ) {
        onClose();
      }
    };
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
    };
  }, [onClose]);
  const run = (control: ControlView): void => {
    onClose();
    startControl(ref, control);
  };
  const start = (control: ControlView): void => {
    startControl(ref, control);
  };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    keyInList(event, { box, field, onClose });
  };
  return (
    // The keys of the list are handled on its box, which holds the field and the items it moves between.
    <div ref={box} className={styles['list']} role="dialog" aria-label={text.commands.show} onKeyDown={keyDown}>
      <div className={styles['top']}>
        <input
          ref={field}
          className={styles['search']}
          type="search"
          aria-label={shown.search.label}
          placeholder={shown.search.label}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
        <button
          type="button"
          className={styles['button']}
          data-feature={shown.saveCurrent.element}
          onClick={() => {
            void startOnCollection(ref, 'saved-query.save', { ...whereOf(ref), ...queryOfTab(ref) }, 'list');
          }}
        >
          {shown.saveCurrent.label}
        </button>
      </div>
      <Sections collectionRef={ref} shown={shown} onRun={run} onStart={start} />
    </div>
  );
}

/** The message, **Saved** and **Recent**. */
function Sections(props: {
  readonly collectionRef: CollectionRef;
  readonly shown: QueriesListView;
  readonly onRun: (control: ControlView) => void;
  readonly onStart: (control: ControlView) => void;
}): React.JSX.Element {
  const { shown, onRun: run, onStart: start } = props;
  const ref = props.collectionRef;
  return (
    <div className={styles['sections']}>
      {shown.message === undefined ? null : <p className={styles['message']}>{shown.message}</p>}
      {shown.saved === undefined ? null : (
        <section aria-label={shown.saved.title}>
          <h3 className={styles['heading']}>{shown.saved.title}</h3>
          <ul className={styles['items']}>
            {shown.saved.items.map((item) => (
              <SavedItem key={`${item.tag.label} ${item.name}`} item={item} onRun={run} onStart={start} />
            ))}
          </ul>
        </section>
      )}
      {shown.recent === undefined ? null : (
        <section aria-label={shown.recent.title}>
          <div className={styles['heading-row']}>
            <h3 className={styles['heading']}>{shown.recent.title}</h3>
            <button
              type="button"
              className={styles['link']}
              data-feature={shown.recent.clear.element}
              onClick={() => {
                void startOnCollection(ref, 'saved-query.clear-recent', whereOf(ref), 'list');
              }}
            >
              {shown.recent.clear.label}
            </button>
          </div>
          <ul className={styles['items']}>
            {shown.recent.items.map((item, index) => (
              <RecentItem key={`${String(index)} ${item.line}`} item={item} onRun={run} onStart={start} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** **Queries** in the query bar, with the list under it while it is open. */
export function QueriesButton(props: {
  readonly collectionRef: CollectionRef;
  readonly label: string;
  readonly spoken: string;
  readonly tip?: string;
  readonly className: string;
}): React.JSX.Element {
  const ref = props.collectionRef;
  const open = useOpenList() === ref.tab;
  const button = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpenList(undefined);
    button.current?.focus();
  }, []);
  return (
    <span className={styles['anchor']}>
      <button
        ref={button}
        type="button"
        className={props.className}
        data-feature="saved-query.show@query-bar"
        aria-label={props.spoken}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={props.tip}
        onClick={() => {
          setOpenList(open ? undefined : ref.tab);
        }}
      >
        {props.label}
      </button>
      {open ? <QueriesList collectionRef={ref} onClose={close} /> : null}
    </span>
  );
}
