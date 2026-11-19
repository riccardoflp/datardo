/**
 * The conditions offered over the pipeline editor while a cell or a column header of the table is dragged
 * (`aggregate.drop-condition`): those of the drag and drop of the query bar over **Filter** (equals, not equal, from,
 * to, in, exists, missing, is null), under the line that says where the condition will go. A drop on one adds it to the
 * pipeline, which then runs.
 */
import { useState } from 'react';
import { dropElement, dropTarget } from '../../../features/aggregate/drop-condition';
import { text } from '../../../features/aggregate/text';
import type { PipelineEditor } from '../../../features/aggregate/types';
import { view as dragView, type Dragged, type Zone } from '../../../features/query/drag';
import { emptyTexts } from '../../../features/query/types';
import type { CollectionRef } from '../../query/collection-reads';
import { draggedMime, endDrag, readDragged } from '../../query/drag-data';
import { startOnPipeline } from './pipeline-actions';
import styles from './pipeline-editor.module.css';

function dropOn(ref: CollectionRef, zone: Zone, dragged: Dragged): void {
  if (zone.action.to !== 'filter') {
    return;
  }
  const args = {
    field: dragged.field,
    condition: zone.action.condition,
    ...(dragged.within === undefined ? {} : { within: dragged.within }),
  };
  void startOnPipeline(ref, { label: zone.label, element: dropElement, feature: 'aggregate.drop-condition', args });
}

function ZoneTarget({
  zone,
  dragged,
  collectionRef,
}: {
  readonly zone: Zone;
  readonly dragged: Dragged;
  readonly collectionRef: CollectionRef;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={styles['zone']}
      data-feature={dropElement}
      data-zone={zone.label}
      data-over={over}
      title={zone.tip}
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes(draggedMime)) {
          event.preventDefault();
          setOver(true);
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(draggedMime)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDragLeave={() => {
        setOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        const carried = readDragged(event.dataTransfer) ?? dragged;
        endDrag();
        dropOn(collectionRef, zone, carried);
      }}
    >
      <span>{zone.label}</span>
      <span className={styles['zone-field']}>{zone.field}</span>
    </div>
  );
}

/** The conditions over the editor, while something of the table is dragged. */
export function PipelineDropZones({
  dragged,
  editor,
  collectionRef,
}: {
  readonly dragged: Dragged;
  readonly editor: PipelineEditor;
  readonly collectionRef: CollectionRef;
}): React.JSX.Element | null {
  const zones = dragView({ dragged, texts: emptyTexts }).filter;
  if (zones.length === 0) {
    return null;
  }
  return (
    <div className={styles['zones']} role="group" aria-label={text.drop.zones}>
      <p className={styles['zones-line']}>{dropTarget(editor)}</p>
      <div className={styles['zones-row']}>
        {zones.map((zone) => (
          <ZoneTarget key={zone.label} zone={zone} dragged={dragged} collectionRef={collectionRef} />
        ))}
      </div>
    </div>
  );
}
