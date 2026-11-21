/**
 * The Explain section of a collection tab (`explain.show`): the query bar, whose run button reads **Explain**, with
 * the pipeline editor in Aggregate; the toolbar with the title and **Raw**; then the summary of the explain, or the raw
 * output (`explain.raw`), or what takes their place while it runs, after an error or a cancel. The explain runs each
 * time the section is shown and each time **Explain** is pressed, here or in the pipeline editor, which makes the tab
 * active again.
 */
import { useEffect, useRef } from 'react';
import { view, type ExplainSectionState } from '../../../features/explain/show';
import { text } from '../../../features/explain/text';
import type { CollectionRef } from '../../query/collection-reads';
import type { CollectionTab } from '../../query/collection-store';
import { QueryBar } from '../../query/query-bar';
import { useAppState } from '../../state/store';
import { PipelinePane } from '../aggregate/pipeline-editor';
import type { CollectionPageState } from '../collection/use-collection';
import { createSuggested, runExplain, toggleRaw, toggleRows } from './explain-actions';
import { ExplainRaw } from './explain-raw';
import { useExplainMemory, type ExplainMemory } from './explain-store';
import { ExplainSummary } from './explain-summary';
import styles from './explain.module.css';

/** The state of the section, from what the window keeps of it and the tab. */
export function sectionState(memory: ExplainMemory, collection: CollectionTab, page: CollectionPageState) {
  const state: ExplainSectionState = {
    kind: collection.query.mode === 'aggregate' ? 'pipeline' : 'find',
    running: memory.running,
    ...(memory.result === undefined ? {} : { result: memory.result }),
    ...(memory.error === undefined ? {} : { error: memory.error }),
    cancelled: memory.cancelled,
    raw: memory.raw,
    toggled: memory.toggled,
    readOnly: page.readOnly,
    view: page.view,
  };
  return state;
}

/** Runs the explain once connected, and again each time the tab is made active while the section is shown. */
function useExplainRuns(ref: CollectionRef, connected: boolean): void {
  const lastActive = useAppState().tabs.tabs.find((tab) => tab.id === ref.tab)?.lastActive;
  const seen = useRef(lastActive);
  useEffect(() => {
    if (connected) {
      void runExplain(ref);
    }
  }, [ref, connected]);
  useEffect(() => {
    if (lastActive === seen.current) {
      return;
    }
    seen.current = lastActive;
    if (connected) {
      void runExplain(ref, 'query-bar');
    }
  }, [ref, connected, lastActive]);
}

/** The Explain section. */
export function ExplainSection({
  collectionRef: ref,
  collection,
  page,
}: {
  /** The collection of the tab, the same object while the tab shows it. */
  readonly collectionRef: CollectionRef;
  readonly collection: CollectionTab;
  readonly page: CollectionPageState;
}): React.JSX.Element {
  const memory = useExplainMemory(ref.tab);
  const shown = view(sectionState(memory, collection, page));
  useExplainRuns(ref, page.connectionState === 'connected');
  const run = { label: text.section, element: 'explain.run@query-bar', run: () => void runExplain(ref, 'query-bar') };
  return (
    <section className={styles['section']} aria-label={text.section}>
      <QueryBar
        collectionRef={ref}
        collection={collection}
        instead={run}
        pipeline={<PipelinePane collectionRef={ref} collection={collection} readOnly={page.readOnly} />}
      />
      <div className={styles['toolbar']} role="toolbar" aria-label={text.section}>
        <h2 className={styles['title']}>{shown.title}</h2>
        <button
          type="button"
          className={styles['button']}
          data-feature={shown.raw.element}
          disabled={!shown.raw.enabled}
          onClick={() => {
            toggleRaw(ref);
          }}
        >
          {shown.raw.label}
        </button>
      </div>
      <div className={styles['body']}>
        {shown.running === undefined ? null : <p className={styles['message']}>{shown.running}</p>}
        {shown.message === undefined ? null : <p className={styles['message']}>{shown.message}</p>}
        {shown.cancelled === undefined ? null : (
          <p className={styles['message']}>
            {shown.cancelled.text}{' '}
            <button
              type="button"
              className={styles['button']}
              data-feature={shown.cancelled.element}
              onClick={() => void runExplain(ref, 'query-bar')}
            >
              {shown.cancelled.runAgain}
            </button>
          </p>
        )}
        {shown.summary === undefined ? null : (
          <ExplainSummary
            summary={shown.summary}
            onCreate={(keys) => {
              createSuggested(ref, keys);
            }}
          />
        )}
        {shown.output === undefined ? null : (
          <ExplainRaw
            output={shown.output}
            onToggle={(next) => {
              toggleRows(ref, next);
            }}
          />
        )}
      </div>
    </section>
  );
}
