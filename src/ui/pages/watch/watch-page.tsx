/**
 * `watch.show`: the Watch changes page of the active tab, drawn from the part `watch` of the app's state, which the
 * main process changes as the stream gives change events. Its toolbar (what is watched, the state of the stream,
 * **Pause**, **Stop** (or **Start**), **Start from the last change**, **Clear**, **Export…**), the filters (the type
 * toggles, the search, **Filter**, **Current document on update**, the pre-images), the count, the message, then the
 * list, newest first. Selecting a line, with a click or the arrow keys, shows its change event in the inspector
 * island (`watch.event-detail`); `Enter` moves the focus there; the context menu of a line, or `Shift+F10`, copies.
 */
import { useEffect, useRef, useState } from 'react';
import { view, type PageControl, type WatchPageView } from '../../../features/watch/show';
import { isOpen } from '../../../features/watch/stop';
import { streamArgs } from '../../../features/watch/stream';
import { showText } from '../../../features/watch/text';
import { preImagesFailed } from '../../../features/watch/enable-pre-images';
import type { EventCategory } from '../../../features/watch/types';
import type { Json } from '../../../shared/engine-request';
import { connectionId, featureId, type Place } from '../../../shared/ids';
import type { WatchPage } from '../../../shared/state/watch';
import { activeTabOf } from '../../../shared/state/tabs';
import { useAppState } from '../../state/store';
import { Lines } from './watch-lines';
import { changeWatchTab, startOnPage, useWatchTab, type WatchTab } from './watch-store';
import styles from './watch-page.module.css';

/** The time zone of the window, in minutes east of UTC. */
export function offsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}

/** The page with what the window keeps of it: the change event selected, the search as typed. */
export function shownPage(page: WatchPage, local: WatchTab): WatchPage {
  const { selected: _selected, ...rest } = page;
  return {
    ...rest,
    ...(local.selected === undefined ? {} : { selected: local.selected }),
    ...(local.search === undefined ? {} : { search: local.search }),
  };
}

/** How long the search waits for the typing to stop before the tab remembers it, in milliseconds. */
const searchSettleMs = 300;

function placeOf(element: string): Place {
  return element.slice(element.indexOf('@') + 1) as Place;
}

async function enablePreImages(tab: string, page: WatchPage, control: PageControl): Promise<void> {
  const { database, collection, connection } = page.watched;
  if (database === undefined || collection === undefined) {
    return;
  }
  const result = await window.datardo.start({
    feature: featureId(control.feature),
    target: { kind: 'collection', connection: connectionId(connection), database, collection },
    place: 'toolbar',
  });
  changeWatchTab(tab, (local) => {
    const { preImagesMessage: _gone, ...rest } = local;
    return result.kind === 'failed' ? { ...rest, preImagesMessage: preImagesFailed(result) } : rest;
  });
}

/** Starts a control of the toolbar on the page's tab. */
function startControl(tab: string, page: WatchPage, control: PageControl): void {
  if (control.disabled === true) {
    return;
  }
  if (control.feature === 'watch.enable-pre-images') {
    void enablePreImages(tab, page, control);
    return;
  }
  const args: Json = control.feature === 'watch.export' ? { offsetMinutes: offsetMinutes() } : (control.args ?? null);
  void startOnPage(tab, control.feature, placeOf(control.element), args);
}

/** Opens the stream again with the filter and the option given, when it is open; otherwise remembers them. */
async function applyStream(tab: string, page: WatchPage, change: { filter?: string; fullDocument?: boolean }) {
  if (!isOpen(page)) {
    await startOnPage(tab, 'watch.visible-events:remember', 'toolbar', change);
    return;
  }
  const args = streamArgs(tab, { ...page, ...change }, 'now');
  const result = await startOnPage(tab, 'watch.stream', 'toolbar', args as unknown as Json);
  changeWatchTab(tab, (local) => {
    const { filterMessage: _gone, ...rest } = local;
    return result.kind === 'refused' ? { ...rest, filterMessage: result.message } : rest;
  });
}

function Toolbar(props: { readonly tab: string; readonly page: WatchPage; readonly shown: WatchPageView }) {
  const { toolbar } = props.shown;
  return (
    <div className={styles['toolbar']} role="toolbar" aria-label={showText.command}>
      <span className={styles['watched']}>{toolbar.watched}</span>
      <span className={styles['state']} role="status" data-status={props.page.status}>
        {toolbar.state}
      </span>
      <span className={styles['spacer']} />
      {toolbar.controls.map((control) => (
        <button
          key={control.element}
          type="button"
          className={styles['button']}
          data-feature={control.element}
          title={control.tooltip}
          aria-disabled={control.disabled === true ? true : undefined}
          onClick={() => {
            startControl(props.tab, props.page, control);
          }}
        >
          {control.label}
        </button>
      ))}
    </div>
  );
}

function TypeToggles(props: { readonly tab: string; readonly page: WatchPage; readonly shown: WatchPageView }) {
  const toggle = (type: EventCategory): void => {
    const hidden = props.page.hiddenTypes.includes(type)
      ? props.page.hiddenTypes.filter((each) => each !== type)
      : [...props.page.hiddenTypes, type];
    void startOnPage(props.tab, 'watch.visible-events:remember', 'toolbar', { hiddenTypes: hidden });
  };
  return (
    <div className={styles['toggles']} role="group" aria-label={showText.typesLabel}>
      {props.shown.filters.types.map((type) => (
        <button
          key={type.type}
          type="button"
          className={styles['toggle']}
          data-feature={type.element}
          aria-pressed={type.on}
          title={type.tooltip}
          onClick={() => {
            toggle(type.type);
          }}
        >
          {type.label} <span className={styles['count']}>{type.count}</span>
        </button>
      ))}
    </div>
  );
}

function Search(props: { readonly tab: string; readonly local: WatchTab; readonly shown: WatchPageView }) {
  const { search } = props.shown.filters;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );
  return (
    <input
      type="search"
      className={styles['input']}
      data-feature={search.element}
      placeholder={search.placeholder}
      aria-label={search.placeholder}
      value={props.local.search ?? search.value}
      onChange={(event) => {
        const value = event.target.value;
        changeWatchTab(props.tab, (local) => ({ ...local, search: value }));
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          void startOnPage(props.tab, 'watch.visible-events:remember', 'toolbar', { search: value }).then(() => {
            changeWatchTab(props.tab, (local) => {
              const { search: _typed, ...rest } = local;
              return local.search === value ? rest : local;
            });
          });
        }, searchSettleMs);
      }}
    />
  );
}

function StreamFilters(props: {
  readonly tab: string;
  readonly page: WatchPage;
  readonly local: WatchTab;
  readonly shown: WatchPageView;
}) {
  const { filter, fullDocument, preImages } = props.shown.filters;
  const { tab, page, local } = props;
  const [typed, setTyped] = useState<string | undefined>(undefined);
  const messageId = `watch-filter-${tab}`;
  return (
    <div className={styles['filters']}>
      <label className={styles['filter']} title={filter.tooltip}>
        <span>{filter.label}</span>
        <input
          className={styles['input']}
          data-feature={filter.element}
          placeholder={filter.placeholder}
          value={typed ?? filter.value}
          aria-invalid={local.filterMessage === undefined ? undefined : true}
          aria-describedby={local.filterMessage === undefined ? undefined : messageId}
          spellCheck={false}
          onChange={(event) => {
            setTyped(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void applyStream(tab, page, { filter: typed ?? filter.value }).then(() => {
                setTyped(undefined);
              });
            }
          }}
        />
      </label>
      <label className={styles['check']} title={fullDocument.tooltip}>
        <input
          type="checkbox"
          data-feature={fullDocument.element}
          checked={fullDocument.checked}
          onChange={(event) => {
            void applyStream(tab, page, { fullDocument: event.target.checked });
          }}
        />
        <span>{fullDocument.label}</span>
      </label>
      {preImages === undefined ? null : (
        <span className={styles['preImages']} title={preImages.tooltip}>
          {preImages.text}
          {preImages.enable === undefined ? null : (
            <button
              type="button"
              className={styles['button']}
              data-feature={preImages.enable.element}
              title={preImages.enable.tooltip}
              onClick={() => {
                if (preImages.enable !== undefined) {
                  startControl(tab, page, preImages.enable);
                }
              }}
            >
              {preImages.enable.label}
            </button>
          )}
        </span>
      )}
      {local.filterMessage === undefined ? null : (
        <p id={messageId} className={styles['error']} role="alert">
          {local.filterMessage}
        </p>
      )}
      {local.preImagesMessage === undefined ? null : (
        <p className={styles['error']} role="alert">
          {local.preImagesMessage}
        </p>
      )}
    </div>
  );
}

function TabPage({ tab, page }: { readonly tab: string; readonly page: WatchPage }): React.JSX.Element {
  const state = useAppState();
  const local = useWatchTab(tab);
  const saved = state.connections.saved.find((each) => each.id === page.watched.connection);
  const live = state.connections.live[page.watched.connection]?.server;
  const serverVersion = live?.engine === 'mongodb' ? live.version : page.serverVersion;
  const shown = view({
    page: shownPage(page, local),
    connectionName: saved?.name ?? page.watched.connection,
    readOnly: saved?.readOnly ?? false,
    ...(serverVersion === undefined ? {} : { serverVersion }),
    offsetMinutes: offsetMinutes(),
  });
  return (
    <div className={styles['page']}>
      <Toolbar tab={tab} page={page} shown={shown} />
      <div className={styles['filterBar']}>
        <TypeToggles tab={tab} page={page} shown={shown} />
        <Search tab={tab} local={local} shown={shown} />
      </div>
      <StreamFilters tab={tab} page={page} local={local} shown={shown} />
      <p className={styles['count']} role="status">
        {shown.count}
      </p>
      {shown.message === undefined ? null : (
        <p className={styles['message']} role="alert">
          {shown.message}
        </p>
      )}
      <div className={styles['scroller']}>
        {shown.body.kind === 'list' ? (
          <Lines tab={tab} page={page} shown={shown} body={shown.body} />
        ) : (
          <p className={styles['note']}>{shown.body.text}</p>
        )}
      </div>
    </div>
  );
}

/** The Watch changes page of the active tab. */
export function WatchPage(): React.JSX.Element | null {
  const state = useAppState();
  const active = activeTabOf(state.tabs);
  const page = active === undefined ? undefined : state.watch[active.id];
  return active === undefined || page === undefined ? null : <TabPage key={active.id} tab={active.id} page={page} />;
}
