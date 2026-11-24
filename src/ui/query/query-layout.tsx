/**
 * Where a section of a collection tab draws its query (`query.position`): above its content, or in the query pane at
 * the right of it, with the splitter between them. The place is the setting `datardo.query.position`, the width the
 * one `window.json` remembers; the width of the section decides whether the pane fits, leaving the content 360 px.
 * The query and the content keep their place in the page either way, so that moving the query keeps what is typed,
 * the cursor and the focus where they were: only the layout changes.
 */
import { createContext, useContext, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { iconsAloneUnder } from '../../features/table/show';
import { queryPaneDefault, queryPlace, queryPosition, type QueryPlace } from '../../features/query/position';
import { useAppState } from '../state/store';
import { QuerySplitter } from './query-splitter';
import styles from './query-layout.module.css';

/** Where the query is drawn, with the width of the main island it was decided from. */
export interface PlaceOfQuery extends QueryPlace {
  readonly mainWidth: number;
  /** The main island is narrower than 900 px: the buttons with an icon show it alone. */
  readonly narrow: boolean;
}

function queryPlaceIn(position: 'top' | 'right', mainWidth: number, remembered: number): PlaceOfQuery {
  return { ...queryPlace(position, mainWidth, remembered), mainWidth, narrow: mainWidth < iconsAloneUnder };
}

const above: PlaceOfQuery = queryPlaceIn('top', iconsAloneUnder, queryPaneDefault);

const PlaceContext = createContext<PlaceOfQuery>(above);

/** Where the query of the section is drawn: above the content when the section draws no query layout. */
export function useQueryPlace(): PlaceOfQuery {
  return useContext(PlaceContext);
}

/** The width of an element, followed as it changes. */
export function useWidthOf(element: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const found = element.current;
    if (found === null) {
      return undefined;
    }
    // The observer tells the width as soon as it observes, before the first paint.
    const observer = new ResizeObserver(() => {
      setWidth(found.clientWidth);
    });
    observer.observe(found);
    return () => {
      observer.disconnect();
    };
  }, [element]);
  return width;
}

/** The query of a section and its content, the query above or at the right. */
export function QueryLayout({
  query,
  children,
}: {
  /** The query bar, or the pipeline editor inside it. */
  readonly query: React.ReactNode;
  /** What the section shows under the query, or at its left. */
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const state = useAppState();
  const box = useRef<HTMLDivElement>(null);
  const mainWidth = useWidthOf(box);
  const remembered = state.nav.queryPaneWidth;
  // A drag shows its width until the width remembered changes, which it does when the drag is set.
  const [drag, setDrag] = useState<{ readonly width: number; readonly over: number } | undefined>(undefined);
  if (drag !== undefined && drag.over !== remembered) {
    // The width remembered came back: the drag is over, and is forgotten so that it never shows again.
    setDrag(undefined);
  }
  const dragged = drag?.over === remembered ? drag.width : undefined;
  const onDrag = (width: number | undefined): void => {
    setDrag(width === undefined ? undefined : { width, over: remembered });
  };
  const place = queryPlaceIn(queryPosition(state.settings), mainWidth, dragged ?? remembered);
  const style = { '--query-pane-width': `${String(place.width)}px` } as React.CSSProperties;
  return (
    <PlaceContext.Provider value={place}>
      <div ref={box} className={styles['layout']} data-query-side={place.side} style={style}>
        <div className={styles['query']}>{query}</div>
        {place.side ? <QuerySplitter width={place.width} mainWidth={mainWidth} onDrag={onDrag} /> : null}
        <div className={styles['content']}>{children}</div>
      </div>
    </PlaceContext.Provider>
  );
}
