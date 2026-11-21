/**
 * Datardo's editor of mongosh text (`query.bar`'s **Filter**, **Sort** and **Project**, and later the other areas
 * that take mongosh syntax): CodeMirror 6 with the colors of `query.highlight` and the suggestions of
 * `query.autocomplete`. The text is the caller's: typing calls `onChange`, and a text given from outside replaces it.
 */
import { useId, useRef, useState } from 'react';
import type { FieldHint } from '../../../features/query/field-hints';
import type { TextKind } from '../../../features/query/suggestions';
import { insertSuggestion } from './completion-state';
import styles from './editor.module.css';
import { SuggestionList } from './suggestion-list';
import { useMongoshEditor } from './use-mongosh-editor';

/** What a mongosh editor is given. */
export interface MongoshEditorProps {
  /** Its accessible name: `Filter`. */
  readonly label: string;
  /** Put as `data-field` on the outer element, for the tests: `filter`. */
  readonly field: string;
  readonly placeholder: string;
  /** The text; when it changes from outside (reset, drop, builder) the editor's text is replaced. */
  readonly text: string;
  /** What the text is, for the suggestions. */
  readonly kind: TextKind;
  /** The fields of the collection; when they change while the list is open, they join it. */
  readonly fields: readonly FieldHint[];
  /** Several lines, growing up to `maxHeight` then scrolling; else one line that scrolls sideways. */
  readonly multiline: boolean;
  /** In px. */
  readonly maxHeight?: number;
  /** Outlined as invalid, and said so to a screen reader. */
  readonly invalid: boolean;
  /** The text can be read and selected, not typed in. */
  readonly readOnly?: boolean;
  /** Each time this number changes, the editor flashes once. */
  readonly flash?: number;
  /** Each time this number changes to one above 0, the editor takes the focus with its text selected. */
  readonly focusRequest?: number;
  readonly onChange: (text: string) => void;
  /** `Ctrl+Enter` (and `Cmd+Enter`), and `Enter` in an editor of one line. */
  readonly onRun: () => void;
  /** The first time the editor gets the focus, so that the fields of the collection are read. */
  readonly onNeedFields?: () => void;
}

/** An editor of mongosh text with its colors and its list of suggestions. */
export function MongoshEditor(props: MongoshEditorProps): React.JSX.Element {
  const listId = useId();
  const parentRef = useRef<HTMLDivElement>(null);
  const { viewRef, list } = useMongoshEditor(parentRef, props, listId);
  const [firstFlash] = useState(props.flash);
  const flashing = props.flash !== undefined && props.flash !== firstFlash;
  return (
    <div
      className={styles.editor}
      data-field={props.field}
      data-invalid={props.invalid}
      data-multiline={props.multiline}
    >
      {flashing ? <span key={props.flash} className={styles.flash} aria-hidden="true" /> : null}
      <div ref={parentRef} className={styles.host} />
      {list === undefined ? null : (
        <SuggestionList
          id={listId}
          shown={list.shown}
          anchor={list.anchor}
          onPick={(index) => {
            const editor = viewRef.current;
            if (editor !== undefined) {
              insertSuggestion(index)(editor);
            }
          }}
        />
      )}
    </div>
  );
}
