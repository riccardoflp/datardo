/**
 * The colors of mongosh text in an editor (`query.highlight`): each token of `syntaxTokens` is marked with its role
 * (`data-syntax="key"`), and the style gives each role the color of its token of the theme, so a change of theme
 * recolors the text without reading it again. The text is read again when it changes; only the parts in view are
 * marked.
 */
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';
import { syntaxTokens, type SyntaxRole, type SyntaxToken } from '../../../features/query/highlight';

const marks: Readonly<Record<SyntaxRole, Decoration>> = {
  key: Decoration.mark({ attributes: { 'data-syntax': 'key' } }),
  op: Decoration.mark({ attributes: { 'data-syntax': 'op' } }),
  string: Decoration.mark({ attributes: { 'data-syntax': 'string' } }),
  ref: Decoration.mark({ attributes: { 'data-syntax': 'ref' } }),
  number: Decoration.mark({ attributes: { 'data-syntax': 'number' } }),
  bool: Decoration.mark({ attributes: { 'data-syntax': 'bool' } }),
  oid: Decoration.mark({ attributes: { 'data-syntax': 'oid' } }),
  date: Decoration.mark({ attributes: { 'data-syntax': 'date' } }),
  regex: Decoration.mark({ attributes: { 'data-syntax': 'regex' } }),
  comment: Decoration.mark({ attributes: { 'data-syntax': 'comment' } }),
};

/** The marks of the tokens that cross the parts of the text in view; the tokens are in order and never overlap. */
function marked(view: EditorView, tokens: readonly SyntaxToken[]): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  let index = 0;
  for (const range of view.visibleRanges) {
    while (index < tokens.length && (tokens[index]?.to ?? 0) <= range.from) {
      index += 1;
    }
    for (let at = index; at < tokens.length; at += 1) {
      const token = tokens[at];
      if (token === undefined || token.from >= range.to) {
        break;
      }
      builder.add(Math.max(token.from, range.from), Math.min(token.to, range.to), marks[token.role]);
    }
  }
  return builder.finish();
}

class SyntaxColors {
  tokens: readonly SyntaxToken[];
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.tokens = syntaxTokens(view.state.doc.toString());
    this.decorations = marked(view, this.tokens);
  }

  update(update: ViewUpdate): void {
    if (update.docChanged) {
      this.tokens = syntaxTokens(update.state.doc.toString());
    }
    if (update.docChanged || update.viewportChanged) {
      this.decorations = marked(update.view, this.tokens);
    }
  }
}

/** Colors the mongosh text of an editor by the roles of `query.highlight`. */
export const syntaxColors = ViewPlugin.fromClass(SyntaxColors, { decorations: (plugin) => plugin.decorations });
