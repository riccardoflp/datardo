/**
 * The rewriting of a playground's script so that it reads like mongosh, without `await` (`playground.rewrite`):
 * every call is awaited where it is (`x.findOne().n` runs as `(await x.findOne()).n`), so are expression statements,
 * initializers and returned values, and the value of a last expression statement is returned. Awaiting goes through
 * {@link resolveName}, which leaves the runtime's cursors alone. Text is only inserted, never on a new line, so that an
 * error thrown while running reports the script's own line. Ported from Mongoster's `src/playground/rewrite.ts`.
 */
import type {
  AnyNode,
  ArrowFunctionExpression,
  CallExpression,
  Expression,
  Function as FunctionNode,
  FunctionExpression,
  Program,
  SpreadElement,
} from 'acorn';
import { childNodes, isNode, parsedScript, type ScriptSyntaxError } from './parse';

/** The variable that holds the value of the script's last expression. */
export const resultName = '__datardoResult';

/** The function every awaited value goes through: it gives back a cursor of the runtime as it is. */
export const resolveName = '__datardoResolve';

/** A script rewritten: the source of an async function expression that runs it, or the syntax error. */
export type RewrittenScript = { readonly kind: 'rewritten'; readonly code: string } | ScriptSyntaxError;

/** Text inserted at `at`: the opening or the closing half of a wrap. */
interface Insert {
  readonly at: number;
  readonly text: string;
  /** The rank of the wrap: an outer node's is lower, because it is visited first. */
  readonly order: number;
  readonly close: boolean;
}

/** Where a node sits in an optional chain (`a?.b.c()`): nowhere, the whole chain, or a link under it. */
type Chain = 'none' | 'top' | 'link';

/** Expressions whose value is never a promise; the calls inside them are awaited on their own. */
const neverPromises: ReadonlySet<string> = new Set([
  'Literal',
  'TemplateLiteral',
  'ObjectExpression',
  'ArrayExpression',
  'UnaryExpression',
  'BinaryExpression',
  'UpdateExpression',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'ClassExpression',
]);

/** Rewrites a script: `(async () => { let V; <code>\n; return V; })()`. */
export function rewrittenScript(source: string): RewrittenScript {
  const parsed = parsedScript(source);
  if (parsed.kind === 'syntax-error') {
    return parsed;
  }
  // A `#!` line is valid only at the very start of a file: the function's text starts before it.
  const code = withInserts(source, new Awaiter().script(parsed.program)).replace(/^#!.*/u, '');
  return { kind: 'rewritten', code: `(async () => { let ${resultName}; ${code}\n; return ${resultName}; })()` };
}

/** The source with the inserts at each offset: the closing texts first, inner first, then the opening, outer first. */
function withInserts(source: string, inserts: readonly Insert[]): string {
  const byOffset = new Map<number, Insert[]>();
  for (const insert of inserts) {
    const list = byOffset.get(insert.at) ?? [];
    list.push(insert);
    byOffset.set(insert.at, list);
  }
  let code = '';
  let last = 0;
  for (const at of [...byOffset.keys()].sort((first, second) => first - second)) {
    const list = [...(byOffset.get(at) ?? [])].sort(insertOrder);
    code += source.slice(last, at) + list.map((insert) => insert.text).join('');
    last = at;
  }
  return code + source.slice(last);
}

function insertOrder(first: Insert, second: Insert): number {
  if (first.close !== second.close) {
    return first.close ? -1 : 1;
  }
  return first.close ? second.order - first.order : first.order - second.order;
}

function isCall(node: AnyNode): boolean {
  return node.type === 'CallExpression' || node.type === 'TaggedTemplateExpression';
}

function isFunction(node: AnyNode): node is FunctionExpression | ArrowFunctionExpression {
  return node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression';
}

/** Whether a link of the chain up to `node` (`a?.b().c()`) is optional: the chain may stop before `node`. */
function hasOptional(node: AnyNode): boolean {
  let link: AnyNode = node;
  while (link.type === 'CallExpression' || link.type === 'MemberExpression') {
    if (link.optional) {
      return true;
    }
    link = link.type === 'CallExpression' ? link.callee : link.object;
  }
  return false;
}

/**
 * Finds where `await` goes. Code runs async in the script, in its blocks and in functions already async; the callback
 * of `….withTransaction(fn)` written in place becomes async. Other functions are left as they are.
 */
class Awaiter {
  private readonly inserts: Insert[] = [];
  private order = 0;

  script(program: Program): readonly Insert[] {
    program.body.forEach((statement, index) => {
      if (index === program.body.length - 1 && isNode(statement, 'ExpressionStatement') && !statement.directive) {
        this.wrap(statement.expression, 'bare', `${resultName} = `);
        this.expression(statement.expression, true);
      } else {
        this.statement(statement);
      }
    });
    return this.inserts;
  }

  /** `(await R((node)))`, or `await R((node))` at the start of a statement, where `(` would continue the line before. */
  private wrap(node: AnyNode, form: 'bare' | 'bracketed', prefix = ''): void {
    const order = this.order;
    this.order += 1;
    const bare = form === 'bare';
    this.inserts.push({
      at: node.start,
      text: `${prefix}${bare ? '' : '('}await ${resolveName}((`,
      order,
      close: false,
    });
    this.inserts.push({ at: node.end, text: bare ? '))' : ')))', order, close: true });
  }

  /** A value awaited as a whole (an initializer, a returned value), unless it cannot be a promise or is a call. */
  private value(node: AnyNode | null | undefined): void {
    if (node === null || node === undefined) {
      return;
    }
    const whole = !isCall(node) && !neverPromises.has(node.type);
    if (whole) {
      this.wrap(node, 'bracketed');
    }
    this.expression(node, whole);
  }

  private statement(node: AnyNode | null | undefined): void {
    if (node === null || node === undefined) {
      return;
    }
    if (isNode(node, 'ExpressionStatement')) {
      if (node.directive === undefined) {
        this.wrap(node.expression, 'bare');
        this.expression(node.expression, true);
      }
      return;
    }
    if (isNode(node, 'VariableDeclaration')) {
      for (const declarator of node.declarations) {
        this.expression(declarator.id);
        this.value(declarator.init);
      }
      return;
    }
    if (isNode(node, 'ReturnStatement')) {
      this.value(node.argument);
      return;
    }
    if (isNode(node, 'FunctionDeclaration')) {
      this.asyncFunction(node);
      return;
    }
    this.compound(node);
  }

  /** The statements that hold others: their tests and heads are expressions, their bodies statements. */
  private compound(node: AnyNode): void {
    if (isNode(node, 'BlockStatement')) {
      node.body.forEach((each) => {
        this.statement(each);
      });
    } else if (isNode(node, 'IfStatement')) {
      this.expressions(node.test);
      this.statements(node.consequent, node.alternate);
    } else if (isNode(node, 'ForStatement')) {
      this.head(node.init);
      this.expressions(node.test, node.update);
      this.statement(node.body);
    } else if (isNode(node, 'ForInStatement') || isNode(node, 'ForOfStatement')) {
      this.head(node.left);
      this.expressions(node.right);
      this.statement(node.body);
    } else if (isNode(node, 'WhileStatement') || isNode(node, 'DoWhileStatement')) {
      this.expressions(node.test);
      this.statement(node.body);
    } else if (isNode(node, 'LabeledStatement')) {
      this.statement(node.body);
    } else if (isNode(node, 'WithStatement')) {
      this.expressions(node.object);
      this.statement(node.body);
    } else {
      this.other(node);
    }
  }

  private other(node: AnyNode): void {
    if (isNode(node, 'TryStatement')) {
      this.statement(node.block);
      this.expressions(node.handler?.param);
      this.statements(node.handler?.body, node.finalizer);
    } else if (isNode(node, 'SwitchStatement')) {
      this.expressions(node.discriminant);
      for (const each of node.cases) {
        this.expressions(each.test);
        this.statements(...each.consequent);
      }
    } else if (isNode(node, 'ThrowStatement')) {
      this.expressions(node.argument);
    } else if (isNode(node, 'ClassDeclaration')) {
      this.expressions(node.superClass);
    }
  }

  private statements(...nodes: readonly (AnyNode | null | undefined)[]): void {
    nodes.forEach((node) => {
      this.statement(node);
    });
  }

  private expressions(...nodes: readonly (AnyNode | null | undefined)[]): void {
    nodes.forEach((node) => {
      this.expression(node);
    });
  }

  /** The head of a `for`: a declaration, or an expression. */
  private head(node: AnyNode | null | undefined): void {
    if (isNode(node, 'VariableDeclaration')) {
      this.statement(node);
    } else {
      this.expression(node);
    }
  }

  /** The body of a function that is async runs like the script; its parameters are never touched. */
  private asyncFunction(node: FunctionNode): void {
    if (!node.async) {
      return;
    }
    if (isNode(node.body, 'BlockStatement')) {
      node.body.body.forEach((each) => {
        this.statement(each);
      });
    } else {
      this.value(node.body);
    }
  }

  /**
   * Awaits the calls of an expression where they are. `wrapped`: the node itself is already awaited as a whole.
   * `chain`: its place in an optional chain, where a call after a `?.` followed by more links is not awaited alone.
   */
  private expression(node: AnyNode | null | undefined, wrapped = false, chain: Chain = 'none'): void {
    if (node === null || node === undefined) {
      return;
    }
    if (isFunction(node)) {
      this.asyncFunction(node);
    } else if (isNode(node, 'ClassExpression')) {
      this.expression(node.superClass);
    } else if (isNode(node, 'ChainExpression')) {
      this.expression(node.expression, wrapped, 'top');
    } else if (isNode(node, 'CallExpression')) {
      this.call(node, wrapped, chain);
    } else if (isNode(node, 'MemberExpression')) {
      this.expression(node.object, false, chain === 'none' ? 'none' : 'link');
      this.expression(node.computed ? node.property : undefined);
    } else if (isNode(node, 'TaggedTemplateExpression')) {
      if (!wrapped) {
        this.wrap(node, 'bracketed');
      }
      this.expressions(node.tag, node.quasi);
    } else if (isNode(node, 'Property')) {
      this.expressions(node.computed ? node.key : undefined, node.value);
    } else {
      this.expressions(...childNodes(node));
    }
  }

  private call(node: CallExpression, wrapped: boolean, chain: Chain): void {
    if (!wrapped && !(chain === 'link' && hasOptional(node))) {
      this.wrap(node, 'bracketed');
    }
    const link: Chain = chain === 'none' ? 'none' : 'link';
    const callee = node.callee;
    if (isNode(callee, 'MemberExpression')) {
      this.expression(callee.object, false, link);
      this.expression(callee.computed ? callee.property : undefined);
    } else {
      this.expression(callee, false, link);
    }
    node.arguments.forEach((argument, index) => {
      if (index !== 0 || !this.transactionCallback(node, argument)) {
        this.expression(argument);
      }
    });
  }

  /** `….withTransaction(fn)` with `fn` written in place: made async, and awaited inside like the script. */
  private transactionCallback(call: CallExpression, argument: Expression | SpreadElement): boolean {
    const callee = call.callee;
    const named =
      isNode(callee, 'MemberExpression') &&
      !callee.computed &&
      isNode(callee.property, 'Identifier') &&
      callee.property.name === 'withTransaction';
    if (!named || !isFunction(argument) || argument.generator) {
      return false;
    }
    if (!argument.async) {
      this.inserts.push({ at: argument.start, text: 'async ', order: this.order, close: false });
      this.order += 1;
    }
    this.asyncFunction({ ...argument, async: true });
    return true;
  }
}
