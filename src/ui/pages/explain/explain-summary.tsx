/**
 * The summary of an explain in the Explain section (`explain.show`): the verdict as marks, the numbers, the note, the
 * suggested index with **Create…**, the winning plan as a tree of stages, and the stages of the pipeline after the
 * query. A warning and a good mark differ by an icon as well as by color.
 */
import type { PlanRow, SummaryView, Tone, VerdictMark } from '../../../features/explain/show';
import type { IndexKey } from '../../../features/explain/types';
import styles from './explain.module.css';

function Icon({ icon }: { readonly icon: 'warning' | 'check' | undefined }) {
  return icon === undefined ? null : <span className={`codicon codicon-${icon}`} aria-hidden="true" />;
}

function toneClass(tone: Tone): string {
  return styles[tone] ?? '';
}

function Mark({ mark }: { readonly mark: VerdictMark }) {
  return (
    <span className={`${styles['mark'] ?? ''} ${toneClass(mark.tone)}`} title={mark.hint} data-tone={mark.tone}>
      <Icon icon={mark.icon} />
      {mark.text}
    </span>
  );
}

function PlanRowView({ row }: { readonly row: PlanRow }) {
  const indent = { paddingInlineStart: `calc(var(--space-4) * ${String(row.depth)})` };
  return (
    <li className={styles['stage']} style={indent} data-tone={row.tone}>
      <div className={styles['stage-line']}>
        <span className={`${styles['stage-name'] ?? ''} ${toneClass(row.tone)}`}>
          <Icon icon={row.icon} />
          {row.stage}
        </span>
        {row.counts === '' ? null : <span className={styles['muted']}>{row.counts}</span>}
      </div>
      {row.details === '' ? null : (
        <div className={styles['details']} title={row.details}>
          {row.details}
        </div>
      )}
    </li>
  );
}

function Suggestion({
  suggestion,
  onCreate,
}: {
  readonly suggestion: NonNullable<SummaryView['suggestion']>;
  readonly onCreate: (keys: readonly IndexKey[]) => void;
}) {
  const { create } = suggestion;
  return (
    <div className={styles['suggestion']} title={suggestion.hint}>
      <span>{suggestion.label}</span>
      <code className={styles['code']}>{suggestion.keys}</code>
      {create === undefined ? null : (
        <button
          type="button"
          className={styles['button']}
          title={create.hint}
          onClick={() => {
            onCreate(create.keys);
          }}
        >
          {create.label}
        </button>
      )}
    </div>
  );
}

/** The summary. */
export function ExplainSummary({
  summary,
  onCreate,
}: {
  readonly summary: SummaryView;
  readonly onCreate: (keys: readonly IndexKey[]) => void;
}): React.JSX.Element {
  return (
    <div className={styles['summary']}>
      {summary.verdict.length === 0 ? null : (
        <div className={styles['verdict']}>
          {summary.verdict.map((mark) => (
            <Mark key={mark.text} mark={mark} />
          ))}
        </div>
      )}
      {summary.numbers.length === 0 ? null : (
        <dl className={styles['numbers']}>
          {summary.numbers.map((number) => (
            <div key={number.name} className={styles['number']}>
              <dt>{number.name}</dt>
              <dd>{number.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {summary.note === undefined ? null : <p className={styles['note']}>{summary.note}</p>}
      {summary.suggestion === undefined ? null : <Suggestion suggestion={summary.suggestion} onCreate={onCreate} />}
      {summary.winningPlan === undefined ? null : (
        <section aria-label={summary.winningPlan.title}>
          <h3 className={styles['heading']}>{summary.winningPlan.title}</h3>
          <ul className={styles['plan']}>
            {summary.winningPlan.rows.map((row, index) => (
              // The rows of a plan are in a fixed order.
              <PlanRowView key={index} row={row} />
            ))}
          </ul>
        </section>
      )}
      {summary.stagesAfterQuery === undefined ? null : (
        <section aria-label={summary.stagesAfterQuery.title}>
          <h3 className={styles['heading']}>{summary.stagesAfterQuery.title}</h3>
          <ul className={styles['plan']}>
            {summary.stagesAfterQuery.rows.map((row, index) => (
              <li key={index} className={styles['stage-line']}>
                <span className={styles['stage-name']}>{row.name}</span>
                {row.counts === '' ? null : <span className={styles['muted']}>{row.counts}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
