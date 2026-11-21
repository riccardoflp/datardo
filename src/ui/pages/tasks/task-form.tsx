/**
 * The form of a task (`task.edit`), titled **New scheduled task** or **Edit <name>**: what it saves (**Name**,
 * **Kind**, **Connection**, **Database**, **Collection**, **Format**, **Filter**, **Projection**), where (**Folder**
 * with **Browse…**, **File name**), then when and how many it keeps (`task-form-when.tsx`). **Create task** (or
 * **Save**) shows every problem, or sends the form (`task.edit@form`); **Cancel** closes it.
 */
import { formView, type FormView } from '../../../features/task/edit';
import { formText } from '../../../features/task/text';
import type { ConnectionView } from '../../../shared/connection';
import type { TaskFormat } from '../../../shared/state/tasks';
import { Field, Suggestions, useSuggestions } from './task-form-parts';
import { WhenFields } from './task-form-when';
import { browseFolder, changeForm, changeKind, closeForm, submitForm, type OpenForm } from './tasks-store';
import styles from './tasks-page.module.css';

interface FormProps {
  readonly open: OpenForm;
  readonly view: FormView;
  readonly connections: readonly ConnectionView[];
}

function SourceFields({ open, view, connections }: FormProps): React.JSX.Element {
  const form = open.form;
  const databases = useSuggestions(form.connection, '');
  const collections = useSuggestions(form.connection, databases.includes(form.database) ? form.database : '');
  return (
    <>
      <fieldset className={styles['kinds']}>
        <legend className={styles['label']}>{formText.labels.kind}</legend>
        {(['backup', 'export'] as const).map((kind) => (
          <label key={kind} className={styles['check']}>
            <input
              type="radio"
              name="task-kind"
              checked={form.kind === kind}
              onChange={() => {
                changeKind(kind, connections);
              }}
            />
            {kind === 'backup' ? formText.backup : formText.exportKind}
          </label>
        ))}
        <span className={styles['hint']}>{view.kindHint}</span>
      </fieldset>
      <Field label={formText.labels.connection} field="connection" problem={view.problems.connection}>
        <select
          className={styles['input']}
          value={form.connection}
          onChange={(event) => {
            changeForm({ connection: event.target.value });
          }}
        >
          <option value="" />
          {view.connections.map((each) => (
            <option key={each.value} value={each.value}>
              {each.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label={formText.labels.database} field="database" problem={view.problems.database}>
        <input
          className={styles['input']}
          list="task-databases"
          placeholder={formText.databasePlaceholder}
          value={form.database}
          onChange={(event) => {
            changeForm({ database: event.target.value });
          }}
        />
        <Suggestions id="task-databases" names={databases} />
      </Field>
      <Field label={formText.labels.collection} field="collection" problem={view.problems.collection}>
        <input
          className={styles['input']}
          list="task-collections"
          placeholder={formText.collectionPlaceholder}
          value={form.collection}
          onChange={(event) => {
            changeForm({ collection: event.target.value });
          }}
        />
        <Suggestions id="task-collections" names={collections} />
      </Field>
    </>
  );
}

function OutputFields({ open, view }: FormProps): React.JSX.Element {
  const form = open.form;
  const text = (field: 'filter' | 'projection' | 'pattern', label: string, placeholder?: string): React.JSX.Element => (
    <Field label={label} field={field} problem={view.problems[field]}>
      <input
        className={styles['input']}
        placeholder={placeholder}
        value={form[field]}
        onChange={(event) => {
          changeForm({ [field]: event.target.value });
        }}
      />
    </Field>
  );
  return (
    <>
      <Field label={formText.labels.format} field="format" problem={view.problems.format} hint={view.csvHint}>
        <select
          className={styles['input']}
          value={form.format}
          onChange={(event) => {
            changeForm({ format: event.target.value as TaskFormat });
          }}
        >
          {view.formats.map((each) => (
            <option key={each.value} value={each.value}>
              {each.label}
            </option>
          ))}
        </select>
      </Field>
      {view.asksQuery ? text('filter', formText.labels.filter, formText.filterPlaceholder) : null}
      {view.asksQuery ? text('projection', formText.labels.projection, formText.projectionPlaceholder) : null}
      <Field
        label={formText.labels.folder}
        field="folder"
        problem={view.problems.folder}
        aside={
          <button
            type="button"
            className={styles['button']}
            data-feature="task.edit@form"
            onClick={() => void browseFolder()}
          >
            {formText.browse}
          </button>
        }
      >
        <input
          className={styles['input']}
          value={form.folder}
          onChange={(event) => {
            changeForm({ folder: event.target.value });
          }}
        />
      </Field>
      {text('pattern', formText.labels.pattern)}
      <span className={styles['hint']}>{view.example}</span>
      <span className={styles['hint']}>{view.placeholders}</span>
    </>
  );
}

/** The form, open while a task is created or edited. */
export function TaskForm(props: {
  readonly open: OpenForm;
  readonly connections: readonly ConnectionView[];
  readonly now: number;
}): React.JSX.Element {
  const { open, connections, now } = props;
  const view = formView({
    form: open.form,
    connections,
    touched: open.touched,
    now,
    ...(open.editing === undefined ? {} : { editing: open.editing.name }),
  });
  const parts = { open, view, connections };
  return (
    <form
      className={styles['form']}
      aria-label={view.title}
      onSubmit={(event) => {
        event.preventDefault();
        void submitForm();
      }}
    >
      <h2 className={styles['formTitle']}>{view.title}</h2>
      <Field label={formText.labels.name} field="name" problem={view.problems.name}>
        <input
          className={styles['input']}
          value={open.form.name}
          onChange={(event) => {
            changeForm({ name: event.target.value });
          }}
        />
      </Field>
      <SourceFields {...parts} />
      <OutputFields {...parts} />
      <WhenFields {...parts} />
      {open.failure === undefined ? null : (
        <p className={styles['problem']} role="alert">
          {open.failure}
        </p>
      )}
      <div className={styles['buttons']}>
        <button type="submit" className={styles['primary']} data-feature="task.edit@form">
          {view.button}
        </button>
        <button type="button" className={styles['button']} onClick={closeForm}>
          {view.cancel}
        </button>
      </div>
    </form>
  );
}
