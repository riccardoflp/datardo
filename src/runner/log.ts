/**
 * Writes lines in the Log (`runner.log`): each step with the identifier of the feature that planned it, each refusal
 * with its code (R4.3). The runner writes the prefix, not each feature. The Log is kept in memory only.
 */
import type { FeatureId } from '../shared/ids';
import type { LogKind, NewLogLine } from '../shared/state/runner';
import type { RunnerPorts } from './ports';

/** What is written, by whom, on which connection. */
export interface LogEntry {
  readonly feature: FeatureId | string;
  readonly kind: LogKind;
  readonly text: string;
  readonly connection?: string;
}

/** Adds lines to the Log, as `[<feature>] <text>`. */
export function writeLog(ports: Pick<RunnerPorts, 'state' | 'now'>, entries: readonly LogEntry[]): void {
  const time = ports.now();
  const lines: NewLogLine[] = entries.map((entry) => ({
    time,
    source: entry.feature,
    kind: entry.kind,
    text: `[${entry.feature}] ${entry.text}`,
    ...(entry.connection === undefined ? {} : { connection: entry.connection }),
  }));
  ports.state.dispatch({ slice: 'runner', type: 'logged', lines });
}
