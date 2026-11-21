/**
 * `relation.diagram`: the Relationship diagram page of a database, drawn from its View: the two rows of the toolbar
 * (`@toolbar`), the error line, the drawing, and the list of the relations (`@list`). The page samples the collections
 * when it is first shown in this run, when **Sample** changes and with **Refresh**; the references are those the main
 * process keeps for the database. A selection asked by the tree (a diagram opened from a collection) is followed once.
 */
import { useEffect, useRef } from 'react';
import { diagramPage, fitMargin, view } from '../../../features/relation/diagram';
import type { DiagramView } from '../../../features/relation/diagram';
import { keptFor } from '../../../features/relation/kept/references';
import type { KeptReferences } from '../../../features/relation/kept/references';
import { keptDiagram } from '../../../features/relation/model/page';
import type { ReferenceGraph } from '../../../features/relation/types';
import type { AppState } from '../../../shared/state';
import { activeTabOf, type TabShows } from '../../../shared/state/tabs';
import { useAppState } from '../../state/store';
import { holdOptions, keepHeldOptions, sample, select } from './diagram-changes';
import { Drawing } from './diagram-drawing';
import { bringIntoView, fit } from './diagram-moves';
import { DiagramList, DiagramToolbar } from './diagram-parts';
import {
  changeDiagramTab,
  diagramTabOf,
  forgetClosedDiagramTabs,
  keepDiagramTab,
  useDiagramTab,
} from './diagram-store';
import styles from './diagram-page.module.css';

type PageShows = Extract<TabShows, { kind: 'page' }>;

/** Keeps the tab's state, made from the options kept with the tab, and samples once when it is made. */
function useTabState(tabId: string, shows: PageShows, app: AppState): void {
  const kept = app.tabs.tabs.find((each) => each.id === tabId)?.memory?.choices;
  useEffect(() => {
    if (diagramTabOf(tabId) === undefined) {
      keepDiagramTab(tabId, {
        connection: shows.connection,
        database: shows.database ?? '',
        kept: keptDiagram(kept),
        offset: { x: fitMargin, y: fitMargin },
        fitted: false,
        selectFollowed: 0,
      });
      sample(tabId);
    }
    keepHeldOptions(tabId);
    return () => {
      holdOptions(tabId);
    };
    // The options kept with the tab are read once, when its state is made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, shows.connection, shows.database]);
}

function graphOf(kept: KeptReferences, shows: PageShows): ReferenceGraph | undefined {
  return keptFor(kept, shows.connection, shows.database ?? '')?.graph;
}

/** Follows the selection the main process asked, once the drawing is there; fits the drawing once laid out. */
function useFollow(tabId: string, app: AppState, shown: DiagramView, area: React.RefObject<HTMLDivElement | null>) {
  const asked = app.relation.diagrams[tabId]?.select;
  const drawn = shown.drawing;
  const tab = useDiagramTab(tabId);
  useEffect(() => {
    const page = area.current?.getBoundingClientRect();
    if (drawn === undefined || tab === undefined || page === undefined) {
      return;
    }
    if (!tab.fitted) {
      fit(tabId, drawn, page);
    }
    if (asked !== undefined && asked.number > tab.selectFollowed) {
      changeDiagramTab(tabId, (state) => ({ ...state, selectFollowed: asked.number }));
      select(tabId, { kind: 'box', name: asked.collection });
      bringIntoView(tabId, drawn, [asked.collection], page);
    }
  }, [tabId, asked, drawn, tab, area]);
}

function DiagramTabPage(props: { readonly tabId: string; readonly shows: PageShows; readonly app: AppState }) {
  const { tabId, shows, app } = props;
  useTabState(tabId, shows, app);
  const tab = useDiagramTab(tabId);
  const area = useRef<HTMLDivElement>(null);
  const reading = app.relation.diagrams[tabId];
  const graph = graphOf(app.relation.kept as unknown as KeptReferences, shows);
  const shown = view({
    database: shows.database ?? '',
    sample: tab?.kept.sample ?? 100,
    keysOnly: tab?.kept.keysOnly ?? false,
    ...(graph === undefined ? {} : { graph }),
    ...(reading?.progress === undefined ? {} : { progress: reading.progress }),
    ...(reading?.error === undefined ? {} : { error: reading.error }),
    moved: tab?.kept.moved ?? [],
    ...(tab?.selection === undefined ? {} : { selection: tab.selection }),
    scale: tab?.kept.scale ?? 1,
  });
  useFollow(tabId, app, shown, area);
  if (tab === undefined) {
    return null;
  }
  const page = (): DOMRect | undefined => area.current?.getBoundingClientRect();
  return (
    <div
      className={styles['page']}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          select(tabId, undefined);
        }
      }}
    >
      <DiagramToolbar tabId={tabId} shown={shown} graph={graph} page={page} />
      {shown.error === undefined ? null : (
        <p className={styles['error']} role="alert">
          {shown.error}
        </p>
      )}
      <div ref={area} className={styles['area']}>
        {shown.drawing === undefined ? (
          <p className={styles['state']}>{shown.state}</p>
        ) : (
          <Drawing tabId={tabId} drawn={shown.drawing} tab={tab} />
        )}
      </div>
      {shown.list === undefined || shown.drawing === undefined ? null : (
        <DiagramList
          tabId={tabId}
          list={shown.list}
          onRelation={(at, from, to) => {
            select(tabId, { kind: 'relation', at });
            const rect = page();
            if (rect !== undefined && shown.drawing !== undefined) {
              bringIntoView(tabId, shown.drawing, [from, to], rect);
            }
          }}
          relations={graph?.relations ?? []}
        />
      )}
    </div>
  );
}

/** The page of the active Relationship diagram tab. */
export function DiagramPage(): React.JSX.Element | null {
  const app = useAppState();
  const active = activeTabOf(app.tabs);
  useEffect(() => {
    forgetClosedDiagramTabs(new Set(app.tabs.tabs.map((tab) => tab.id)));
  }, [app.tabs.tabs]);
  if (active?.shows.kind !== 'page' || active.shows.page !== diagramPage) {
    return null;
  }
  return <DiagramTabPage key={active.id} tabId={active.id} shows={active.shows} app={app} />;
}
