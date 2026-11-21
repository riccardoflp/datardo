/**
 * The cells of the Schema section that show types and values (`schema.show`): the types of a field, as a bar divided by
 * type when there are several, and what is shown of each type's values: a histogram, the most frequent values, *all
 * distinct, e.g.*, the lengths and elements of an array, the fields of objects. Every type, value and bar that can be
 * clicked adds its condition to the filter (`schema.filter-from-value@table`).
 */
import type { FilterControl, TypeValues, TypesCell, ValuesContent } from '../../../features/schema/show';
import styles from './schema.module.css';

/** What a click on a control that filters does. */
export type OnFilter = (control: FilterControl) => void;

function percent(part: number): string {
  return `${String(Math.round(part * 1000) / 10)}%`;
}

/** The types of a field. */
export function TypesView({ cell, onFilter }: { readonly cell: TypesCell; readonly onFilter: OnFilter }) {
  return (
    <div className={styles['types']}>
      {cell.bar ? (
        <div className={styles['type-bar']} aria-hidden="true">
          {cell.chips.map((chip, index) => (
            <span
              key={chip.type}
              className={styles['type-part']}
              data-part={index % 4}
              style={{ width: percent(chip.part) }}
            />
          ))}
        </div>
      ) : null}
      <div className={styles['chips']}>
        {cell.chips.map((chip) => (
          <button
            key={chip.type}
            type="button"
            className={styles['chip']}
            data-feature={chip.filter.element}
            title={chip.hint}
            onClick={() => {
              onFilter(chip.filter);
            }}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Histogram({
  content,
  onFilter,
}: {
  readonly content: Extract<ValuesContent, { kind: 'histogram' }>;
  readonly onFilter: OnFilter;
}) {
  return (
    <div className={styles['histogram']}>
      <div className={styles['bars']}>
        {content.bars.map((bar, index) => (
          <button
            // The bars of one histogram are in a fixed order, and never move.
            key={index}
            type="button"
            className={styles['bar']}
            data-feature="schema.filter-from-value@table"
            title={bar.hint}
            aria-label={bar.hint}
            disabled={bar.filter === undefined}
            onClick={() => {
              if (bar.filter !== undefined) {
                onFilter(bar.filter);
              }
            }}
          >
            <span className={styles['bar-fill']} style={{ height: percent(bar.height) }} />
          </button>
        ))}
      </div>
      <div className={styles['bounds']}>
        <span>{content.smallest}</span>
        <span>{content.largest}</span>
      </div>
    </div>
  );
}

function ValueChips({
  content,
  onFilter,
}: {
  readonly content: Exclude<ValuesContent, { kind: 'histogram' | 'array' | 'object' }>;
  readonly onFilter: OnFilter;
}) {
  return (
    <div className={styles['chips']}>
      {content.kind === 'all-distinct' ? <span className={styles['muted']}>{content.label}</span> : null}
      {content.values.map((value, index) => (
        <button
          // The values shown are in a fixed order: the most frequent first.
          key={index}
          type="button"
          className={styles['chip']}
          data-feature={value.filter.element}
          title={value.hint}
          onClick={() => {
            onFilter(value.filter);
          }}
        >
          <span className={styles['code']}>{value.text}</span>
          {value.share === undefined ? null : <span className={styles['share']}>{value.share}</span>}
        </button>
      ))}
      {content.kind === 'values' && content.more !== undefined ? (
        <span className={styles['muted']}>{content.more}</span>
      ) : null}
    </div>
  );
}

function Content({ content, onFilter }: { readonly content: ValuesContent; readonly onFilter: OnFilter }) {
  switch (content.kind) {
    case 'histogram':
      return <Histogram content={content} onFilter={onFilter} />;
    case 'values':
    case 'all-distinct':
      return <ValueChips content={content} onFilter={onFilter} />;
    case 'array':
      return (
        <div className={styles['array']}>
          <span className={styles['muted']}>{content.lengths}</span>
          {content.elements === undefined ? null : (
            <div className={styles['elements']}>
              <TypesView cell={content.elements.types} onFilter={onFilter} />
              <ValuesView values={content.elements.values} onFilter={onFilter} />
            </div>
          )}
        </div>
      );
    case 'object':
      return <span className={styles['muted']}>{content.fields}</span>;
  }
}

/** What is shown of the values of each type of a field. */
export function ValuesView({
  values,
  onFilter,
}: {
  readonly values: readonly TypeValues[];
  readonly onFilter: OnFilter;
}) {
  return (
    <div className={styles['values']}>
      {values.map((each, index) => (
        // The types of a field are in a fixed order; a type shows once.
        <div key={each.type ?? index} className={styles['type-values']}>
          {each.type === undefined ? null : <span className={styles['type-name']}>{each.type}</span>}
          <Content content={each.content} onFilter={onFilter} />
        </div>
      ))}
    </div>
  );
}
