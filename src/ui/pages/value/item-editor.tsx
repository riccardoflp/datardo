/**
 * `value.item-editor`: the editor over a cell of a value's table, for a field's value or its name. It opens with the
 * item whole and selected, in the format `value.format` gives it, with **Text**, **JSON** and **Hex** and the hint of
 * its keys: `Enter` saves (`value.edit-field`, `value.rename-field`), `Shift+Enter` breaks the line, `Esc` or a click
 * elsewhere cancels. A long item, or one of several lines, opens the same editor as a dialog with **Save**
 * (`Ctrl+Enter`) and **Cancel**. What cannot be read, and what the write refused, take the place of the hint.
 */
import { useEffect, useRef } from 'react';
import type { Format } from '../../../features/value/format';
import { editorText, view, type ItemEditorView } from '../../../features/value/item-editor';
import { rowName, type ValueRow } from '../../../features/value/show';
import { viewText } from '../../../features/value/text';
import { typedBytes } from '../../../features/value/typed-bytes';
import { nameText } from '../../../features/value/types';
import { Dialog, DialogButton } from '../../shell/dialog';
import { cellOf, saveCell } from './value-actions';
import { changeValue, type CellEditing } from './value-store';
import styles from './value.module.css';

type OpenEditor = Extract<ItemEditorView, { open: true }>;

const formatOf: Readonly<Record<string, Format>> = { Text: 'text', JSON: 'json', Hex: 'hex' };

/** Closes the editor: nothing is written. */
export function closeEditor(tabId: string): void {
  changeValue(tabId, (now) => {
    const { editing: _editing, ...rest } = now;
    return rest;
  });
}

/** What the editor shows for the cell being edited of a row. */
export function editorOf(editing: CellEditing, row: ValueRow): ItemEditorView {
  return view({
    cell: editing.cell,
    bytes: cellOf(row, editing.column),
    name: nameText(rowName(row)),
    readOnly: false,
    ...(editing.choice === undefined ? {} : { choice: editing.choice }),
    ...(editing.typed === undefined ? {} : { typed: editing.typed }),
    ...(editing.refused === undefined ? {} : { refused: editing.refused }),
  });
}

/** Another format chosen: the text typed is carried over when it can be read, and stays as it is when it cannot. */
function chooseFormat(
  tabId: string,
  on: { readonly shown: OpenEditor; readonly row: ValueRow; readonly editing: CellEditing },
  label: string,
): void {
  const { shown, row, editing } = on;
  const format = formatOf[label] ?? 'text';
  const original = cellOf(row, editing.column);
  const read =
    editing.typed === undefined ? { bytes: original } : typedBytes(editing.typed, shown.format ?? 'text', original);
  if ('problem' in read) {
    return;
  }
  changeValue(tabId, (now) => {
    if (now.editing === undefined) {
      return now;
    }
    const { typed: _typed, refused: _refused, ...open } = now.editing;
    const text = editorText(read.bytes, format);
    return {
      ...now,
      editing: { ...open, choice: format, ...(text === editorText(original, format) ? {} : { typed: text }) },
    };
  });
}

/** `Enter` or **Save**: nothing is sent while what is typed cannot be read. */
function save(tabId: string, shown: OpenEditor, editing: CellEditing): void {
  if (shown.line.kind === 'problem' && editing.refused === undefined) {
    return;
  }
  void saveCell(tabId, editing.typed ?? shown.text, shown.format ?? 'text');
}

function Formats(props: {
  readonly tabId: string;
  readonly shown: OpenEditor;
  readonly row: ValueRow;
  readonly editing: CellEditing;
}) {
  const { tabId, shown, row, editing } = props;
  return (
    <span className={styles['formats']} role="group" aria-label="Format">
      {shown.formats.map((control) => (
        <button
          key={control.label}
          type="button"
          className={styles['button']}
          data-feature={control.element}
          aria-pressed={formatOf[control.label] === shown.format}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => {
            chooseFormat(tabId, { shown, row, editing }, control.label);
          }}
        >
          {control.label}
        </button>
      ))}
    </span>
  );
}

function Line({ shown }: { readonly shown: OpenEditor }): React.JSX.Element {
  return (
    <p
      className={shown.line.kind === 'problem' ? styles['problem'] : styles['line']}
      role={shown.line.kind === 'problem' ? 'alert' : undefined}
    >
      {shown.line.text}
    </p>
  );
}

function typedIn(tabId: string, text: string, opened: string): void {
  changeValue(tabId, (now) => {
    if (now.editing === undefined) {
      return now;
    }
    const { typed: _typed, refused: _refused, ...open } = now.editing;
    return { ...now, editing: text === opened ? open : { ...open, typed: text } };
  });
}

/** The editor over the cell, at the row's place in the table. */
export function CellEditor(props: {
  readonly tabId: string;
  readonly row: ValueRow;
  readonly editing: CellEditing;
}): React.JSX.Element | null {
  const { tabId, row, editing } = props;
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [editing.row, editing.column]);
  const shown = editorOf(editing, row);
  if (!shown.open) {
    return null;
  }
  if (shown.as === 'dialog') {
    return <DialogEditor tabId={tabId} row={row} editing={editing} shown={shown} />;
  }
  return (
    <div
      className={styles['cell-editor']}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
      }}
      onContextMenu={(event) => {
        event.stopPropagation();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          closeEditor(tabId);
        }
      }}
    >
      <textarea
        ref={input}
        className={styles['cell-input']}
        aria-label={`${editing.column} of ${nameText(rowName(row))}`}
        data-feature={shown.save.element}
        rows={1}
        spellCheck={false}
        value={editing.typed ?? shown.text}
        onChange={(event) => {
          typedIn(tabId, event.target.value, shown.text);
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') {
            event.preventDefault();
            closeEditor(tabId);
          } else if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            save(tabId, shown, editing);
          }
        }}
      />
      <Formats tabId={tabId} shown={shown} row={row} editing={editing} />
      <Line shown={shown} />
    </div>
  );
}

/** The editor of a long item, or of one of several lines: a dialog. */
function DialogEditor(props: {
  readonly tabId: string;
  readonly row: ValueRow;
  readonly editing: CellEditing;
  readonly shown: OpenEditor;
}): React.JSX.Element {
  const { tabId, row, editing, shown } = props;
  return (
    <Dialog
      title={shown.title ?? ''}
      kind="form"
      onCancel={() => {
        closeEditor(tabId);
      }}
      buttons={
        <>
          <DialogButton
            onClick={() => {
              closeEditor(tabId);
            }}
          >
            {viewText.cancel}
          </DialogButton>
          <DialogButton
            look="primary"
            feature={shown.save.element}
            onClick={() => {
              save(tabId, shown, editing);
            }}
          >
            {shown.save.label}
          </DialogButton>
        </>
      }
    >
      <Formats tabId={tabId} shown={shown} row={row} editing={editing} />
      <textarea
        className={styles['dialog-input']}
        aria-label={shown.title}
        data-autofocus=""
        aria-keyshortcuts="Control+Enter"
        spellCheck={false}
        value={editing.typed ?? shown.text}
        onChange={(event) => {
          typedIn(tabId, event.target.value, shown.text);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            save(tabId, shown, editing);
          }
        }}
      />
      <Line shown={shown} />
    </Dialog>
  );
}
