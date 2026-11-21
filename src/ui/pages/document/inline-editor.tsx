/**
 * The editor over a cell or a line of the inspector's tree (`document.inline-edit`): the value in mongosh syntax,
 * with the hint *Enter to save · Shift+Enter new line · Esc to cancel*, or the error in its place. `Enter` saves,
 * `Shift+Enter` adds a line, `Esc` and a click outside cancel and write nothing.
 */
import { useEffect, useRef } from 'react';
import { text } from '../../../features/document/text';
import { keptCollection } from '../../../features/document/types';
import { undoNoteOf } from '../../../features/document/write/undo-note';
import { oneLineText } from '../../../features/document/write/values';
import { MongoshEditor } from '../../components/editor/mongosh-editor';
import { useAppState } from '../../state/store';
import { placeOfCollection } from './document-actions';
import { saveInlineEdit } from './inline-edit-actions';
import { changeInlineEdit, closeInlineEdit, useInlineEdit, type OpenEdit } from './inline-edit-store';
import styles from './document.module.css';

/** Whether the list of suggestions is open in the editor that has the focus: its keys are the list's then. */
function listOpen(target: EventTarget): boolean {
  return target instanceof HTMLElement && target.getAttribute('aria-haspopup') === 'listbox';
}

function useUndoLine(edit: OpenEdit): string | undefined {
  const state = useAppState();
  const place = placeOfCollection(state, edit.ref, edit.ref.kind === 'view');
  const note = undoNoteOf(place, state.settings, { kind: 'ids', ...keptCollection(place), ids: [edit.id], count: 1 });
  return note.recorded ? undefined : note.line;
}

function OpenEditor({ edit }: { readonly edit: OpenEdit }): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null);
  const undoLine = useUndoLine(edit);
  useEffect(() => {
    const outside = (event: MouseEvent): void => {
      if (event.target instanceof Node && box.current?.contains(event.target) !== true) {
        closeInlineEdit();
      }
    };
    document.addEventListener('mousedown', outside, true);
    return () => {
      document.removeEventListener('mousedown', outside, true);
    };
  }, []);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('[contenteditable]')?.focus();
  }, []);
  const hintId = `inline-edit-hint-${String(edit.number)}`;
  return (
    <div
      ref={box}
      className={styles['inline-editor']}
      style={{ left: edit.box.left, top: edit.box.top, minWidth: Math.max(edit.box.width, 240) }}
      role="dialog"
      aria-label={text.inlineEdit.title(edit.path, oneLineText(edit.id))}
      aria-describedby={hintId}
      data-feature={edit.place === 'inspector' ? 'document.inline-edit@inspector' : 'document.inline-edit@table'}
      onKeyDownCapture={(event) => {
        if (listOpen(event.target)) {
          return;
        }
        if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          event.stopPropagation();
          void saveInlineEdit();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          closeInlineEdit();
        }
      }}
    >
      <MongoshEditor
        label={edit.path}
        field="inline-edit"
        placeholder=""
        text={edit.text}
        kind="document"
        fields={[]}
        multiline
        maxHeight={240}
        invalid={edit.problem !== undefined}
        focusRequest={edit.number}
        onChange={(typed) => {
          changeInlineEdit((before) => ({ ...before, text: typed }));
        }}
        onRun={() => {
          void saveInlineEdit();
        }}
      />
      <p id={hintId} className={edit.problem === undefined ? styles['hint'] : styles['problem']} role="status">
        {edit.problem ?? text.inlineEdit.hint}
        {undoLine === undefined ? null : (
          <>
            <br />
            {undoLine}
          </>
        )}
      </p>
    </div>
  );
}

/** The editor, when one is open. */
export function InlineEditor(): React.JSX.Element | null {
  const edit = useInlineEdit();
  return edit === undefined ? null : <OpenEditor key={edit.number} edit={edit} />;
}
