/**
 * One row of the query builder (`query.builder`): the field with the fields of the collection as suggestions, the
 * operator, the value (a text with the frequent values of the field, the list of BSON types, or nothing), and the
 * button that removes the row. `Enter` in the row runs the query. In the query pane (`query.position`) a row takes two
 * lines: the field and the button that removes the row, then the operator and the value.
 */
import { useId } from 'react';
import type { RowView } from '../../features/query/builder';
import type { BuilderOperator, BuilderRow } from '../../features/query/builder-filter';
import styles from './query-bar.module.css';

/** What a row does when it is changed, removed or asks for the query to run. */
export interface RowActions {
  readonly change: (row: BuilderRow) => void;
  readonly operator: (operator: BuilderOperator) => void;
  readonly remove: () => void;
  readonly run: () => void;
  readonly needFields: () => void;
}

function runOnEnter(run: () => void) {
  return (event: React.KeyboardEvent): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      run();
    }
  };
}

function ValueControl({
  view,
  row,
  actions,
}: {
  readonly view: RowView;
  readonly row: BuilderRow;
  readonly actions: RowActions;
}): React.JSX.Element | null {
  const listId = useId();
  const { value } = view;
  if (value.kind === 'none') {
    return null;
  }
  if (value.kind === 'types') {
    return (
      <select
        className={`${styles['select'] ?? ''} ${styles['row-value'] ?? ''}`}
        aria-label={value.name}
        value={value.value}
        data-feature="query.builder@query-bar"
        onChange={(event) => {
          actions.change({ ...row, value: event.target.value });
        }}
        onKeyDown={runOnEnter(actions.run)}
      >
        {value.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  return (
    <>
      <input
        className={`${styles['input'] ?? ''} ${styles['row-value'] ?? ''}`}
        aria-label={value.name}
        placeholder={value.placeholder}
        value={value.value}
        list={value.suggestions.length === 0 ? undefined : listId}
        data-feature="query.builder@query-bar"
        onChange={(event) => {
          actions.change({ ...row, value: event.target.value });
        }}
        onKeyDown={runOnEnter(actions.run)}
      />
      {value.suggestions.length === 0 ? null : (
        <datalist id={listId}>
          {value.suggestions.map((each) => (
            <option key={each} value={each} />
          ))}
        </datalist>
      )}
    </>
  );
}

/** A row of the builder. */
export function BuilderRowControls(props: {
  readonly view: RowView;
  readonly row: BuilderRow;
  readonly actions: RowActions;
}): React.JSX.Element {
  const { view, row, actions } = props;
  const fieldsId = useId();
  return (
    <div className={styles['builder-row']} data-dashed={view.dashed}>
      <input
        className={`${styles['input'] ?? ''} ${styles['row-field'] ?? ''}`}
        aria-label={view.field.name}
        placeholder={view.field.placeholder}
        value={view.field.value}
        list={fieldsId}
        data-feature="query.builder@query-bar"
        onFocus={actions.needFields}
        onChange={(event) => {
          actions.change({ ...row, field: event.target.value });
        }}
        onKeyDown={runOnEnter(actions.run)}
      />
      <datalist id={fieldsId}>
        {view.field.suggestions.map((each) => (
          <option key={each} value={each} />
        ))}
      </datalist>
      <select
        className={`${styles['select'] ?? ''} ${styles['row-operator'] ?? ''}`}
        aria-label={view.operator.name}
        value={view.operator.value}
        data-feature="query.builder@query-bar"
        onChange={(event) => {
          actions.operator(event.target.value as BuilderOperator);
        }}
        onKeyDown={runOnEnter(actions.run)}
      >
        {view.operator.options.map((option) => (
          <option key={option.operator} value={option.operator} title={option.tip}>
            {option.label}
          </option>
        ))}
      </select>
      <ValueControl view={view} row={row} actions={actions} />
      <button
        type="button"
        className={`${styles['button'] ?? ''} ${styles['row-remove'] ?? ''}`}
        aria-label={view.remove.tip}
        title={view.remove.tip}
        data-feature={view.remove.element}
        onClick={actions.remove}
      >
        <span className="codicon codicon-close" aria-hidden="true" />
      </button>
    </div>
  );
}
