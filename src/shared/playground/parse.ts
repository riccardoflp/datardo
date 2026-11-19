/**
 * How the script of a playground is parsed, once, for its statements and for its rewriting (`playground.statements`,
 * `playground.rewrite`): a script of the latest ECMAScript, with `await` and `return` allowed at the top level and a
 * `#!` line allowed at the start. Parsing runs nothing (R9.1).
 */
import { parse, type AnyNode, type Program } from 'acorn';

/** A syntax error of a script, with the parser's message and its line and column, both from 1. */
export interface ScriptSyntaxError {
  readonly kind: 'syntax-error';
  /** The parser's message without its position: `Unexpected token`. */
  readonly message: string;
  readonly line: number;
  readonly column: number;
}

/** A script parsed, or why it could not be. */
export type ParsedScript = { readonly kind: 'parsed'; readonly program: Program } | ScriptSyntaxError;

/** Parses the text of a script. */
export function parsedScript(source: string): ParsedScript {
  try {
    const program = parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'script',
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
      allowHashBang: true,
    });
    return { kind: 'parsed', program };
  } catch (error) {
    // Acorn throws a SyntaxError with `loc` for every text it cannot read; anything else is a fault of Datardo.
    if (!(error instanceof SyntaxError)) {
      throw error;
    }
    const loc = (error as SyntaxError & { readonly loc?: { readonly line: number; readonly column: number } }).loc;
    return {
      kind: 'syntax-error',
      message: error.message.replace(/\s*\(\d+:\d+\)$/u, ''),
      line: loc?.line ?? 1,
      column: (loc?.column ?? 0) + 1,
    };
  }
}

/** A node of the given type, narrowed. */
export function isNode<T extends AnyNode['type']>(
  node: AnyNode | null | undefined,
  type: T,
): node is Extract<AnyNode, { type: T }> {
  return node?.type === type;
}

/** The nodes directly under a node, in the order of its fields: what a walk goes down to when no rule says more. */
export function childNodes(node: AnyNode): readonly AnyNode[] {
  const children: AnyNode[] = [];
  for (const value of Object.values(node as unknown as Readonly<Record<string, unknown>>)) {
    for (const item of Array.isArray(value) ? (value as readonly unknown[]) : [value]) {
      if (isAnyNode(item)) {
        children.push(item);
      }
    }
  }
  return children;
}

function isAnyNode(value: unknown): value is AnyNode {
  return typeof value === 'object' && value !== null && typeof (value as { readonly type?: unknown }).type === 'string';
}
