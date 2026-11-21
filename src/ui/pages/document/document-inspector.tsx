/**
 * `document.inspect`: the document of the selected row in the inspector island, as a tree or as mongosh text, under
 * its header `orders · 65f1…a2c` and its buttons. It follows the table: the same document as it is after the table
 * reads again, nothing once that document has left the page.
 */
import { useEffect, useRef } from 'react';
import { view } from '../../../features/document/inspect';
import type { TabId } from '../../../shared/ids';
import { collectionRefOf } from '../../query/collection-reads';
import { useCollection } from '../../query/collection-store';
import { useAppState } from '../../state/store';
import { isBuilt } from '../../query/built';
import { oneLineText } from '../../../features/document/write/values';
import { startOnDocuments } from './document-actions';
import { inspectStateOf } from './inspect-state';
import { useInspect } from './inspect-store';
import { InspectorButtons } from './inspector-buttons';
import { InspectorTree } from './inspector-tree';
import { FollowSection } from '../relation/follow-section';
import styles from './document.module.css';

/** The inspector of the collection tab `tab`, when one document is selected. */
export function DocumentInspector({ tab }: { readonly tab: TabId }): React.JSX.Element | null {
  const state = useAppState();
  const collection = useCollection(tab);
  const memory = useInspect(tab);
  const root = useRef<HTMLDivElement>(null);
  const ref = collectionRefOf(tab);
  const asked = useRef(memory.focus);
  useEffect(() => {
    if (asked.current === memory.focus) {
      return;
    }
    asked.current = memory.focus;
    requestAnimationFrame(() => {
      root.current?.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"], pre')?.focus();
    });
  }, [memory.focus]);
  if (ref === undefined) {
    return null;
  }
  const inspectState = inspectStateOf(state, ref, collection, memory);
  const shown = view(inspectState);
  const selection = inspectState.selection;
  if (shown.kind !== 'document' || selection.kind !== 'one') {
    return null;
  }
  return (
    <div ref={root} className={styles['inspector']} data-feature="document.inspect@table">
      <h2 className={styles['header']} title={shown.tooltip}>
        {shown.header}
      </h2>
      <InspectorButtons
        collectionRef={ref}
        document={selection.document}
        row={selection.row}
        memory={memory}
        buttons={shown.buttons}
        menu={shown.menu}
      />
      {shown.mode === 'tree' ? (
        <InspectorTree
          collectionRef={ref}
          document={selection.document}
          lines={shown.lines}
          selected={memory.line}
          label={shown.header}
        />
      ) : (
        <pre className={styles['text']} tabIndex={0} aria-label={shown.header}>
          {shown.text}
        </pre>
      )}
      {shown.history === undefined || !isBuilt(shown.history.element ?? '') ? null : (
        <button
          type="button"
          className={styles['button']}
          data-feature={shown.history.element}
          disabled={!shown.history.enabled}
          title={shown.history.tooltip}
          onClick={() => {
            const id = selection.document['_id'];
            if (id !== undefined) {
              void startOnDocuments(ref, 'history.show@inspector', { id, idText: oneLineText(id) });
            }
          }}
        >
          {shown.history.label}
        </button>
      )}
      {shown.goFromHere === undefined ? null : (
        <FollowSection where={ref} mode={inspectState.source} document={selection.document} />
      )}
    </div>
  );
}
