/**
 * The parts of CodeMirror a playground's editor adds to Datardo's mongosh editor (`playground.show`): the line
 * numbers, the mark of the line a run failed on, the keys that run (`Ctrl+Enter` the selection or the whole script,
 * `Ctrl+Shift+Enter` the statement at the caret), and the suggestions of `playground.autocomplete`.
 */
import { Prec, StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, keymap, lineNumbers, type Command, type DecorationSet } from '@codemirror/view';
import { completions, type CompletionHints, type CompletionNeed } from '../../../features/playground/autocomplete';
import type { Suggestions } from '../../../features/query/suggestions';
import { closeList } from '../../components/editor/completion-state';
import styles from './playground-page.module.css';

/** Sets the line marked after a failed run, or none. */
export const setFailedLine = StateEffect.define<number | undefined>();

const failedMark = Decoration.line({ class: styles['failed-line'] ?? '', attributes: { 'data-failed': 'true' } });

/** The mark of the line a run failed on. */
const failedLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    let next = marks.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setFailedLine)) {
        const line = effect.value;
        next =
          line === undefined || line < 1 || line > tr.state.doc.lines
            ? Decoration.none
            : Decoration.set([failedMark.range(tr.state.doc.line(line).from)]);
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** What the keys of a playground run: the selection or the whole script, or the statement at the caret. */
export interface RunKeys {
  readonly selectionOrAll: (view: EditorView) => void;
  readonly statement: (view: EditorView) => void;
}

function runKeymap(keys: () => RunKeys): Extension {
  const statement: Command = (view) => {
    closeList(view);
    keys().statement(view);
    return true;
  };
  const selectionOrAll: Command = (view) => {
    closeList(view);
    keys().selectionOrAll(view);
    return true;
  };
  return Prec.highest(
    keymap.of([
      { key: 'Mod-Shift-Enter', run: statement },
      { key: 'Ctrl-Shift-Enter', run: statement },
      { key: 'Mod-Enter', run: selectionOrAll },
      { key: 'Ctrl-Enter', run: selectionOrAll },
    ]),
  );
}

/** The line numbers, in the colors of the theme; lines 24 px apart, as tall as the **Run** button beside them. */
const gutterTheme = EditorView.theme({
  '.cm-scroller': { lineHeight: 'var(--space-5)' },
  '.cm-gutters': {
    backgroundColor: 'var(--color-canvas)',
    color: 'var(--color-text-muted)',
    borderRight: 'var(--border-width) solid var(--color-border)',
  },
});

/** The parts a playground adds, around the mongosh editor's own. */
export function playgroundParts(keys: () => RunKeys): Extension {
  return [runKeymap(keys), lineNumbers(), gutterTheme, failedLineField];
}

/** What autocomplete is asked with: what is known now, and what to do with what it would like to know. */
export interface HintsSource {
  readonly hints: () => CompletionHints;
  readonly need: (needs: readonly CompletionNeed[]) => void;
}

/** The suggestions of `playground.autocomplete` at the cursor, as the list of the editor shows them. */
export function playgroundSuggestions(source: () => HintsSource): (text: string, cursor: number) => Suggestions {
  return (text, cursor) => {
    const { hints, need } = source();
    const found = completions(text, cursor, hints());
    if (found.needs.length > 0) {
      need(found.needs);
    }
    return {
      from: found.from,
      to: found.to,
      prefix: text.slice(found.from, Math.max(found.from, cursor)),
      position: 'value',
      items: found.items.map((item) => ({
        label: item.label,
        kind: item.kind,
        insert: item.insert,
        ...(item.detail === undefined ? {} : { detail: item.detail }),
        ...(item.cursor === undefined ? {} : { cursor: item.cursor }),
      })),
    };
  };
}

/** Puts the caret at the start of a line, in view, with the focus: the link of an error (`playground.results@list`). */
export function showLine(view: EditorView, line: number): void {
  const shown = Math.min(Math.max(1, line), view.state.doc.lines);
  const at = view.state.doc.line(shown).from;
  view.dispatch({ selection: { anchor: at }, scrollIntoView: true });
  view.focus();
}
