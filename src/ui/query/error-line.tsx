/**
 * The error line under the query bar (`query.bar`): the last message, with **Details** and **Run again** for a message
 * of the server, as the runner shows every error inside a page.
 */
import { useState } from 'react';
import { text } from '../../features/query/text';
import type { ErrorLine as ErrorLineState } from '../../features/query/types';
import { runFromBar } from './bar-actions';
import type { CollectionRef } from './collection-reads';
import styles from './query-bar.module.css';

/** The error line, keyed by its message so that **Details** closes for a new one. */
export function ErrorLine({
  line,
  collectionRef,
}: {
  readonly line: ErrorLineState;
  readonly collectionRef: CollectionRef;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles['error']} role="alert" data-feature="query.bar@query-bar" data-error-line="true">
      <span>{line.message}</span>
      {line.details === undefined ? null : (
        <button
          type="button"
          className={styles['button']}
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
          }}
        >
          {text.bar.details}
        </button>
      )}
      {line.runAgain ? (
        <button
          type="button"
          className={styles['button']}
          data-feature="query.run@query-bar"
          onClick={() => {
            runFromBar(collectionRef);
          }}
        >
          {text.bar.runAgain}
        </button>
      ) : null}
      {open && line.details !== undefined ? <pre className={styles['details']}>{line.details}</pre> : null}
    </div>
  );
}
