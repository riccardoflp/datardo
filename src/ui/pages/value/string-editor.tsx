/**
 * The editor of a string in its key tab (`value.show`, `value.format`, `value.save-string`, `value.read-string`,
 * `value.copy`): **Text**, **JSON** and **Hex**, **Save** (`Ctrl+S`) and **Revert**, **Copy** with **Value**, **As
 * hexadecimal** and **As a command**; the value in the format shown, its length, the notes of a part not loaded, and
 * under it what a save refused or did not save. A text typed is kept until it is saved, reverted or refreshed away.
 */
import { useState } from 'react';
import { shown, type Format } from '../../../features/value/format';
import { bytesShown } from '../../../features/value/read-string';
import type { ValueView } from '../../../features/value/show';
import { readText } from '../../../features/value/text';
import { typedBytes } from '../../../features/value/typed-bytes';
import { isSameBytes } from '../../../features/value/types';
import { KeysMenu, type OpenKeysMenu } from '../keys/keys-menu';
import { copyString, revertString, saveString, stringFormat } from './value-actions';
import { loadMore, loadWhole } from './value-reads';
import { changeValue, type ValueTab } from './value-store';
import styles from './value.module.css';

const formatOf: Readonly<Record<string, Format>> = { Text: 'text', JSON: 'json', Hex: 'hex' };

/** The copy menu's entries: **Value**, **As hexadecimal**, **As a command**. */
export const stringCopies = [
  { label: 'Value', as: 'value' },
  { label: 'As hexadecimal', as: 'hex' },
  { label: 'As a command', as: 'command' },
] as const;

/** **Text**, **JSON** or **Hex** chosen: the text typed is carried to the new format, or what cannot be read is said. */
function chooseFormat(tabId: string, tab: ValueTab, format: Format): void {
  const loaded = bytesShown(tab.string ?? { length: 0, loaded: new Uint8Array() });
  if (tab.draft === undefined) {
    changeValue(tabId, (now) => ({ ...now, choices: { ...now.choices, value: format } }));
    return;
  }
  const typed = typedBytes(tab.draft, stringFormat(tab), loaded);
  if ('problem' in typed) {
    changeValue(tabId, (now) => ({ ...now, line: { kind: 'problem', text: typed.problem } }));
    return;
  }
  const next = shown(typed.bytes, format, 'full');
  if (!next.editable) {
    changeValue(tabId, (now) => ({ ...now, line: { kind: 'problem', text: next.note ?? '' } }));
    return;
  }
  changeValue(tabId, (now) => {
    const { draft: _draft, line: _line, ...rest } = now;
    const choices = { ...now.choices, value: format };
    return isSameBytes(typed.bytes, loaded) ? { ...rest, choices } : { ...rest, choices, draft: next.text };
  });
}

function typed(tabId: string, text: string, loadedText: string): void {
  changeValue(tabId, (now) => {
    const { draft: _draft, line: _line, ...rest } = now;
    return text === loadedText ? rest : { ...rest, draft: text };
  });
}

/** The toolbar of a string: the formats, **Save** and **Revert** (not on a read-only connection), **Copy**. */
function StringToolbar(props: {
  readonly tabId: string;
  readonly tab: ValueTab;
  readonly shown: ValueView;
  readonly format: Format;
  readonly whole: boolean;
}): React.JSX.Element {
  const { tabId, tab, format } = props;
  const [menu, setMenu] = useState<OpenKeysMenu | undefined>(undefined);
  const controls = props.shown.toolbar;
  const formats = controls.filter((control) => formatOf[control.label] !== undefined);
  const has = (label: string): boolean => controls.some((control) => control.label === label);
  return (
    <div className={styles['toolbar']} role="toolbar" aria-label="Value">
      <span className={styles['formats']} role="group" aria-label="Format">
        {formats.map((control) => (
          <button
            key={control.label}
            type="button"
            className={styles['button']}
            data-feature="value.format@toolbar"
            aria-pressed={formatOf[control.label] === format}
            onClick={() => {
              chooseFormat(tabId, tab, formatOf[control.label] ?? 'text');
            }}
          >
            {control.label}
          </button>
        ))}
      </span>
      {has('Save') ? (
        <button
          type="button"
          className={styles['button']}
          data-feature="value.save-string@toolbar"
          aria-keyshortcuts="Control+S"
          title="Ctrl+S"
          disabled={tab.draft === undefined || !props.whole}
          onClick={() => void saveString(tabId)}
        >
          Save
        </button>
      ) : null}
      {has('Revert') ? (
        <button
          type="button"
          className={styles['button']}
          disabled={tab.draft === undefined}
          onClick={() => {
            revertString(tabId);
          }}
        >
          Revert
        </button>
      ) : null}
      <button
        type="button"
        className={styles['button']}
        data-feature="value.copy@toolbar"
        aria-haspopup="menu"
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          setMenu({
            label: 'Copy',
            x: box.left,
            y: box.bottom,
            items: stringCopies.map((entry) => ({
              label: entry.label,
              element: 'value.copy@toolbar',
              choose: () => void copyString(tabId, entry.as),
            })),
          });
        }}
      >
        Copy
      </button>
      <span className={styles['count']}>{props.shown.editor?.length}</span>
      <KeysMenu
        menu={menu}
        onClose={() => {
          setMenu(undefined);
        }}
      />
    </div>
  );
}

/** The string's editor, with its toolbar, its notes and the line of what a save refused. */
export function StringEditor(props: {
  readonly tabId: string;
  readonly tab: ValueTab;
  readonly shown: ValueView;
}): React.JSX.Element | null {
  const { tabId, tab, shown: view } = props;
  const editor = view.editor;
  if (editor === undefined) {
    return null;
  }
  const whole = editor.more.length === 0;
  const text = tab.draft ?? editor.text;
  return (
    <>
      <StringToolbar tabId={tabId} tab={tab} shown={view} format={editor.format} whole={whole} />
      <div className={styles['editor']}>
        <textarea
          className={styles['text']}
          aria-label={`Value of ${view.count ?? ''}`.trim()}
          data-feature="value.save-string@editor"
          aria-keyshortcuts="Control+S"
          spellCheck={false}
          readOnly={!editor.editable}
          value={text}
          onChange={(event) => {
            typed(tabId, event.target.value, editor.text);
          }}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
              event.preventDefault();
              event.stopPropagation();
              if (editor.editable) {
                void saveString(tabId, 'editor');
              }
            }
          }}
        />
        {editor.note === undefined ? null : <p className={styles['line']}>{editor.note}</p>}
        {tab.changedWhileRead === true ? <p className={styles['line']}>{readText.changedWhileRead}</p> : null}
        {tab.line === undefined ? null : (
          <p className={tab.line.kind === 'problem' ? styles['problem'] : styles['line']} role="alert">
            {tab.line.text}
          </p>
        )}
        {editor.more.length === 0 ? null : (
          <div className={styles['buttons']}>
            {editor.more.map((control) => (
              <button
                key={control.label}
                type="button"
                className={styles['button']}
                data-feature="value.read-string@toolbar"
                disabled={tab.loadingMore}
                onClick={() => void (control.label === editor.more[0]?.label ? loadMore(tabId) : loadWhole(tabId))}
              >
                {control.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
