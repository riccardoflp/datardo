/**
 * `connection.custom-color`: the dialog **Choose a color**, drawn from `src/features/connection/custom-color.ts`. The
 * system's color picker and the field **Color** follow each other; the swatches choose a preset, the arrows moving
 * between them; the preview shows the dot and the band of a card and the icon of a tab in the color read. **Apply**,
 * or `Enter` in the field, gives the color; **Cancel** and `Esc` give nothing.
 */
import { useRef, useState } from 'react';
import { startState, view, withPicked, withSwatch, type CustomColorView } from '../../features/connection/custom-color';
import { isPresetColor, type ConnectionColor, type PresetColor } from '../../shared/color';
import { colorAttributes } from '../components/color';
import { autoFocusAttribute, Dialog, DialogButton } from '../shell/dialog';
import styles from './custom-color-dialog.module.css';

const element = 'connection.custom-color@dialog';

/** What the dialog is given: whose color, the color it starts on, and where the color chosen goes. */
export interface CustomColorDialogProps {
  readonly name: string;
  readonly start: ConnectionColor;
  readonly onApply: (color: ConnectionColor) => void;
  readonly onCancel: () => void;
}

/** The value of a preset's token in the theme in use, as the picker shows it. */
function tokenValue(preset: PresetColor): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--color-connection-${preset}`).trim();
  return /^#[0-9a-f]{6}$/iu.test(value) ? value.toLowerCase() : '#000000';
}

function Swatches({
  shown,
  choose,
}: {
  readonly shown: CustomColorView['swatches'];
  readonly choose: (preset: PresetColor) => void;
}): React.JSX.Element {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = shown.items.findIndex((swatch) => swatch.selected);
  const focusable = selected === -1 ? 0 : selected;
  const move = (from: number, by: number): void => {
    const to = (from + by + shown.items.length) % shown.items.length;
    buttons.current[to]?.focus();
  };
  return (
    <div className={styles['swatches']} role="radiogroup" aria-label={shown.label}>
      {shown.items.map((swatch, index) => (
        <button
          key={swatch.color}
          ref={(button) => {
            buttons.current[index] = button;
          }}
          type="button"
          role="radio"
          className={styles['swatch']}
          aria-checked={swatch.selected}
          aria-label={swatch.label}
          title={swatch.label}
          tabIndex={index === focusable ? 0 : -1}
          data-feature={element}
          {...colorAttributes(swatch.color)}
          onClick={() => {
            choose(swatch.color);
          }}
          onKeyDown={(event) => {
            const by = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
            if (by !== undefined) {
              event.preventDefault();
              move(index, by);
            }
          }}
        />
      ))}
    </div>
  );
}

function Preview({ shown }: { readonly shown: CustomColorView['preview'] }): React.JSX.Element {
  return (
    <div className={styles['preview']} aria-label={shown.label} role="img" {...colorAttributes(shown.color)}>
      <span className={styles['band']} />
      <span className={styles['dot']} />
      <span className={styles['tab']}>
        <span className={`codicon codicon-table ${styles['tab-icon'] ?? ''}`} />
        {shown.tab}
      </span>
    </div>
  );
}

/** The dialog **Choose a color**. */
export function CustomColorDialog({ name, start, onApply, onCancel }: CustomColorDialogProps): React.JSX.Element {
  const [state, setState] = useState(() => startState(name, start));
  const shown = view(state);
  const pickerColor = shown.picker.color;
  const picker =
    pickerColor === undefined ? undefined : isPresetColor(pickerColor) ? tokenValue(pickerColor) : pickerColor;
  const apply = (): void => {
    if (shown.color !== undefined) {
      onApply(shown.color);
    }
  };
  return (
    <Dialog
      title={shown.title}
      kind="form"
      onCancel={onCancel}
      buttons={
        <>
          <DialogButton feature={shown.cancel.element} onClick={onCancel}>
            {shown.cancel.label}
          </DialogButton>
          <DialogButton feature={shown.apply.element} look="primary" disabled={!shown.apply.enabled} onClick={apply}>
            {shown.apply.label}
          </DialogButton>
        </>
      }
    >
      <div className={styles['body']}>
        <p className={styles['line']}>{shown.line}</p>
        <div className={styles['row']}>
          <input
            type="color"
            className={styles['picker']}
            aria-label={shown.picker.label}
            data-feature={element}
            value={picker ?? '#000000'}
            onChange={(event) => {
              setState(withPicked(state, event.target.value));
            }}
          />
          <div className={styles['field']}>
            <label htmlFor="custom-color-field">{shown.field.label}</label>
            <input
              id="custom-color-field"
              className={styles['input']}
              type="text"
              spellCheck={false}
              data-feature={element}
              value={shown.field.value}
              placeholder={shown.field.placeholder}
              aria-invalid={shown.field.problem !== undefined}
              aria-describedby={shown.field.problem === undefined ? undefined : 'custom-color-problem'}
              onChange={(event) => {
                setState({ ...state, text: event.target.value });
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  apply();
                }
              }}
              {...{ [autoFocusAttribute]: '' }}
            />
            {shown.field.problem === undefined ? null : (
              <p id="custom-color-problem" className={styles['problem']} role="alert">
                {shown.field.problem}
              </p>
            )}
          </div>
        </div>
        <Swatches
          shown={shown.swatches}
          choose={(preset) => {
            setState(withSwatch(state, preset));
          }}
        />
        <Preview shown={shown.preview} />
      </div>
    </Dialog>
  );
}
