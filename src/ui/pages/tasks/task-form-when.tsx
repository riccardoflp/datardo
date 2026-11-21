/**
 * The second half of the form of a task (`task.edit`): **When** (**Every few hours**, **Daily**, **Weekly**) with the
 * hours, the time and the days, the schedule and its next three runs under it; **Keep**, with what it keeps and what
 * it deletes; and the options **Run a missed run when Datardo starts**, **Notify after successful runs too** and
 * **Enabled**.
 */
import type { FormView, TaskForm } from '../../../features/task/edit';
import { formText, scheduleText } from '../../../features/task/text';
import type { Schedule } from '../../../shared/state/tasks';
import { Field } from './task-form-parts';
import { changeForm, type OpenForm } from './tasks-store';
import styles from './tasks-page.module.css';

const hours = [1, 2, 3, 4, 6, 8, 12];

const whens: readonly { readonly value: Schedule['kind']; readonly label: string }[] = [
  { value: 'hours', label: formText.everyFewHours },
  { value: 'daily', label: formText.daily },
  { value: 'weekly', label: formText.weekly },
];

function Days({ form }: { readonly form: TaskForm }): React.JSX.Element {
  return (
    <span className={styles['inline']}>
      {scheduleText.weekdayNames.map((name, day) => (
        <label key={name} className={styles['check']}>
          <input
            type="checkbox"
            checked={form.days.includes(day)}
            onChange={(event) => {
              const days = event.target.checked
                ? [...form.days, day].sort((first, second) => first - second)
                : form.days.filter((each) => each !== day);
              changeForm({ days });
            }}
          />
          {name}
        </label>
      ))}
    </span>
  );
}

function Option(props: {
  readonly label: string;
  readonly tooltip?: string;
  readonly on: boolean;
  readonly change: (on: boolean) => void;
}): React.JSX.Element {
  return (
    <label className={styles['check']} title={props.tooltip}>
      <input
        type="checkbox"
        checked={props.on}
        onChange={(event) => {
          props.change(event.target.checked);
        }}
      />
      {props.label}
    </label>
  );
}

/** **When**, **Keep** and the options. */
export function WhenFields({ open, view }: { readonly open: OpenForm; readonly view: FormView }): React.JSX.Element {
  const form = open.form;
  const problems = view.problems;
  return (
    <>
      <Field
        label={formText.labels.when}
        field={['every', 'time', 'days']}
        problem={problems.every ?? problems.time ?? problems.days}
      >
        <span className={styles['inline']}>
          <select
            className={styles['input']}
            aria-label={formText.labels.when}
            value={form.when}
            onChange={(event) => {
              changeForm({ when: event.target.value as Schedule['kind'] });
            }}
          >
            {whens.map((each) => (
              <option key={each.value} value={each.value}>
                {each.label}
              </option>
            ))}
          </select>
          {form.when === 'hours' ? (
            <select
              className={styles['input']}
              aria-label={formText.labels.every}
              value={form.every}
              onChange={(event) => {
                changeForm({ every: Number(event.target.value) });
              }}
            >
              {hours.map((every) => (
                <option key={every} value={every}>
                  {every}
                </option>
              ))}
            </select>
          ) : null}
          <input
            className={styles['time']}
            aria-label={formText.labels.time}
            value={form.time}
            onChange={(event) => {
              changeForm({ time: event.target.value });
            }}
          />
          {form.when === 'weekly' ? <Days form={form} /> : null}
        </span>
      </Field>
      {view.preview === '' ? null : <span className={styles['hint']}>{view.preview}</span>}
      <span className={styles['hint']}>{view.localTime}</span>
      <Field label={formText.labels.keep} field="keep" problem={problems.keep} hint={view.keepHint}>
        <span className={styles['inline']}>
          <input
            className={styles['number']}
            inputMode="numeric"
            value={form.keep}
            onChange={(event) => {
              changeForm({ keep: event.target.value });
            }}
          />
          <span>{view.keeps}</span>
        </span>
      </Field>
      <fieldset className={styles['kinds']}>
        <legend className={styles['label']}>{formText.labels.options}</legend>
        <Option
          label={formText.runMissed}
          tooltip={formText.runMissedTooltip}
          on={form.runMissed}
          change={(runMissed) => {
            changeForm({ runMissed });
          }}
        />
        <Option
          label={formText.notifySuccess}
          tooltip={formText.notifySuccessTooltip}
          on={form.notifySuccess}
          change={(notifySuccess) => {
            changeForm({ notifySuccess });
          }}
        />
        <Option
          label={formText.enabled}
          on={form.enabled}
          change={(enabled) => {
            changeForm({ enabled });
          }}
        />
      </fieldset>
    </>
  );
}
