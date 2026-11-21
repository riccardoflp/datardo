/**
 * The parts of the index dialog (`index.dialog`): **Fields**, one row per field with its direction or type, its
 * weight and **↑ ↓ ✕**; **Options**, each typed value ticking its box; and the **Text**, the keys and options as
 * `createIndex` takes them.
 */
import { ttlUnits, type TtlUnit } from '../../../features/index/change-plan';
import type { IndexDialogState, IndexDialogView, IndexForm, FieldRow } from '../../../features/index/dialog';
import { withTtlTyped, withTyped } from '../../../features/index/dialog';
import { typedInput } from '../../../features/index/parts/typed-input';
import { text } from '../../../features/index/text';
import type { FieldHint } from '../../../features/query/field-hints';
import { MongoshEditor } from '../../components/editor/mongosh-editor';
import styles from './index.module.css';

/** What a part of the dialog is given. */
export interface DialogPartProps {
  readonly state: IndexDialogState;
  readonly shown: IndexDialogView;
  readonly fields: readonly FieldHint[];
  readonly change: (state: IndexDialogState) => void;
  readonly save: () => void;
}

const fieldList = 'index-dialog-fields';

function withRows(props: DialogPartProps, rows: readonly FieldRow[]): void {
  props.change({ ...props.state, form: { ...props.state.form, rows } });
}

function moved(rows: readonly FieldRow[], at: number, by: -1 | 1): readonly FieldRow[] {
  const other = at + by;
  const next = [...rows];
  const [here, there] = [next[at], next[other]];
  if (here === undefined || there === undefined) {
    return rows;
  }
  next[at] = there;
  next[other] = here;
  return next;
}

function RowButtons({ props, at }: { readonly props: DialogPartProps; readonly at: number }): React.JSX.Element {
  const rows = props.state.form.rows;
  const locked = props.shown.locked;
  return (
    <>
      <button
        type="button"
        className={styles['row-button']}
        title={text.dialog.up}
        aria-label={text.dialog.up}
        disabled={locked || at === 0}
        onClick={() => {
          withRows(props, moved(rows, at, -1));
        }}
      >
        ↑
      </button>
      <button
        type="button"
        className={styles['row-button']}
        title={text.dialog.down}
        aria-label={text.dialog.down}
        disabled={locked || at === rows.length - 1}
        onClick={() => {
          withRows(props, moved(rows, at, 1));
        }}
      >
        ↓
      </button>
      <button
        type="button"
        className={styles['row-button']}
        title={text.dialog.remove}
        aria-label={text.dialog.remove}
        disabled={locked}
        onClick={() => {
          const left = rows.filter((_row, index) => index !== at);
          withRows(props, left.length === 0 ? [{ field: '', type: '1', weight: '' }] : left);
        }}
      >
        ✕
      </button>
    </>
  );
}

function FieldLine({ props, at }: { readonly props: DialogPartProps; readonly at: number }): React.JSX.Element | null {
  const row = props.shown.rows[at];
  if (row === undefined) {
    return null;
  }
  const edit = (part: Partial<FieldRow>): void => {
    withRows(
      props,
      props.state.form.rows.map((each, index) => (index === at ? { ...each, ...part } : each)),
    );
  };
  return (
    <div className={styles['field-row']}>
      <input
        className={styles['input']}
        aria-label={text.dialog.fieldLabel(at + 1)}
        placeholder={text.dialog.fieldPlaceholder}
        list={fieldList}
        value={row.field}
        disabled={props.shown.locked}
        {...(at === 0 ? { 'data-autofocus': '' } : {})}
        onChange={(event) => {
          edit({ field: event.target.value });
        }}
      />
      <select
        className={styles['input']}
        aria-label={text.dialog.typeLabel(at + 1)}
        value={row.type}
        disabled={props.shown.locked}
        onChange={(event) => {
          edit({ type: event.target.value });
        }}
      >
        {row.types.map((type) => (
          <option key={type.value} value={type.value}>
            {type.label}
          </option>
        ))}
      </select>
      {row.weighted ? (
        <input
          className={`${styles['input'] ?? ''} ${styles['narrow'] ?? ''}`}
          aria-label={text.dialog.weightLabel(at + 1)}
          placeholder={text.dialog.weightPlaceholder}
          inputMode="numeric"
          value={row.weight}
          disabled={props.shown.locked}
          onChange={(event) => {
            edit({ weight: event.target.value });
          }}
        />
      ) : null}
      <RowButtons props={props} at={at} />
    </div>
  );
}

/** **Fields**: the rows, and **+ Field**. */
export function FieldsPart(props: DialogPartProps): React.JSX.Element {
  return (
    <fieldset className={styles['fieldset']}>
      <legend className={styles['legend']}>{text.dialog.fields}</legend>
      {props.shown.rows.map((_row, at) => (
        // The rows have no identity of their own: their place is what the buttons move.
        <FieldLine key={at} props={props} at={at} />
      ))}
      <datalist id={fieldList}>
        {props.fields.map((field) => (
          <option key={field.path} value={field.path} />
        ))}
      </datalist>
      <div>
        <button
          type="button"
          className={styles['button']}
          title={text.dialog.addFieldHint}
          disabled={props.shown.locked}
          onClick={() => {
            withRows(props, [...props.state.form.rows, { field: '', type: '1', weight: '' }]);
          }}
        >
          {text.dialog.addField}
        </button>
      </div>
    </fieldset>
  );
}

function withForm(props: DialogPartProps, form: IndexForm): void {
  props.change({ ...props.state, form });
}

function Flag(props: {
  readonly part: DialogPartProps;
  readonly flag: 'unique' | 'sparse' | 'hidden';
  readonly label: string;
  readonly hint: string;
}): React.JSX.Element {
  const form = props.part.state.form;
  return (
    <label className={styles['check']} title={props.hint}>
      <input
        type="checkbox"
        checked={form[props.flag]}
        disabled={props.part.shown.locked}
        onChange={(event) => {
          withForm(props.part, { ...form, [props.flag]: event.target.checked });
        }}
      />
      {props.label}
    </label>
  );
}

function TtlLine(props: DialogPartProps): React.JSX.Element {
  const form = props.state.form;
  const locked = props.shown.locked;
  return (
    <div className={styles['field-row']}>
      <label className={styles['check']}>
        <input
          type="checkbox"
          checked={form.ttl.on}
          disabled={locked}
          onChange={(event) => {
            withForm(props, { ...form, ttl: { ...form.ttl, on: event.target.checked } });
          }}
        />
        {text.dialog.ttl}
      </label>
      <span>{text.dialog.ttlBefore}</span>
      <input
        className={`${styles['input'] ?? ''} ${styles['narrow'] ?? ''}`}
        aria-label={text.dialog.ttlValue}
        inputMode="numeric"
        value={form.ttl.value}
        disabled={locked}
        onChange={(event) => {
          withForm(props, withTtlTyped(form, event.target.value));
        }}
      />
      <select
        className={styles['input']}
        aria-label={text.dialog.ttlUnit}
        value={form.ttl.unit}
        disabled={locked}
        onChange={(event) => {
          withForm(props, { ...form, ttl: { ...form.ttl, unit: event.target.value as TtlUnit } });
        }}
      >
        {ttlUnits.map((unit) => (
          <option key={unit} value={unit}>
            {unit}
          </option>
        ))}
      </select>
      <span>{text.dialog.ttlAfter}</span>
    </div>
  );
}

function TickedEditor(props: {
  readonly part: DialogPartProps;
  readonly option: 'partial' | 'collation';
}): React.JSX.Element {
  const form = props.part.state.form;
  const ticked = form[props.option];
  const label = props.option === 'partial' ? text.dialog.partial : text.dialog.collation;
  return (
    <div className={styles['option']}>
      <label className={styles['check']}>
        <input
          type="checkbox"
          checked={ticked.on}
          disabled={props.part.shown.locked}
          onChange={(event) => {
            withForm(props.part, { ...form, [props.option]: { ...ticked, on: event.target.checked } });
          }}
        />
        {label}
      </label>
      <MongoshEditor
        label={label}
        field={props.option}
        placeholder={props.option === 'partial' ? text.dialog.partialPlaceholder : text.dialog.collationPlaceholder}
        text={ticked.input.text}
        kind={props.option === 'partial' ? 'filter' : 'index'}
        fields={props.option === 'partial' ? props.part.fields : []}
        multiline={false}
        invalid={ticked.on && ticked.input.parsed.kind === 'invalid'}
        readOnly={props.part.shown.locked}
        onChange={(typed) => {
          withForm(props.part, withTyped(form, props.option, typedInput(typed, Date.now())));
        }}
        onRun={props.part.save}
      />
    </div>
  );
}

function NameLine(props: DialogPartProps): React.JSX.Element {
  const form = props.state.form;
  return (
    <label className={styles['option']}>
      {text.dialog.name}
      <input
        className={styles['input']}
        placeholder={props.shown.namePlaceholder}
        value={form.name}
        disabled={props.shown.locked}
        onChange={(event) => {
          withForm(props, { ...form, name: event.target.value });
        }}
      />
    </label>
  );
}

function LanguageLine(props: DialogPartProps): React.JSX.Element {
  const form = props.state.form;
  return (
    <label className={styles['option']}>
      {text.dialog.language}
      <input
        className={styles['input']}
        placeholder={text.dialog.languagePlaceholder}
        value={form.language}
        disabled={props.shown.locked}
        onChange={(event) => {
          withForm(props, { ...form, language: event.target.value });
        }}
      />
    </label>
  );
}

/** **Options**: the name, the flags, TTL, the partial filter, the collation, the language and the others. */
export function OptionsPart(props: DialogPartProps): React.JSX.Element {
  const form = props.state.form;
  return (
    <fieldset className={styles['fieldset']}>
      <legend className={styles['legend']}>{text.dialog.options}</legend>
      <NameLine {...props} />
      <div className={styles['field-row']}>
        <Flag part={props} flag="unique" label={text.dialog.unique} hint={text.dialog.uniqueHint} />
        <Flag part={props} flag="sparse" label={text.dialog.sparse} hint={text.dialog.sparseHint} />
        <Flag part={props} flag="hidden" label={text.dialog.hidden} hint={text.dialog.hiddenHint} />
      </div>
      <TtlLine {...props} />
      <TickedEditor part={props} option="partial" />
      <TickedEditor part={props} option="collation" />
      {props.shown.language ? <LanguageLine {...props} /> : null}
      <div className={styles['option']}>
        <span>{text.dialog.more}</span>
        <MongoshEditor
          label={text.dialog.more}
          field="more"
          placeholder={text.dialog.morePlaceholder}
          text={form.more.text}
          kind="index"
          fields={[]}
          multiline={false}
          invalid={form.more.parsed.kind === 'invalid'}
          readOnly={props.shown.locked}
          onChange={(typed) => {
            withForm(props, { ...form, more: typedInput(typed, Date.now()) });
          }}
          onRun={props.save}
        />
      </div>
    </fieldset>
  );
}

/** **Text**: **Keys** and **Options**, in mongosh syntax. */
export function TextPart(props: DialogPartProps): React.JSX.Element {
  const editor = (input: 'keys' | 'options'): React.JSX.Element => (
    <div className={styles['option']}>
      <span>{input === 'keys' ? text.dialog.keys : text.dialog.options}</span>
      <MongoshEditor
        label={input === 'keys' ? text.dialog.keys : text.dialog.options}
        field={input}
        placeholder={input === 'keys' ? text.dialog.keysPlaceholder : text.dialog.optionsPlaceholder}
        text={props.state[input].text}
        kind="index"
        fields={input === 'keys' ? props.fields : []}
        multiline
        maxHeight={160}
        invalid={props.state[input].parsed.kind === 'invalid'}
        readOnly={props.shown.locked}
        {...(input === 'keys' ? { focusRequest: 1 } : {})}
        onChange={(typed) => {
          props.change({ ...props.state, [input]: typedInput(typed, Date.now()) });
        }}
        onRun={props.save}
      />
    </div>
  );
  return (
    <>
      {editor('keys')}
      {editor('options')}
    </>
  );
}
