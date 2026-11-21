/**
 * The raw output of an explain (`explain.raw`): the output as a tree in place of the summary, every value in mongosh
 * syntax colored by its type. A row that opens folds or unfolds on a click, and reads its size while folded.
 */
import type { RawRow, RawView } from '../../../features/explain/raw';
import { text } from '../../../features/explain/text';
import styles from './explain.module.css';

function Key({ name }: { readonly name: string | undefined }) {
  return name === undefined ? null : <span className={styles['raw-key']}>{name}: </span>;
}

function Row({ row, onToggle }: { readonly row: RawRow; readonly onToggle: (next: readonly string[]) => void }) {
  const indent = { paddingInlineStart: `calc(var(--space-4) * ${String(row.depth)})` };
  switch (row.kind) {
    case 'open':
      return (
        <li style={indent}>
          <button
            type="button"
            className={styles['raw-toggle']}
            aria-expanded={!row.folded}
            onClick={() => {
              onToggle(row.next);
            }}
          >
            <span className={styles['twisty']} aria-hidden="true">
              {row.folded ? '▸' : '▾'}
            </span>
            <Key name={row.key} />
            {row.bracket}
            {row.folded ? <span className={styles['muted']}> {row.size}</span> : null}
          </button>
        </li>
      );
    case 'close':
      return <li style={indent}>{row.bracket}</li>;
    case 'value':
      return (
        <li style={indent}>
          <Key name={row.key} />
          <span className={styles['raw-value']} data-type={row.type}>
            {row.text}
          </span>
        </li>
      );
  }
}

/** The tree of the raw output. */
export function ExplainRaw({
  output,
  onToggle,
}: {
  readonly output: RawView;
  readonly onToggle: (next: readonly string[]) => void;
}): React.JSX.Element {
  return (
    <ul className={styles['raw']} aria-label={text.raw}>
      {output.rows.map((row, index) => (
        // The rows follow the output, whose order never changes while it is shown.
        <Row key={index} row={row} onToggle={onToggle} />
      ))}
    </ul>
  );
}
