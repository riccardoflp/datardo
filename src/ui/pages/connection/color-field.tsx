/**
 * **Color** of the connection form (`connection.form`): **None**, the eleven presets, the custom color chosen, and
 * **Custom color…**, which opens **Choose a color** (`connection.custom-color@form`) on the color in use; **Apply**
 * puts the color in **Color**, **Cancel** leaves it as it was. A swatch beside the list shows the color.
 */
import { useId, useState } from 'react';
import type { ChoiceView, FieldView } from '../../../features/connection/form';
import { colorOfText, type ConnectionColor } from '../../../shared/color';
import { colorAttributes } from '../../components/color';
import { CustomColorDialog } from '../../connection/custom-color-dialog';
import styles from './connection-pages.module.css';

/** What the field is given: how it is shown, the color in the form (`''` for none), the list, and the form's name. */
export interface ColorFieldProps {
  readonly field: FieldView | undefined;
  readonly value: ConnectionColor | '';
  readonly choices: readonly ChoiceView[];
  /** The name of the connection, for the line **Color of <name>** of the dialog. */
  readonly name: string;
  readonly onChange: (value: ConnectionColor | '') => void;
}

const customValue = 'custom';

/** The list **Color**, with its swatch and the dialog of **Custom color…**. */
export function ColorField({ field, value, choices, name, onChange }: ColorFieldProps): React.JSX.Element | null {
  const id = useId();
  const [choosing, setChoosing] = useState(false);
  if (field === undefined) {
    return null;
  }
  const custom = choices.find((choice) => choice.value === customValue);
  return (
    <div className={styles['field']}>
      <label htmlFor={id} className={styles['label']}>
        {field.label}
      </label>
      <div className={styles['color-row']}>
        <span className={styles['color-swatch']} {...colorAttributes(value === '' ? undefined : value)} />
        <select
          id={id}
          className={styles['input']}
          value={value}
          disabled={field.disabled}
          data-field="color"
          data-feature={field.element}
          aria-invalid={field.marked ? true : undefined}
          onChange={(event) => {
            if (event.target.value === customValue) {
              setChoosing(true);
              return;
            }
            onChange(colorOfText(event.target.value) ?? '');
          }}
        >
          {choices.map((choice) => (
            <option key={choice.value} value={choice.value} data-feature={choice.element}>
              {choice.label}
            </option>
          ))}
        </select>
      </div>
      {choosing && custom !== undefined ? (
        <CustomColorDialog
          name={name}
          start={value === '' ? 'blue' : value}
          onApply={(color) => {
            setChoosing(false);
            onChange(color);
          }}
          onCancel={() => {
            setChoosing(false);
          }}
        />
      ) : null}
    </div>
  );
}
