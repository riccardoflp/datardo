/**
 * Feature: runner.log
 *
 * Everything Datardo did, in order: every step sent and its outcome, every refusal, every notification. `view` says
 * which lines show for the filters of the toolbar; `open` is what **Show log** and **Show in log** start.
 */
import type { Json } from '../../shared/engine-request';
import { noDanger, run, type OperationFeature } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { LogKind, LogLine } from '../../shared/state/runner';

/** The kinds the toolbar filters by. */
export type LogKindFilter = 'steps' | 'refusals' | 'errors';

/** What the toolbar filters by; an absent filter keeps every line. */
export interface LogFilter {
  readonly source?: string;
  readonly connection?: string;
  readonly kind?: LogKindFilter;
  readonly text: string;
}

/** What the page shows. */
export interface LogView {
  readonly lines: readonly LogLine[];
  /** The sources and the connections of the lines, for the menus of the toolbar, in the order they first came. */
  readonly sources: readonly string[];
  readonly connections: readonly string[];
  /** The Log is empty, not only filtered. */
  readonly empty: boolean;
}

/** What the page is drawn from. */
export interface LogState {
  readonly log: readonly LogLine[];
  readonly filter: LogFilter;
}

const kindsOf: Readonly<Record<LogKindFilter, readonly LogKind[]>> = {
  steps: ['step', 'outcome'],
  refusals: ['refusal'],
  errors: ['error'],
};

/** Feature: runner.log. The lines the filters keep. */
export function view(state: LogState): LogView {
  const { filter } = state;
  const text = filter.text.trim().toLowerCase();
  const lines = state.log.filter(
    (line) =>
      (filter.source === undefined || line.source === filter.source) &&
      (filter.connection === undefined || line.connection === filter.connection) &&
      (filter.kind === undefined || kindsOf[filter.kind].includes(line.kind)) &&
      (text === '' || line.text.toLowerCase().includes(text)),
  );
  return {
    lines,
    sources: [...new Set(state.log.map((line) => line.source))],
    connections: [...new Set(state.log.flatMap((line) => (line.connection === undefined ? [] : [line.connection])))],
    empty: state.log.length === 0,
  };
}

/** The time of a line to the millisecond, in the system's time zone: `14:03:27.512`. */
export function timeText(time: number): string {
  const date = new Date(time);
  const two = (value: number): string => String(value).padStart(2, '0');
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
  return `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}.${milliseconds}`;
}

/** Lines as text, for **Copy** and **Export…**: the time, the connection, the source and the text, by tabs. */
export function linesText(lines: readonly LogLine[]): string {
  return lines
    .map((line) => [timeText(line.time), line.connection ?? '', line.source, line.text].join('\t'))
    .join('\n');
}

/** Where the Log opens: at a line (**Show in log**), or filtered to a source (the MCP state of the top bar). */
export type LogPlace = { readonly line: number } | { readonly source: string };

/** The part of the page asked for, as `state.runner.opened.at` holds it: `line:42`, `source:MCP`. */
export function logPlace(at: string | undefined): LogPlace | undefined {
  if (at?.startsWith('line:') === true) {
    const line = Number(at.slice('line:'.length));
    return Number.isInteger(line) ? { line } : undefined;
  }
  return at?.startsWith('source:') === true ? { source: at.slice('source:'.length) } : undefined;
}

function placeAsked(args: Json | undefined): string | undefined {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    return undefined;
  }
  const record = args as { readonly line?: Json; readonly source?: Json };
  if (typeof record.line === 'number') {
    return `line:${String(record.line)}`;
  }
  return typeof record.source === 'string' ? `source:${record.source}` : undefined;
}

/** Feature: runner.log. Opening the Log page: no step; what follows shows it, at a line or for a source. */
export const open: OperationFeature = {
  kind: 'operation',
  id: featureId('runner.log'),
  plan: (_context, answers) => {
    const at = placeAsked(answers['args'] as Json | undefined);
    return run({
      title: 'Log',
      steps: [],
      danger: noDanger,
      undo: { cannot: 'Opening a page writes nothing.' },
      publishes: false,
      after: [{ kind: 'open', page: 'log', ...(at === undefined ? {} : { at }) }],
    });
  },
};
