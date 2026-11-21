/**
 * The Redis extensions of Datardo's editor, for the input of the console (`console.input`): the colors of a Redis
 * command, read line by line with `lineTokens` (the command's name, quoted text, numbers, escapes, and a quote never
 * closed underlined as an error), the look of the editor's insides, and its accessible name.
 */
import { RangeSetBuilder, type Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { lineTokens, type TokenKind } from '../../../features/console/input';

const marks: Readonly<Record<TokenKind, Decoration>> = {
  command: Decoration.mark({ attributes: { 'data-redis': 'command' } }),
  string: Decoration.mark({ attributes: { 'data-redis': 'string' } }),
  number: Decoration.mark({ attributes: { 'data-redis': 'number' } }),
  escape: Decoration.mark({ attributes: { 'data-redis': 'escape' } }),
  unclosed: Decoration.mark({ attributes: { 'data-redis': 'unclosed' } }),
};

/** Marks one line; the escapes inside a quoted text are marked over it. */
function markLine(builder: RangeSetBuilder<Decoration>, line: { readonly from: number; readonly text: string }): void {
  const tokens = [...lineTokens(line.text)].sort((first, second) => first.from - second.from || second.to - first.to);
  for (const token of tokens) {
    if (token.to > token.from) {
      builder.add(line.from + token.from, line.from + token.to, marks[token.kind]);
    }
  }
}

/** The marks of the lines in view. */
function marked(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const range of view.visibleRanges) {
    for (let position = range.from; position <= range.to;) {
      const line = view.state.doc.lineAt(position);
      markLine(builder, line);
      position = line.to + 1;
    }
  }
  return builder.finish();
}

class RedisColors {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = marked(view);
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = marked(update.view);
    }
  }
}

/** The colors of a Redis command, from the theme's syntax tokens through the style of the component. */
export const redisColors: Extension = ViewPlugin.fromClass(RedisColors, {
  decorations: (plugin) => plugin.decorations,
});

/** Whether a line has a quote that is never closed: the input says so to a screen reader too. */
export function hasUnclosedQuote(text: string): boolean {
  return text.split('\n').some((line) => lineTokens(line).some((token) => token.kind === 'unclosed'));
}

/**
 * The look of the editor's insides, from the tokens, growing to `lines` lines and then scrolling; the frame and the
 * colors are the component's style.
 */
export function redisEditorTheme(lines: number): Extension {
  return EditorView.theme({
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      fontFamily: 'var(--font-family-code)',
      lineHeight: 'var(--line-height)',
      overflow: 'auto',
      maxHeight: `calc(${String(lines)} * var(--line-height) * 1em + 2 * var(--space-1))`,
    },
    '&.cm-editor .cm-content': { caretColor: 'var(--color-text)', padding: 'var(--space-1) 0' },
    '.cm-content:focus-visible': { outline: 'none' },
    '.cm-line': { padding: '0 var(--space-2)' },
  });
}
