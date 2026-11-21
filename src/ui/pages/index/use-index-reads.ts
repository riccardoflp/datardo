/**
 * When the Indexes section reads its lists (`index.show`): both once it is shown, the indexes every second while a
 * change runs or an index is built, the search indexes every 5 seconds while one is built or dropped and for 30
 * seconds after a change, and the indexes again after a write elsewhere to the same connection. Nothing is read while
 * the section is not shown (it is not drawn then) or the window is hidden.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { IndexSectionView } from '../../../features/index/show';
import { useAppState } from '../../state/store';
import { readBoth, readIndexes, readSearchIndexes, type IndexPlace } from './index-actions';

function isVisible(): boolean {
  return document.visibilityState === 'visible';
}

function usePolling(every: number | undefined, read: () => void): void {
  useEffect(() => {
    if (every === undefined) {
      return undefined;
    }
    const timer = setInterval(() => {
      if (isVisible()) {
        read();
      }
    }, every);
    return () => {
      clearInterval(timer);
    };
  }, [every, read]);
}

/** Reads the lists of the section of `place` as its view says. */
export function useIndexReads(place: IndexPlace, polling: IndexSectionView['polling']): void {
  useEffect(() => {
    readBoth(place);
  }, [place]);
  const readList = useCallback(() => {
    void readIndexes(place);
  }, [place]);
  const readSearch = useCallback(() => {
    void readSearchIndexes(place);
  }, [place]);
  usePolling(polling.indexes, readList);
  usePolling(polling.search, readSearch);
  const refreshed = useAppState().runner.refreshed;
  const seen = useRef(refreshed.times);
  useEffect(() => {
    if (refreshed.times === seen.current) {
      return;
    }
    seen.current = refreshed.times;
    if (refreshed.connection === undefined || refreshed.connection === place.connection) {
      void readIndexes(place);
    }
  }, [refreshed, place]);
}
