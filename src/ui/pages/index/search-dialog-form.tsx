/**
 * The form of the search index dialog (`index.search-dialog`): **Name** and the type; for **Search** the mapping and
 * **Fields**; for **Vector Search** **Path**, **Dimensions**, **Similarity**, **Quantization** and **Filter fields**.
 * Every change rewrites the definition (`index.search-form`).
 */
import {
  switchedType,
  withFieldTicked,
  withMapping,
  withVector,
  type SearchDialogState,
  type SearchDialogView,
  type SearchFieldRow,
} from '../../../features/index/search-dialog';
import type { VectorForm } from '../../../features/index/search-form';
import { text } from '../../../features/index/text';
import styles from './index.module.css';

/** What a part of the search index dialog is given. */
export interface SearchPartProps {
  readonly state: SearchDialogState;
  readonly shown: SearchDialogView;
  readonly locked: boolean;
  readonly change: (state: SearchDialogState) => void;
}

const vectorPathList = 'search-dialog-vector-paths';

/** **Name** and the type. */
export function NameAndType(props: SearchPartProps): React.JSX.Element {
  const { shown, state } = props;
  return (
    <div className={styles['field-row']}>
      <label className={styles['option']} title={shown.name.hint}>
        {text.searchDialog.name}
        <input
          className={styles['input']}
          placeholder={shown.name.placeholder}
          value={shown.name.value}
          disabled={props.locked || shown.name.locked}
          data-autofocus=""
          onChange={(event) => {
            props.change({ ...state, name: event.target.value });
          }}
        />
      </label>
      <label className={styles['option']}>
        {text.searchDialog.type}
        <select
          className={styles['input']}
          value={shown.type.value}
          disabled={props.locked || shown.type.locked}
          onChange={(event) => {
            props.change(switchedType(state, event.target.value as SearchDialogState['type']));
          }}
        >
          <option value="search">{text.searchDialog.typeLabels.search}</option>
          <option value="vectorSearch">{text.searchDialog.typeLabels.vectorSearch}</option>
        </select>
      </label>
    </div>
  );
}

function Boxes(props: {
  readonly legend: string;
  readonly hint: string;
  readonly rows: readonly SearchFieldRow[];
  readonly empty?: string;
  readonly locked: boolean;
  readonly tick: (path: string, on: boolean) => void;
}): React.JSX.Element {
  return (
    <fieldset className={styles['fieldset']} title={props.hint}>
      <legend className={styles['legend']}>{props.legend}</legend>
      {props.empty === undefined ? null : <p className={styles['muted']}>{props.empty}</p>}
      <div className={styles['boxes']}>
        {props.rows.map((row) => (
          <label key={row.path} className={styles['check']} title={row.tooltip}>
            <input
              type="checkbox"
              checked={row.ticked}
              disabled={props.locked || !row.enabled}
              onChange={(event) => {
                props.tick(row.path, event.target.checked);
              }}
            />
            <span className={styles['code']}>{row.path}</span>
            {row.types.length === 0 ? null : <span className={styles['muted']}>{row.types.join(', ')}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** **Dynamic mapping**, **Static mappings** and **Fields**. */
export function SearchPart(props: SearchPartProps): React.JSX.Element {
  const { state, shown } = props;
  return (
    <>
      <div className={styles['field-row']}>
        <button
          type="button"
          className={styles['button']}
          title={text.searchDialog.dynamicHint}
          disabled={props.locked}
          onClick={() => {
            props.change(withMapping(state, 'dynamic'));
          }}
        >
          {text.searchDialog.dynamic}
        </button>
        <button
          type="button"
          className={styles['button']}
          title={text.searchDialog.staticHint}
          disabled={props.locked}
          onClick={() => {
            props.change(withMapping(state, 'static'));
          }}
        >
          {text.searchDialog.static}
        </button>
      </div>
      <Boxes
        legend={text.searchDialog.fields}
        hint={text.searchDialog.fieldsHint}
        rows={shown.fields}
        {...(shown.fieldsEmpty === undefined ? {} : { empty: shown.fieldsEmpty })}
        locked={props.locked}
        tick={(path, on) => {
          props.change(withFieldTicked(state, path, on));
        }}
      />
    </>
  );
}

function Choice(props: {
  readonly label: string;
  readonly hint?: string;
  readonly value: string;
  readonly choices: readonly string[];
  readonly locked: boolean;
  readonly pick: (value: string) => void;
}): React.JSX.Element {
  return (
    <label className={styles['option']} title={props.hint}>
      {props.label}
      <select
        className={styles['input']}
        value={props.value}
        disabled={props.locked}
        onChange={(event) => {
          props.pick(event.target.value);
        }}
      >
        {props.choices.map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
      </select>
    </label>
  );
}

/** **Path**, **Dimensions**, **Similarity**, **Quantization** and **Filter fields**. */
export function VectorPart(props: SearchPartProps): React.JSX.Element | null {
  const { state, shown } = props;
  const vector = shown.vector;
  if (vector === undefined) {
    return null;
  }
  const set = (change: Partial<VectorForm>): void => {
    props.change(withVector(state, change));
  };
  return (
    <>
      <div className={styles['field-row']}>
        <label className={styles['option']}>
          {text.searchDialog.path}
          <input
            className={styles['input']}
            list={vectorPathList}
            value={vector.path}
            disabled={props.locked}
            onChange={(event) => {
              set({ path: event.target.value });
            }}
          />
          <datalist id={vectorPathList}>
            {vector.paths.map((path) => (
              <option key={path.path} value={path.path} label={path.label} />
            ))}
          </datalist>
        </label>
        <label className={styles['option']}>
          {text.searchDialog.dimensions}
          <input
            className={`${styles['input'] ?? ''} ${styles['narrow'] ?? ''}`}
            inputMode="numeric"
            value={vector.numDimensions === undefined ? '' : String(vector.numDimensions)}
            disabled={props.locked}
            onChange={(event) => {
              const typed = Number(event.target.value);
              if (Number.isInteger(typed) && typed > 0) {
                set({ numDimensions: typed });
              }
            }}
          />
        </label>
        <Choice
          label={text.searchDialog.similarity}
          value={vector.similarity}
          choices={shown.similarities}
          locked={props.locked}
          pick={(similarity) => {
            set({ similarity });
          }}
        />
        <Choice
          label={text.searchDialog.quantization}
          hint={text.searchDialog.quantizationHint}
          value={vector.quantization}
          choices={shown.quantizations}
          locked={props.locked}
          pick={(quantization) => {
            set({ quantization });
          }}
        />
      </div>
      <Boxes
        legend={text.searchDialog.filterFields}
        hint={text.searchDialog.filterFieldsHint}
        rows={vector.filterRows}
        locked={props.locked}
        tick={(path, on) => {
          set({ filters: on ? [...vector.filters, path] : vector.filters.filter((each) => each !== path) });
        }}
      />
    </>
  );
}
