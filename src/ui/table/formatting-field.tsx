/**
 * An open field rule of the Formatting view (`table.edit-field-rule`): **Field**, **Color**, **As**, then **Swap
 * colors**, or **Scale** with its color, its ends and **From this page**, or **Palette**; the legend of the page, each
 * value's swatch a button that shows the eleven presets to pin it to one, with **Unpin**; **Pin a value…**. Each
 * control is a change of the rule, saved at once, the table and the legend following; the boxes are saved as the
 * boxes of a condition rule are.
 */
import { useId } from 'react';
import type { FieldChange } from '../../features/table/edit-field-rule';
import type { OpenView } from '../../features/table/formatting';
import {
  pageEnds,
  type FieldBox,
  type FieldSelect,
  type SwatchChoice,
} from '../../features/table/parts/field-rule-view';
import { text } from '../../features/table/text';
import type { Document } from '../../features/table/types';
import type { FieldRule, FormatRuleId } from '../../shared/formatting-rules';
import type { CollectionRef } from '../query/collection-reads';
import { changeOpenField, flushTyping, pinningValue, typeIn, type TypedPart } from './formatting-store';
import styles from './formatting.module.css';

/** What the open field rule is given. */
export interface FieldOpenProps {
  readonly open: OpenView;
  readonly rule: FieldRule;
  readonly memoryKey: string;
  readonly collectionRef: CollectionRef;
  readonly documents: readonly Document[];
  readonly now: number;
  readonly columns: readonly string[];
}

function onEnter(event: React.KeyboardEvent<HTMLInputElement>): void {
  if (event.key === 'Enter') {
    flushTyping();
  }
}

function Box({
  box,
  part,
  props,
  list,
}: {
  readonly box: FieldBox;
  readonly part: TypedPart;
  readonly props: FieldOpenProps;
  readonly list?: string;
}): React.JSX.Element {
  const id = useId();
  return (
    <label className={styles['box']}>
      <span>{box.label}</span>
      <input
        className={styles['input']}
        data-open-part={part}
        list={list}
        value={box.value}
        placeholder={box.placeholder}
        title={box.tip}
        aria-invalid={box.problem !== undefined}
        aria-describedby={box.problem === undefined ? undefined : `${id}-problem`}
        onChange={(event) => {
          typeIn(props.collectionRef, part, event.target.value, props.now);
        }}
        onBlur={flushTyping}
        onKeyDown={onEnter}
      />
      {box.problem === undefined ? null : (
        <span id={`${id}-problem`} className={styles['problem']}>
          {box.problem}
        </span>
      )}
    </label>
  );
}

function Select<Value extends string>({
  select,
  onPick,
}: {
  readonly select: FieldSelect<Value>;
  readonly onPick: (value: Value) => void;
}): React.JSX.Element {
  return (
    <label className={styles['box']}>
      <span>{select.label}</span>
      <select
        className={styles['input']}
        data-feature="table.edit-field-rule@inspector"
        value={select.value}
        title={select.tip}
        onChange={(event) => {
          onPick(event.target.value as Value);
        }}
      >
        {select.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Swatches({
  label,
  swatches,
  onChange,
}: {
  readonly label: string;
  readonly swatches: readonly SwatchChoice[];
  readonly onChange: (change: FieldChange) => void;
}): React.JSX.Element {
  return (
    <div className={styles['swatches']} role="group" aria-label={label}>
      {swatches.map((swatch) => (
        <button
          key={swatch.color}
          type="button"
          className={styles['swatch-button']}
          data-format={swatch.color}
          data-feature="table.edit-field-rule@inspector"
          aria-label={swatch.name}
          aria-pressed={swatch.chosen}
          title={swatch.name}
          onClick={() => {
            onChange(swatch.change);
          }}
        />
      ))}
    </div>
  );
}

function Legend({
  shown,
  onChange,
  memoryKey,
}: {
  readonly shown: NonNullable<OpenView['fieldRule']>;
  readonly onChange: (change: FieldChange) => void;
  readonly memoryKey: string;
}): React.JSX.Element {
  return (
    <div className={styles['box']}>
      <span id={`${memoryKey}-legend`}>{shown.legend.label}</span>
      <ul className={styles['legend']} aria-label={shown.legend.label}>
        {shown.legend.lines.map((line) => (
          <li key={line.text} className={styles['legend-line']}>
            <div className={styles['legend-value']}>
              {line.swatch === undefined ? (
                <span
                  className={styles['swatch']}
                  data-format={line.paint.color}
                  data-format-outlined={line.paint.outlined === true ? true : undefined}
                  aria-hidden="true"
                />
              ) : (
                <button
                  type="button"
                  className={styles['swatch-button']}
                  data-format={line.paint.color}
                  data-format-outlined={line.paint.outlined === true ? true : undefined}
                  aria-label={line.swatch.label}
                  aria-expanded={line.pinning !== undefined}
                  title={line.swatch.tip}
                  onClick={() => {
                    pinningValue(memoryKey, line.text);
                  }}
                />
              )}
              <span className={styles['cut']}>{line.text}</span>
              <span className={styles['count']}>{line.count}</span>
              {line.pinned ? (
                <span
                  className="codicon codicon-pinned"
                  role="img"
                  aria-label={text.fieldRule.pinned}
                  title={text.fieldRule.pinned}
                />
              ) : null}
            </div>
            {line.pinning === undefined ? null : (
              <div className={styles['pinning']}>
                <Swatches label={line.pinning.label} swatches={line.pinning.swatches} onChange={onChange} />
                {line.pinning.unpin === undefined ? null : (
                  <button
                    type="button"
                    className={styles['text-button']}
                    data-feature="table.edit-field-rule@inspector"
                    title={line.pinning.unpin.tip}
                    onClick={() => {
                      if (line.pinning?.unpin !== undefined) {
                        onChange(line.pinning.unpin.change);
                      }
                    }}
                  >
                    {line.pinning.unpin.label}
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {shown.repeats === undefined ? null : <span className={styles['hint']}>{shown.repeats}</span>}
      {shown.noValues === undefined ? null : <span className={styles['hint']}>{shown.noValues}</span>}
    </div>
  );
}

/** For a scale: **Scale**, its color, its bar, its two ends and **From this page**. */
function ScaleControls({
  scale,
  props,
  onChange,
}: {
  readonly scale: NonNullable<NonNullable<OpenView['fieldRule']>['scale']>;
  readonly props: FieldOpenProps;
  readonly onChange: (change: FieldChange) => void;
}): React.JSX.Element {
  return (
    <>
      <Select
        select={scale.kind}
        onPick={(scale) => {
          onChange({ kind: 'scale', scale });
        }}
      />
      {scale.colors === undefined ? null : (
        <div className={styles['box']}>
          <span aria-hidden="true">{scale.colors.label}</span>
          <Swatches label={scale.colors.label} swatches={scale.colors.swatches} onChange={onChange} />
        </div>
      )}
      <span
        className={styles['scale-bar']}
        data-wide="true"
        data-format={scale.bar.from ?? scale.bar.to}
        data-format-toward={scale.bar.to}
        data-faint={scale.bar.from === undefined}
        role="img"
        aria-label={scale.bar.label}
        title={scale.bar.label}
      />
      <div className={styles['ends']}>
        <Box box={scale.min} part="min" props={props} />
        <Box box={scale.max} part="max" props={props} />
      </div>
      <button
        type="button"
        className={styles['text-button']}
        data-feature="table.edit-field-rule@inspector"
        title={scale.fromPage.tip}
        onClick={() => {
          onChange(scale.fromPage.change);
        }}
      >
        {scale.fromPage.label}
      </button>
    </>
  );
}

/** The open field rule's controls, after its **Name**. */
export function FieldRuleOpen(props: FieldOpenProps): React.JSX.Element | null {
  const shown = props.open.fieldRule;
  const id = useId();
  if (shown === undefined) {
    return null;
  }
  const ruleId: FormatRuleId = props.rule.id;
  const onChange = (change: FieldChange): void => {
    changeOpenField(props.collectionRef, ruleId, change, props.now);
  };
  return (
    <>
      <Box box={shown.field} part="field" props={props} list={`${id}-columns`} />
      <datalist id={`${id}-columns`}>
        {props.columns.map((column) => (
          <option key={column} value={column} />
        ))}
      </datalist>
      <Select
        select={shown.target}
        onPick={(target) => {
          onChange({ kind: 'target', target });
        }}
      />
      <Select
        select={shown.mode}
        onPick={(mode) => {
          onChange({ kind: 'mode', mode, ends: pageEnds(props.rule, props.documents) });
        }}
      />
      {shown.swap === undefined ? null : (
        <button
          type="button"
          className={styles['text-button']}
          data-feature="table.edit-field-rule@inspector"
          title={shown.swap.tip}
          onClick={() => {
            if (shown.swap !== undefined) {
              onChange(shown.swap.change);
            }
          }}
        >
          {shown.swap.label}
        </button>
      )}
      {shown.scale === undefined ? null : <ScaleControls scale={shown.scale} props={props} onChange={onChange} />}
      {shown.palette === undefined ? null : (
        <Select
          select={shown.palette}
          onPick={(palette) => {
            onChange({ kind: 'palette', palette });
          }}
        />
      )}
      <Legend shown={shown} onChange={onChange} memoryKey={props.memoryKey} />
      {shown.pinValue === undefined ? null : (
        <label className={styles['box']}>
          <span>{shown.pinValue.label}</span>
          <input
            className={styles['input']}
            data-open-part="pin"
            data-feature="table.edit-field-rule@inspector"
            value={shown.pinValue.value}
            placeholder={shown.pinValue.placeholder}
            title={shown.pinValue.tip}
            aria-invalid={shown.pinValue.problem !== undefined}
            aria-describedby={shown.pinValue.problem === undefined ? undefined : `${id}-pin`}
            onChange={(event) => {
              typeIn(props.collectionRef, 'pin', event.target.value, props.now);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && shown.pinValue !== undefined && shown.pinValue.value.trim() !== '') {
                event.preventDefault();
                onChange({ kind: 'pin-value', text: shown.pinValue.value });
              }
            }}
          />
          {shown.pinValue.problem === undefined ? null : (
            <span id={`${id}-pin`} className={styles['problem']} role="status">
              {shown.pinValue.problem}
            </span>
          )}
        </label>
      )}
    </>
  );
}
