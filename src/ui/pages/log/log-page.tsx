/**
 * `runner.log`: the Log page. Its toolbar (`@toolbar`) filters by source, connection, kind and text, and has
 * **Follow**, **Copy**, **Clear** and **Export…**; the lines are drawn only when on screen. Opened at a line (**Show in
 * log**), it scrolls to it and selects it; opened for a source (the MCP state of the top bar), it filters to it.
 */
import { useMemo, useState } from 'react';
import { linesText, logPlace, view, type LogFilter, type LogKindFilter } from '../../../features/runner/log';
import { runnerText } from '../../../features/runner/text';
import { useAppState } from '../../state/store';
import { LogLines, type LogSelection } from './log-lines';
import styles from './log-page.module.css';

const kinds: readonly { readonly value: LogKindFilter; readonly label: string }[] = [
  { value: 'steps', label: runnerText.kindSteps },
  { value: 'refusals', label: runnerText.kindRefusals },
  { value: 'errors', label: runnerText.kindErrors },
];

/** A menu of the toolbar: every value, or one. */
function Menu(props: {
  readonly label: string;
  readonly all: string;
  readonly value: string | undefined;
  readonly choices: readonly { readonly value: string; readonly label: string }[];
  readonly onChange: (value: string | undefined) => void;
}): React.JSX.Element {
  return (
    <select
      className={styles['input']}
      aria-label={props.label}
      value={props.value ?? ''}
      onChange={(event) => {
        props.onChange(event.target.value === '' ? undefined : event.target.value);
      }}
    >
      <option value="">{props.all}</option>
      {props.choices.map((choice) => (
        <option key={choice.value} value={choice.value}>
          {choice.label}
        </option>
      ))}
    </select>
  );
}

function withValue(filter: LogFilter, name: 'source' | 'connection' | 'kind', value: string | undefined): LogFilter {
  const { [name]: _left, ...rest } = filter;
  return value === undefined ? rest : { ...rest, [name]: value };
}

/** The filters of the toolbar: the menus of the sources, the connections and the kinds, and the text. */
function Filters(props: {
  readonly filter: LogFilter;
  readonly onFilter: (filter: LogFilter) => void;
  readonly sources: readonly string[];
  readonly connections: readonly string[];
}): React.JSX.Element {
  const { filter, onFilter } = props;
  const change = (name: 'source' | 'connection' | 'kind', value: string | undefined): void => {
    onFilter(withValue(filter, name, value));
  };
  return (
    <>
      <Menu
        label={runnerText.allSources}
        all={runnerText.allSources}
        value={filter.source}
        choices={props.sources.map((source) => ({ value: source, label: source }))}
        onChange={(value) => {
          change('source', value);
        }}
      />
      <Menu
        label={runnerText.allConnections}
        all={runnerText.allConnections}
        value={filter.connection}
        choices={props.connections.map((connection) => ({ value: connection, label: connection }))}
        onChange={(value) => {
          change('connection', value);
        }}
      />
      <Menu
        label={runnerText.allKinds}
        all={runnerText.allKinds}
        value={filter.kind}
        choices={kinds}
        onChange={(value) => {
          change('kind', value);
        }}
      />
      <input
        className={styles['input']}
        type="search"
        placeholder={runnerText.logFilter}
        aria-label={runnerText.logFilter}
        value={filter.text}
        onChange={(event) => {
          onFilter({ ...filter, text: event.target.value });
        }}
      />
    </>
  );
}

/** The part of the page asked for, once per request: `line:42`, `source:MCP`, and how many times it was asked. */
function useAsked(): { readonly at: string | undefined; readonly times: number } {
  const opened = useAppState().runner.opened;
  return opened?.page === 'log' ? { at: opened.at, times: opened.times } : { at: undefined, times: 0 };
}

/** The Log page. */
export function LogPage(): React.JSX.Element {
  const state = useAppState();
  const [filter, setFilter] = useState<LogFilter>({ text: '' });
  const [selection, setSelection] = useState<LogSelection>({ selected: new Set() });
  const [follow, setFollow] = useState(true);
  const { at, times } = useAsked();
  const [seen, setSeen] = useState<string | undefined>(undefined);
  const request = `${String(times)} ${at ?? ''}`;
  const place = logPlace(at);
  if (seen !== request) {
    // A new request for the page: what it asks for is applied once, while the page is drawn.
    setSeen(request);
    if (place !== undefined && 'source' in place) {
      setFilter({ text: '', source: place.source });
    } else if (place !== undefined) {
      setFilter({ text: '' });
      setFollow(false);
      setSelection({ selected: new Set([place.line]), active: place.line });
    }
  }
  const asked = useMemo(() => {
    const line = logPlace(at);
    return line !== undefined && 'line' in line ? { line: line.line, times } : undefined;
  }, [at, times]);
  const log = view({ log: state.runner.log, filter });
  const chosen = log.lines.filter((line) => selection.selected.has(line.id));
  return (
    <div className={styles['page']}>
      <div className={styles['toolbar']} role="toolbar" aria-label={runnerText.log} data-feature="runner.log@toolbar">
        <Filters filter={filter} onFilter={setFilter} sources={log.sources} connections={log.connections} />
        <button
          type="button"
          className={styles['button']}
          aria-pressed={follow}
          onClick={() => {
            setFollow(!follow);
          }}
        >
          {runnerText.follow}
        </button>
        <button
          type="button"
          className={styles['button']}
          disabled={chosen.length === 0}
          onClick={() => {
            void navigator.clipboard.writeText(linesText(chosen));
          }}
        >
          {runnerText.copy}
        </button>
        <button
          type="button"
          className={styles['button']}
          disabled={log.empty}
          onClick={() => {
            setSelection({ selected: new Set() });
            void window.datardo.clearLog();
          }}
        >
          {runnerText.clear}
        </button>
        <button
          type="button"
          className={styles['button']}
          disabled={log.lines.length === 0}
          onClick={() => {
            void window.datardo.exportLog(linesText(log.lines));
          }}
        >
          {runnerText.export}
        </button>
      </div>
      {log.lines.length === 0 ? (
        <p className={styles['empty']}>{log.empty ? runnerText.emptyLog : runnerText.noLineMatches}</p>
      ) : (
        <LogLines
          lines={log.lines}
          selection={selection}
          onSelect={setSelection}
          follow={follow}
          onFollow={setFollow}
          {...(asked === undefined ? {} : { scrollTo: asked })}
        />
      )}
    </div>
  );
}
