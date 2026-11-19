/**
 * The results of a playground under its editor (`playground.results`): the summary, the error with the link to its
 * line, the lines printed under **Output**, and the value of the last expression as a table or as text, with
 * **Table**, **JSON**, **Copy** and **Copy as JSON**. While a run is in progress the results of the one before stay,
 * dimmed.
 */
import {
  layoutReadId,
  type ResultsButton,
  type ResultsView,
  type ShownResult,
} from '../../../features/playground/results';
import type { ResultCell, ResultTable } from '../../../features/playground/results';
import { text } from '../../../features/playground/text';
import type { TabId } from '../../../shared/ids';
import { startFeature } from '../../shell/intent';
import { flashCopied } from '../../table/copied-flash';
import styles from './playground-page.module.css';

/** The color of a cell, by the BSON type of its value: the syntax colors of `table.show`. */
const syntaxOfType: Readonly<Record<string, string>> = {
  string: 'string',
  int: 'number',
  long: 'number',
  double: 'number',
  decimal: 'number',
  bool: 'bool',
  objectId: 'oid',
  date: 'date',
  regex: 'regex',
};

function ToolbarButton({
  button,
  onPress,
}: {
  readonly button: ResultsButton;
  readonly onPress: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={styles['button']}
      data-feature={button.element}
      aria-disabled={button.disabled ? true : undefined}
      aria-pressed={button.pressed}
      onClick={() => {
        if (!button.disabled) {
          onPress();
        }
      }}
    >
      {button.label}
    </button>
  );
}

function copy(value: string | undefined): void {
  if (value !== undefined) {
    void navigator.clipboard.writeText(value).then(flashCopied);
  }
}

function Toolbar({ tab, shown }: { readonly tab: TabId; readonly shown: ShownResult }): React.JSX.Element {
  const chose = (layout: 'table' | 'json') => () => {
    startFeature(layoutReadId, { place: 'toolbar', args: { tab, layout } });
  };
  return (
    <div className={styles['results-toolbar']} role="toolbar" aria-label={text.show.resultsToolbar}>
      <ToolbarButton button={shown.toolbar.table} onPress={chose('table')} />
      <ToolbarButton button={shown.toolbar.json} onPress={chose('json')} />
      <ToolbarButton
        button={shown.toolbar.copy}
        onPress={() => {
          copy(shown.copyText);
        }}
      />
      <ToolbarButton
        button={shown.toolbar.copyJson}
        onPress={() => {
          copy(shown.copyJsonText);
        }}
      />
    </div>
  );
}

function Cell({ cell }: { readonly cell: ResultCell }): React.JSX.Element {
  if (cell.kind === 'empty') {
    return <td className={styles['cell']} data-content="missing" />;
  }
  return (
    <td className={styles['cell']} data-syntax={syntaxOfType[cell.type]} title={cell.tooltip}>
      {cell.text}
    </td>
  );
}

function Table({ table }: { readonly table: ResultTable }): React.JSX.Element {
  return (
    <>
      {table.note === undefined ? null : <p className={styles['note']}>{table.note}</p>}
      <div className={styles['table-scroller']} tabIndex={0} role="region" aria-label={text.results.table}>
        <table className={styles['table']}>
          <thead>
            <tr>
              {table.columns.map((column) => (
                <th key={column} scope="col" className={styles['heading']}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.number}>
                <th scope="row" className={styles['number']}>
                  {row.number}
                </th>
                {row.cells.map((cell, index) => (
                  <Cell key={table.columns[index + 1] ?? index} cell={cell} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Value({ shown }: { readonly shown: ShownResult }): React.JSX.Element | null {
  const { value } = shown;
  switch (value.kind) {
    case 'table':
      return <Table table={value.table} />;
    case 'text':
      return (
        <pre className={styles['text']} tabIndex={0} aria-label={text.show.results}>
          {value.text}
        </pre>
      );
    case 'message':
      return <p className={styles['message']}>{value.text}</p>;
    case 'none':
      return null;
  }
}

function Shown({
  shown,
  tab,
  onShowLine,
}: {
  readonly shown: ShownResult;
  readonly tab: TabId;
  readonly onShowLine: (line: number) => void;
}): React.JSX.Element {
  const { error, output } = shown;
  return (
    <>
      <Toolbar tab={tab} shown={shown} />
      <p className={styles['summary']}>{shown.summary}</p>
      {error === undefined ? null : (
        <p className={styles['error']} role="alert">
          <span>{error.message}</span>
          {error.line === undefined ? null : (
            <button
              type="button"
              className={styles['link']}
              data-feature={error.line.element}
              title={error.line.name}
              onClick={() => {
                if (error.line !== undefined) {
                  onShowLine(error.line.line);
                }
              }}
            >
              {error.line.label}
            </button>
          )}
        </p>
      )}
      {output === undefined ? null : (
        <section className={styles['output']} aria-label={output.title}>
          <h3 className={styles['output-title']}>{output.title}</h3>
          <pre className={styles['text']}>{output.lines.join('\n')}</pre>
        </section>
      )}
      <Value shown={shown} />
    </>
  );
}

/** The results of the last run of a playground. */
export function PlaygroundResults({
  results,
  tab,
  onShowLine,
}: {
  readonly results: ResultsView;
  readonly tab: TabId;
  readonly onShowLine: (line: number) => void;
}): React.JSX.Element {
  switch (results.state) {
    case 'before':
      return (
        <div className={styles['before']} data-feature="playground.results@list">
          <p>{results.lines[0]}</p>
          <p className={styles['muted']}>{results.lines[1]}</p>
        </div>
      );
    case 'running':
      return (
        <>
          <p className={styles['running']} role="status">
            {results.running}
          </p>
          {results.before === undefined ? null : (
            <div className={styles['dimmed']} aria-hidden="true" inert>
              <Shown shown={results.before} tab={tab} onShowLine={onShowLine} />
            </div>
          )}
        </>
      );
    case 'done':
      return (
        <div data-feature="playground.results@list">
          <Shown shown={results} tab={tab} onShowLine={onShowLine} />
        </div>
      );
  }
}
