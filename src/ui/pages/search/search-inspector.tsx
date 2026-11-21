/**
 * `document.inspect` for the Search documents page: the document of the item selected, read again from its collection
 * (`document.read`), in the inspector island under its header `orders · 65f1…a2c`, as mongosh text. What the inspector
 * island says of the selection while it is read, when it failed and when nothing is selected comes from here too.
 */
import { headerId, view } from '../../../features/document/inspect';
import type { Json } from '../../../shared/engine-request';
import type { Inspection } from '../../../features/nav/types';
import { text } from '../../../features/search/text';
import { useSearchTab, searchTabOf, type SearchSelection } from './search-store';
import styles from '../document/document.module.css';

const reading = new Map<string, number>();

/** The header and the text of a document of a collection, as `document.inspect` shows them. */
function shownOf(selection: SearchSelection, document: Readonly<Record<string, never>>) {
  return view({
    selection: { kind: 'one', document, page: 1, pageSize: 1, row: 0, first: true, last: true },
    collection: selection.collection,
    source: 'find',
    readOnly: true,
    view: selection.view,
    mode: 'text',
    folding: 'levels',
    toggled: [],
    references: false,
  });
}

/** The inspector of a Search documents tab, when an item is selected. */
export function SearchInspector({ tabId }: { readonly tabId: string }): React.JSX.Element | null {
  const tab = useSearchTab(tabId);
  const selection = tab?.selected;
  const inspected = tab?.inspected;
  if (selection === undefined || inspected === undefined) {
    return null;
  }
  if (inspected.kind !== 'read') {
    return inspected.kind === 'gone' ? <p className={styles['inspector']}>{text.window.gone}</p> : null;
  }
  const shown = shownOf(selection, inspected.document as Readonly<Record<string, never>>);
  if (shown.kind !== 'document') {
    return null;
  }
  return (
    <div className={styles['inspector']}>
      <h2 className={styles['header']} title={shown.tooltip}>
        {shown.header}
      </h2>
      <pre className={styles['text']} tabIndex={0} aria-label={shown.header}>
        {shown.text}
      </pre>
    </div>
  );
}

/** What a Search documents tab adds to the active tab: what the inspector island says of the item selected. */
export function searchExtras(_app: unknown, tabId: string): { count?: string; inspection?: Inspection } {
  const tab = searchTabOf(tabId);
  const selection = tab?.selected;
  const inspected = tab?.inspected;
  if (selection === undefined || inspected === undefined) {
    reading.delete(tabId);
    return { inspection: { selected: 0, emptyLine: text.window.nothing } };
  }
  const title = `${selection.collection} · ${headerId(selection.id as Json)}`;
  if (inspected.kind === 'reading') {
    const since = reading.get(tabId) ?? Date.now();
    reading.set(tabId, since);
    return { inspection: { selected: 1, title, emptyLine: '', loadingSince: since } };
  }
  reading.delete(tabId);
  return {
    inspection: {
      selected: 1,
      title,
      emptyLine: '',
      ...(inspected.kind === 'failed' ? { error: inspected.message } : {}),
    },
  };
}
