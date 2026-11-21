/**
 * The two rows above the table of the Slow queries section (`monitor.slow-queries`): **Source**, **Database**,
 * **Since**, **By query** or **All** and the filter; then what is recorded, with the controls of the profiler
 * (`monitor.set-profiler`, `monitor.clear-profiler`) or of the threshold of the server log
 * (`monitor.set-log-threshold`), whose values the user types before **Apply**.
 */
import type {
  Choice,
  LogThresholdControl,
  ProfilerControls,
  SlowQueriesView,
} from '../../../features/monitor/slow-queries';
import { text } from '../../../features/monitor/text';
import type { MonitorChoices } from '../../../features/monitor/parts/choices';
import { Field } from '../server/server-parts';
import { changeChoices, changeDrafts, changeReadChoices } from './monitor-changes';
import { ControlButton } from './monitor-parts';
import type { MonitorTab } from './monitor-store';
import styles from '../server/server-page.module.css';

function Select<Value>(props: {
  readonly choice: Choice<Value>;
  readonly label?: string;
  readonly onChange: (value: Value) => void;
}) {
  const { choice } = props;
  const index = choice.choices.findIndex((each) => each.value === choice.value);
  return (
    <label className={styles['field']}>
      <span>{props.label ?? choice.label}</span>
      <select
        className={styles['input']}
        value={String(Math.max(index, 0))}
        onChange={(event) => {
          const chosen = choice.choices[Number(event.target.value)];
          if (chosen !== undefined) {
            props.onChange(chosen.value);
          }
        }}
      >
        {choice.choices.map((each, at) => (
          <option key={each.label} value={String(at)}>
            {each.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The first row: what is read and how it is shown. */
export function SlowToolbar(props: { readonly tabId: string; readonly toolbar: SlowQueriesView['toolbar'] }) {
  const { tabId, toolbar } = props;
  const reading = (change: (choices: MonitorChoices) => MonitorChoices): void => {
    changeReadChoices(tabId, 'slow-queries', change);
  };
  return (
    <div
      className={styles['toolbar']}
      role="toolbar"
      aria-label={text.window.sectionToolbar(text.sections['slow-queries'])}
    >
      <Select
        choice={toolbar.source}
        onChange={(source) => {
          reading(({ database: _dropped, ...choices }) => ({ ...choices, source }));
        }}
      />
      <Select
        choice={toolbar.database}
        onChange={(database) => {
          reading(({ database: _dropped, ...choices }) =>
            database === undefined ? choices : { ...choices, database },
          );
        }}
      />
      <Select
        choice={toolbar.since}
        onChange={(since) => {
          reading((choices) => ({ ...choices, since }));
        }}
      />
      <div role="group" aria-label={toolbar.grouping.choices.map((each) => each.label).join(' / ')}>
        {toolbar.grouping.choices.map((each) => (
          <button
            key={each.value}
            type="button"
            className={styles['button']}
            aria-pressed={each.value === toolbar.grouping.value}
            onClick={() => {
              changeChoices(tabId, (choices) => ({ ...choices, grouping: each.value }));
            }}
          >
            {each.label}
          </button>
        ))}
      </div>
      <Field
        label={toolbar.filter.placeholder}
        placeholder={toolbar.filter.placeholder}
        value={toolbar.filter.value}
        onChange={(slowFilter) => {
          changeChoices(tabId, (choices) => ({ ...choices, slowFilter }));
        }}
      />
      {toolbar.source.note === undefined ? null : <span className={styles['note']}>{toolbar.source.note}</span>}
    </div>
  );
}

function millisOf(typed: string | undefined, read: number): number {
  const value = Number(typed);
  return typed === undefined || typed.trim() === '' || !Number.isFinite(value) || value < 0 ? read : Math.round(value);
}

function Millis(props: { readonly value: string; readonly onChange: (value: string) => void }) {
  return (
    <input
      className={`${styles['input'] ?? ''} ${styles['number'] ?? ''}`}
      type="number"
      min={0}
      aria-label={text.window.threshold}
      value={props.value}
      onChange={(event) => {
        props.onChange(event.target.value);
      }}
    />
  );
}

function Profiler(props: { readonly tabId: string; readonly tab: MonitorTab; readonly controls: ProfilerControls }) {
  const { tabId, tab, controls } = props;
  const level = tab.drafts.level ?? controls.level;
  const slowMs = millisOf(tab.drafts.slowMs, controls.slowMs);
  const args = controls.apply.args as Readonly<Record<string, string | number>>;
  return (
    <span className={styles['field']}>
      <label className={styles['field']}>
        <span>{controls.label}</span>
        <select
          className={styles['input']}
          aria-label={text.window.profilerLevel}
          value={String(level)}
          onChange={(event) => {
            changeDrafts(tabId, (drafts) => ({ ...drafts, level: Number(event.target.value) }));
          }}
        >
          {controls.levels.map((each) => (
            <option key={each.value} value={String(each.value)}>
              {each.label}
            </option>
          ))}
        </select>
      </label>
      <span>{controls.slowerThan}</span>
      <Millis
        value={tab.drafts.slowMs ?? String(controls.slowMs)}
        onChange={(typed) => {
          changeDrafts(tabId, (drafts) => ({ ...drafts, slowMs: typed }));
        }}
      />
      <span>{controls.unit}</span>
      <ControlButton tab={tabId} control={{ ...controls.apply, args: { ...args, level, slowMs } }} place="toolbar" />
      <ControlButton tab={tabId} control={controls.clear} place="toolbar" />
    </span>
  );
}

function LogThreshold(props: {
  readonly tabId: string;
  readonly tab: MonitorTab;
  readonly control: LogThresholdControl;
}) {
  const { tabId, tab, control } = props;
  const slowMs = millisOf(tab.drafts.logSlowMs, control.slowMs);
  const args = control.apply.args as Readonly<Record<string, string | number>>;
  return (
    <span className={styles['field']}>
      <span>{control.label}</span>
      <Millis
        value={tab.drafts.logSlowMs ?? String(control.slowMs)}
        onChange={(typed) => {
          changeDrafts(tabId, (drafts) => ({ ...drafts, logSlowMs: typed }));
        }}
      />
      <span>{control.unit}</span>
      <ControlButton tab={tabId} control={{ ...control.apply, args: { ...args, slowMs } }} place="toolbar" />
    </span>
  );
}

/** The second row: what is recorded and found, and the controls of the profiler or of the threshold. */
export function RecordingRow(props: {
  readonly tabId: string;
  readonly tab: MonitorTab;
  readonly shown: SlowQueriesView;
}): React.JSX.Element {
  const { tabId, tab, shown } = props;
  return (
    <div className={styles['toolbar']}>
      <span className={styles['count']}>{shown.recording ?? ''}</span>
      {shown.profiler === undefined ? null : <Profiler tabId={tabId} tab={tab} controls={shown.profiler} />}
      {shown.logThreshold === undefined ? null : <LogThreshold tabId={tabId} tab={tab} control={shown.logThreshold} />}
    </div>
  );
}
