/**
 * The open rule of the Formatting view, under its line (`table.edit-format-rule`): **Name**, **Color the cell of**,
 * **When the document matches** in the mongosh editor with why it cannot be used under it, and the eleven colors; for
 * a field rule, **Name** and the controls of `table.edit-field-rule`.
 * What is typed colors the table at once and is saved a second after the last key, when the box is left or with
 * `Enter`; `Esc` closes the rule and gives the focus back to its line.
 */
import { useId } from 'react';
import type { OpenView } from '../../features/table/formatting';
import type { Document } from '../../features/table/types';
import type { FieldRule, PresetColor } from '../../shared/formatting-rules';
import { MongoshEditor } from '../components/editor/mongosh-editor';
import type { CollectionRef } from '../query/collection-reads';
import { useFieldHints } from '../pages/index/field-hints';
import { FieldRuleOpen } from './formatting-field';
import { flushTyping, typeIn } from './formatting-store';
import styles from './formatting.module.css';

/** What the open rule is given. */
export interface OpenProps {
  readonly open: OpenView;
  readonly collectionRef: CollectionRef;
  /** The time `ISODate()` stands for in a condition: when the page was read. */
  readonly now: number;
  /** The columns of the page, offered in **Color the cell of**. */
  readonly columns: readonly string[];
  /** The field rule open, whose controls replace the condition and the colors. */
  readonly fieldRule?: FieldRule;
  readonly documents: readonly Document[];
  readonly memoryKey: string;
  readonly onColor: (color: PresetColor) => void;
  readonly onClose: () => void;
}

function onEnter(event: React.KeyboardEvent<HTMLInputElement>): void {
  if (event.key === 'Enter') {
    flushTyping();
  }
}

/** The open rule. */
export function FormattingOpen(props: OpenProps): React.JSX.Element {
  const { open, collectionRef: ref, now } = props;
  const id = useId();
  const fields = useFieldHints(ref) ?? [];
  return (
    <div
      className={styles['open']}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.preventDefault();
          props.onClose();
        }
      }}
    >
      <label className={styles['box']}>
        <span>{open.name.label}</span>
        <input
          className={styles['input']}
          data-open-part="name"
          maxLength={200}
          value={open.name.value}
          placeholder={open.name.placeholder}
          title={open.name.tip}
          onChange={(event) => {
            typeIn(ref, 'name', event.target.value, now);
          }}
          onBlur={flushTyping}
          onKeyDown={onEnter}
        />
      </label>
      {props.fieldRule === undefined ? (
        <ConditionParts {...props} id={id} fields={fields} />
      ) : (
        <FieldRuleOpen
          open={open}
          rule={props.fieldRule}
          memoryKey={props.memoryKey}
          collectionRef={ref}
          documents={props.documents}
          now={now}
          columns={props.columns}
        />
      )}
    </div>
  );
}

/** A condition rule's **Color the cell of**, **When the document matches** and colors. */
function ConditionParts(
  props: OpenProps & { readonly id: string; readonly fields: Parameters<typeof MongoshEditor>[0]['fields'] },
): React.JSX.Element {
  const { open, collectionRef: ref, now, id, fields } = props;
  return (
    <>
      <label className={styles['box']}>
        <span>{open.field.label}</span>
        <input
          className={styles['input']}
          data-open-part="field"
          list={`${id}-columns`}
          value={open.field.value}
          placeholder={open.field.placeholder}
          title={open.field.tip}
          aria-invalid={open.field.problem !== undefined}
          aria-describedby={open.field.problem === undefined ? undefined : `${id}-field`}
          onChange={(event) => {
            typeIn(ref, 'field', event.target.value, now);
          }}
          onBlur={flushTyping}
          onKeyDown={onEnter}
        />
        <datalist id={`${id}-columns`}>
          {props.columns.map((column) => (
            <option key={column} value={column} />
          ))}
        </datalist>
        {open.field.problem === undefined ? null : (
          <span id={`${id}-field`} className={styles['problem']}>
            {open.field.problem}
          </span>
        )}
      </label>
      <div className={styles['box']} onBlur={flushTyping}>
        <span id={`${id}-matches`}>{open.condition.label}</span>
        <MongoshEditor
          label={open.condition.label}
          field="condition"
          placeholder={open.condition.placeholder}
          text={open.condition.value}
          kind="filter"
          fields={fields}
          multiline
          invalid={open.condition.problem !== undefined}
          onChange={(typed) => {
            typeIn(ref, 'condition', typed, now);
          }}
          onRun={flushTyping}
        />
        {open.condition.problem === undefined ? null : (
          <span className={styles['problem']} role="status">
            {open.condition.problem}
          </span>
        )}
      </div>
      <div className={styles['box']} role="group" aria-label={open.colors.label}>
        <span aria-hidden="true">{open.colors.label}</span>
        <div className={styles['swatches']}>
          {open.colors.swatches.map((swatch) => (
            <button
              key={swatch.color}
              type="button"
              className={styles['swatch-button']}
              data-format={swatch.color}
              data-feature="table.edit-format-rule@inspector"
              aria-label={swatch.name}
              aria-pressed={swatch.chosen}
              title={swatch.name}
              onClick={() => {
                props.onColor(swatch.color);
              }}
            />
          ))}
        </div>
      </div>
    </>
  );
}
