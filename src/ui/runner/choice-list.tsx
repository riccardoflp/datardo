/**
 * A list to pick from in a question (`runner.ask`): one item (radio buttons) or many (checkboxes), with a filter field
 * once it has more than 8 items.
 */
import type { FieldValue, FieldView } from '../../features/runner/ask';
import { runnerText } from '../../features/runner/text';
import { autoFocusAttribute } from '../shell/dialog';
import styles from './runner.module.css';

/** What the list is given. */
export interface ChoiceListProps {
  readonly shown: FieldView;
  readonly first: boolean;
  readonly filter: string;
  readonly onFilter: (text: string) => void;
  readonly onChange: (value: FieldValue) => void;
  readonly onAnswer: () => void;
}

/** The list of a field to pick one or many from. */
export function ChoiceList({ shown, first, filter, onFilter, onChange, onAnswer }: ChoiceListProps): React.JSX.Element {
  const { field } = shown;
  const many = field.kind === 'pick-many';
  const picked: readonly string[] = Array.isArray(shown.value)
    ? shown.value
    : typeof shown.value === 'string'
      ? [shown.value]
      : [];
  const focusFirst = first && !shown.filtered;
  return (
    <fieldset className={styles['choices']}>
      <legend className={styles['legend']}>{field.label}</legend>
      {shown.filtered ? (
        <input
          className={styles['input']}
          type="search"
          aria-label={runnerText.filterChoices(field.label)}
          value={filter}
          onChange={(event) => {
            onFilter(event.target.value);
          }}
          {...(first ? { [autoFocusAttribute]: '' } : {})}
        />
      ) : null}
      <div className={styles['choiceList']}>
        {shown.choices.length === 0 ? <p className={styles['text']}>{runnerText.noChoiceMatches}</p> : null}
        {shown.choices.map((choice, index) => {
          const checked = picked.includes(choice.value);
          return (
            <label key={choice.value} className={styles['choice']}>
              <input
                type={many ? 'checkbox' : 'radio'}
                name={field.key}
                value={choice.value}
                checked={checked}
                onChange={() => {
                  onChange(
                    many
                      ? checked
                        ? picked.filter((value) => value !== choice.value)
                        : [...picked, choice.value]
                      : choice.value,
                  );
                }}
                onDoubleClick={many ? undefined : onAnswer}
                {...(focusFirst && (checked || (picked.length === 0 && index === 0))
                  ? { [autoFocusAttribute]: '' }
                  : {})}
              />
              {choice.color === undefined ? null : (
                <span className={styles['swatch']} data-color={choice.color} aria-hidden="true" />
              )}
              <span>{choice.label}</span>
              {choice.description === undefined ? null : <span className={styles['muted']}>{choice.description}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
