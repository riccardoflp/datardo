/**
 * `nav.inspector`: the island at the right of the main island, for the thing selected in the page. What one selected
 * thing looks like is drawn by the page's feature: the document of a collection tab (`document.inspect`), or its index
 * when the tab shows its Indexes section (`index.inspect`); the key of a keys tab comes with M13 (`key.inspect`).
 * On the Documents section of a collection tab its first row begins with the views **Selection** and **Formatting**,
 * and the Formatting view is drawn by `table.formatting`.
 */
import { useEffect, useRef, useState } from 'react';
import { view, type InspectorTabs } from '../../features/nav/inspector';
import type { InspectorView } from '../../shared/state/nav';
import { text } from '../../features/nav/text';
import type { NavInput } from '../../features/nav/types';
import { extrasKey, inspectors } from '../pages';
import { DocumentInspector } from '../pages/document/document-inspector';
import { IndexInspector } from '../pages/index/index-inspector';
import { FormattingPane } from '../table/formatting-pane';
import { useAppState } from '../state/store';
import { startFeature } from './intent';
import styles from './bars.module.css';

function Loading({ delayMs, label }: { readonly delayMs: number; readonly label: string }): React.JSX.Element | null {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setShown(true);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [delayMs]);
  return shown ? (
    <span className="codicon codicon-loading codicon-modifier-spin" role="img" aria-label={label} />
  ) : null;
}

/** The one thing selected, as the page of the active tab draws it (`document.inspect`, `key.inspect`). */
function SelectedThing({ input }: { readonly input: NavInput }): React.JSX.Element | null {
  const tab = input.activeTab;
  const section = useAppState().tabs.tabs.find((each) => each.id === tab.tab)?.section;
  if (tab.kind === 'collection' && tab.tab !== undefined && section === 'indexes') {
    return <IndexInspector tab={tab.tab} />;
  }
  if (tab.kind === 'collection' && tab.tab !== undefined) {
    return <DocumentInspector tab={tab.tab} />;
  }
  const Drawn = inspectors[extrasKey(tab)];
  return Drawn === undefined || tab.tab === undefined ? null : <Drawn tabId={tab.tab} />;
}

/**
 * The two views as tabs: a click shows one; with the focus on them `Left` and `Right` move between the two, and `Enter`
 * or `Space` shows the one focused. The focus stays on the tab.
 */
function ViewTabs({ views }: { readonly views: InspectorTabs }): React.JSX.Element {
  const list = useRef<HTMLDivElement>(null);
  const all: readonly InspectorView[] = ['selection', 'formatting'];
  return (
    <div
      ref={list}
      className={styles['inspector-tabs']}
      role="tablist"
      aria-label={text.inspector.views}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
          return;
        }
        event.preventDefault();
        const tabs = [...(list.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])];
        const at = tabs.indexOf(event.target as HTMLElement);
        tabs[(at + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length]?.focus();
      }}
    >
      {all.map((each) => (
        <button
          key={each}
          type="button"
          role="tab"
          className={styles['inspector-tab']}
          data-feature="nav.toggle-inspector@inspector"
          aria-selected={views.shown === each}
          tabIndex={views.shown === each ? 0 : -1}
          onClick={() => {
            startFeature('nav.toggle-inspector', { place: 'inspector', args: { view: each } });
          }}
        >
          {views[each]}
        </button>
      ))}
    </div>
  );
}

/** The body of the island under its first row. */
function Body({ input, body }: { readonly input: NavInput; readonly body: InspectorBodyOf }): React.JSX.Element {
  switch (body.kind) {
    case 'nothing-selected':
    case 'several':
      return (
        <div className={styles['inspector-empty']}>
          <strong>{body.heading}</strong>
          <span>{body.line}</span>
        </div>
      );
    case 'loading':
      return <Loading delayMs={body.delayMs} label={body.label} />;
    case 'selected':
      return <SelectedThing input={input} />;
    case 'formatting':
      return input.activeTab.tab === undefined ? <></> : <FormattingPane tab={input.activeTab.tab} />;
    case 'error':
      return (
        <div className={styles['inspector-empty']}>
          <span>{body.message}</span>
        </div>
      );
  }
}

type InspectorBodyOf = Extract<ReturnType<typeof view>, { readonly kind: 'shown' }>['body'];

/** The inspector island, when its View shows it; `width` is the layout's. */
export function Inspector({
  input,
  width,
}: {
  readonly input: NavInput;
  readonly width: number;
}): React.JSX.Element | null {
  const shown = view(input);
  if (shown.kind === 'not-shown') {
    return null;
  }
  const body = shown.body;
  return (
    <aside
      className={styles['inspector']}
      style={{ width }}
      aria-label={text.islands.inspector}
      data-island="inspector"
      data-feature="nav.inspector@inspector"
      tabIndex={-1}
    >
      <div className={styles['inspector-head']}>
        {shown.views === undefined ? (
          <span className={styles['cut']}>{shown.title}</span>
        ) : (
          <ViewTabs views={shown.views} />
        )}
        <button
          type="button"
          className={styles['bar-button']}
          data-feature="nav.toggle-inspector@inspector"
          aria-label={shown.hide.label}
          title={shown.hide.label}
          onClick={() => {
            startFeature(shown.hide.feature, { place: 'inspector', args: { hidden: true } });
          }}
        >
          <span className="codicon codicon-layout-sidebar-right-off" aria-hidden="true" />
        </button>
      </div>
      {shown.views !== undefined && shown.views.shown === 'selection' && shown.title !== '' ? (
        <span className={styles['cut']}>{shown.title}</span>
      ) : null}
      <Body input={input} body={body} />
    </aside>
  );
}
