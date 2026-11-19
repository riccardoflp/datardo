/**
 * The zones of `query.drag` over **Filter**, **Sort** or **Project** while a cell or a column header of the table is
 * dragged: each its label, the field, and the tooltip of what it adds. A drop on one writes it and runs the query.
 */
import { useState } from 'react';
import type { Dragged, Zone } from '../../features/query/drag';
import { dropOnZone } from './bar-actions';
import type { CollectionRef } from './collection-reads';
import { draggedMime, endDrag, readDragged } from './drag-data';
import styles from './query-bar.module.css';

function ZoneTarget({
  zone,
  dragged,
  collectionRef,
}: {
  readonly zone: Zone;
  readonly dragged: Dragged;
  readonly collectionRef: CollectionRef;
}): React.JSX.Element {
  const [over, setOver] = useState(false);
  return (
    <div
      className={styles['zone']}
      data-feature={zone.element}
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
        dropOnZone(collectionRef, zone, carried);
      }}
    >
      <span>{zone.label}</span>
      <span className={styles['zone-field']}>{zone.field}</span>
    </div>
  );
}

/** The zones over one field of the bar. */
export function DropZones({
  zones,
  dragged,
  collectionRef,
}: {
  readonly zones: readonly Zone[];
  readonly dragged: Dragged;
  readonly collectionRef: CollectionRef;
}): React.JSX.Element | null {
  if (zones.length === 0) {
    return null;
  }
  return (
    <div className={styles['zones']} data-feature="query.drag@query-bar">
      {zones.map((zone) => (
        <ZoneTarget key={zone.label} zone={zone} dragged={dragged} collectionRef={collectionRef} />
      ))}
    </div>
  );
}
