/**
 * **Go from here** under the selected document in the inspector island (`relation.follow`): the documents it refers
 * to (`relation.open-referenced`), then those that refer to it under **Referenced by** (`relation.open-referencing`);
 * while the references are found for the first time, or when they are not found by themselves, a line that says so.
 */
import { view, type FollowLine } from '../../../features/relation/follow';
import type { TableMode } from '../../../features/table/types';
import type { Json } from '../../../shared/engine-request';
import { startFeature } from '../../shell/intent';
import { lineValue, openReferenced, openReferencing, useTableReferences, type Where } from './references';
import styles from './relation.module.css';

function Line(props: { readonly line: FollowLine; readonly onFollow: (line: FollowLine) => void }) {
  const { line } = props;
  return (
    <li>
      <button
        type="button"
        className={styles['follow-line']}
        title={line.tooltip}
        data-feature={line.element}
        onClick={() => {
          props.onFollow(line);
        }}
      >
        {line.text}
      </button>
    </li>
  );
}

/** **Go from here** for a document of a collection tab. */
export function FollowSection(props: { readonly where: Where; readonly mode: TableMode; readonly document: Json }) {
  const { where, document } = props;
  const references = useTableReferences(where, props.mode);
  const shown = view({ ...references, document });
  const follow = (line: FollowLine): void => {
    if (line.feature === 'relation.open-referenced') {
      const path = line.path ?? '';
      openReferenced(
        where,
        references,
        { path, value: lineValue(document, path), label: line.target.label },
        'inspector',
      );
    } else {
      openReferencing(where, references, { document, label: line.target.label }, 'inspector');
    }
  };
  switch (shown.kind) {
    case 'none':
      return null;
    case 'message':
      return <p className={styles['follow-message']}>{shown.text}</p>;
    case 'not-detected':
      return (
        <div className={styles['follow']}>
          <p className={styles['follow-message']}>{shown.text}</p>
          <button
            type="button"
            className={styles['follow-button']}
            data-feature={shown.diagram.element}
            onClick={() => {
              startFeature('relation.diagram', {
                place: 'inspector',
                target: { kind: 'database', connection: where.connection, database: where.database },
                args: { connection: where.connection, database: where.database, collection: where.collection },
              });
            }}
          >
            {shown.diagram.label}
          </button>
        </div>
      );
    case 'lines':
      return (
        <section className={styles['follow']} aria-label={shown.title} data-feature="relation.follow@inspector">
          <h3 className={styles['follow-title']}>{shown.title}</h3>
          <ul className={styles['follow-lines']}>
            {shown.referenced.map((line) => (
              <Line key={`${line.text} ${line.target.label}`} line={line} onFollow={follow} />
            ))}
          </ul>
          {shown.referencedBy.length === 0 ? null : (
            <>
              <h4 className={styles['follow-title']}>{shown.referencedByTitle}</h4>
              <ul className={styles['follow-lines']}>
                {shown.referencedBy.map((line) => (
                  <Line key={line.text} line={line} onFollow={follow} />
                ))}
              </ul>
            </>
          )}
        </section>
      );
  }
}
