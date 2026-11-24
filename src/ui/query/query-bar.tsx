/**
 * The query bar of a collection tab (`query.bar`). Above the table: the mode switch, **Filter**, the run button and
 * **Reset**, the toggle of the query's place; **Builder**, **Queries**, **Explain**, **Code**, and apart **Update
 * many…** and **Delete many…**; the builder when open; **Sort**, **Project**, **Skip**, **Limit**; the error line. In
 * the query pane at the right of the table (`query.position`) the same controls are one under the other, each label
 * above its box. Every part keeps its place in the page in both layouts, so that moving the query keeps the focus and
 * the cursor. While a cell or a column header of the table is dragged, the zones of `query.drag` cover the fields.
 */
import { useEffect } from 'react';
import { view, type BarField } from '../../features/query/bar';
import { view as dragView } from '../../features/query/drag';
import { BarFields, type FieldsInput } from './bar-fields';
import { BarButtons, type RunInstead } from './bar-buttons';
import type { CollectionRef } from './collection-reads';
import type { CollectionTab } from './collection-store';
import { draggedOver, endDrag, useDragged } from './drag-data';
import { ErrorLine } from './error-line';
import { ModeMenu } from './mode-menu';
import { QueryBuilder } from './query-builder';
import { useQueryPlace } from './query-layout';
import styles from './query-bar.module.css';

export type { RunInstead } from './bar-buttons';

/** A drag ends however it ends: dropped, let go outside a zone, or stopped with `Esc`. */
function useDragEnd(): void {
  useEffect(() => {
    const ended = (): void => {
      endDrag();
    };
    window.addEventListener('dragend', ended);
    window.addEventListener('drop', ended);
    return () => {
      window.removeEventListener('dragend', ended);
      window.removeEventListener('drop', ended);
    };
  }, []);
}

/** Some fields of the bar, or nothing when there are none (in Aggregate). */
function Fields({ input, fields }: { readonly input: FieldsInput; readonly fields: readonly BarField[] }) {
  return fields.length === 0 ? null : <BarFields input={{ ...input, fields }} />;
}

/** The query bar. */
export function QueryBar({
  collectionRef,
  collection,
  pipeline,
  instead,
  section,
  writable,
}: {
  readonly collectionRef: CollectionRef;
  readonly collection: CollectionTab;
  /** The pipeline editor of the aggregate area, drawn under the row in Aggregate. */
  readonly pipeline?: React.ReactNode;
  /** What the run button and `Enter` start in place of the query. */
  readonly instead?: RunInstead;
  /** The section the bar is in: only the Documents section has **Explain**, **Code** and the writes. */
  readonly section?: 'documents' | 'schema' | 'chart';
  /** The collection can be changed: not a view, not through a read-only connection. */
  readonly writable?: boolean;
}): React.JSX.Element {
  const place = useQueryPlace();
  const bar = view({
    query: collection.query,
    running: collection.running,
    ...(section === undefined ? {} : { section }),
    ...(writable === undefined ? {} : { writable }),
    place,
  });
  const what = useDragged();
  useDragEnd();
  const dragged =
    what === undefined || bar.pipeline
      ? undefined
      : { what, zones: dragView({ dragged: what, texts: collection.query.texts }) };
  const input: FieldsInput = {
    collectionRef,
    collection,
    fields: [],
    ...(dragged === undefined ? {} : { dragged }),
    ...(instead === undefined ? {} : { run: instead.run }),
  };
  const buttons = { collectionRef, instead };
  return (
    <div
      className={styles['bar']}
      role="search"
      data-feature="query.bar@query-bar"
      data-side={bar.side}
      data-mode={bar.pipeline ? 'aggregate' : 'find'}
      onDragEnter={(event) => {
        draggedOver(event.dataTransfer);
      }}
    >
      <div className={styles['mode']}>
        <ModeMenu mode={bar.mode} collectionRef={collectionRef} />
      </div>
      <Fields input={input} fields={bar.fields.filter((field) => field.field === 'filter')} />
      <BarButtons buttons={bar.run} className={styles['run-group'] ?? ''} {...buttons} />
      <BarButtons buttons={[bar.toggle]} className={styles['toggle'] ?? ''} {...buttons} />
      <BarButtons buttons={bar.tools} className={styles['tools'] ?? ''} {...buttons} />
      <BarButtons buttons={bar.writes} className={styles['writes'] ?? ''} {...buttons} />
      {bar.builderOpen ? <QueryBuilder collectionRef={collectionRef} collection={collection} /> : null}
      {bar.fields.length === 0 ? null : (
        <div className={styles['options']}>
          <Fields input={input} fields={bar.fields.filter((field) => field.field !== 'filter')} />
        </div>
      )}
      {bar.pipeline ? <div className={styles['pipeline']}>{pipeline}</div> : null}
      {bar.errorLine === undefined ? null : (
        <ErrorLine key={bar.errorLine.message} line={bar.errorLine} collectionRef={collectionRef} />
      )}
    </div>
  );
}
