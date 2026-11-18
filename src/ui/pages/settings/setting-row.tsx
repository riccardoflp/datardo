/**
 * One setting of the Settings page (`settings.change` in its form): its title, its description, its control, its name, and
 * **Reset** when it is not at its default. A switch and a menu save at the change; a number or a text field saves
 * when it loses the focus or at `Enter`, and only when `settings.validate` accepts the text; `Esc` puts the saved
 * value back (`settings.change`).
 */
import { useId, useState } from 'react';
import { settingsSchema } from '../../../features/settings/read';
import type { SettingRow as Row } from '../../../features/settings/page';
import { settingsText } from '../../../features/settings/text';
import type { SettingValue } from '../../../features/settings/types';
import { settingAsText, settingProblem } from '../../../features/settings/validate';
import { startFeature } from '../../shell/intent';
import styles from './settings-page.module.css';

function change(name: string, value: SettingValue): void {
  startFeature('settings.change', { place: 'form', args: { name, value } });
}

/** The ids that label a control: its title, and its description. */
interface Labels {
  readonly title: string;
  readonly description: string;
}

/** A number or a text field: saved when it loses the focus or at `Enter`, when the text is accepted. */
function TextField({
  row,
  labels,
  disabled,
}: {
  readonly row: Row;
  readonly labels: Labels;
  readonly disabled: boolean;
}): React.JSX.Element {
  const saved = settingAsText(row.value);
  const [text, setText] = useState(saved);
  const problemId = useId();
  const problem = text === saved ? undefined : settingProblem(settingsSchema, row.name, text);
  const save = (): void => {
    if (text !== saved && problem === undefined) {
      change(row.name, text);
    }
  };
  return (
    <div className={styles['field']}>
      <input
        className={styles['input']}
        type="text"
        inputMode={row.control === 'number' ? 'numeric' : 'text'}
        value={text}
        disabled={disabled}
        data-setting={row.name}
        aria-labelledby={labels.title}
        aria-describedby={labels.description}
        aria-invalid={problem === undefined ? undefined : true}
        aria-errormessage={problem === undefined ? undefined : problemId}
        onChange={(event) => {
          setText(event.target.value);
        }}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            save();
          } else if (event.key === 'Escape') {
            setText(saved);
          }
        }}
      />
      {problem === undefined ? null : (
        <p id={problemId} className={styles['problem']} role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}

/** The control of a setting, by the kind its declaration gives. */
function Control({
  row,
  labels,
  disabled,
}: {
  readonly row: Row;
  readonly labels: Labels;
  readonly disabled: boolean;
}): React.JSX.Element {
  switch (row.control) {
    case 'switch':
      return (
        <button
          type="button"
          role="switch"
          className={styles['switch']}
          aria-checked={row.value === true}
          aria-labelledby={labels.title}
          aria-describedby={labels.description}
          data-setting={row.name}
          disabled={disabled}
          onClick={() => {
            change(row.name, row.value !== true);
          }}
        >
          <span className={styles['knob']} aria-hidden="true" />
        </button>
      );
    case 'menu':
      return (
        <select
          className={styles['input']}
          value={String(row.value)}
          disabled={disabled}
          data-setting={row.name}
          aria-labelledby={labels.title}
          aria-describedby={labels.description}
          onChange={(event) => {
            change(row.name, event.target.value);
          }}
        >
          {(row.choices ?? []).map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
      );
    case 'number':
    case 'text':
      return <TextField key={String(row.value)} row={row} labels={labels} disabled={disabled} />;
  }
}

/** One setting, with its control. */
export function SettingRow({ row, disabled }: { readonly row: Row; readonly disabled: boolean }): React.JSX.Element {
  const title = useId();
  const description = useId();
  return (
    <div
      className={styles['setting']}
      data-feature="settings.change@form"
      data-changed={row.changed ? 'true' : undefined}
    >
      <div className={styles['heading']}>
        {row.changed ? <span className={styles['dot']} title={settingsText.changed} aria-hidden="true" /> : null}
        <span id={title} className={styles['title']}>
          {row.title}
        </span>
      </div>
      <p id={description} className={styles['description']}>
        {row.description}
      </p>
      <div className={styles['controls']}>
        <Control row={row} labels={{ title, description }} disabled={disabled} />
        {row.changed ? (
          <button
            type="button"
            className={styles['button']}
            data-feature="settings.reset@form"
            disabled={disabled}
            aria-label={`${settingsText.reset} ${row.title}`}
            onClick={() => {
              startFeature('settings.reset', { place: 'form', args: { name: row.name } });
            }}
          >
            {settingsText.reset}
          </button>
        ) : null}
      </div>
      <span className={styles['name']}>{row.name}</span>
    </div>
  );
}
