/**
 * Feature: playground.rewrite
 *
 * A script is written like mongosh, without `await`: `db.users.findOne({ … }).name` works. Before it runs, the script
 * is rewritten so that every call is awaited where it is, and the value of its last expression is returned. The
 * rewriting is in `src/shared/playground/rewrite.ts`, shared with the process of a run, which defines the two names.
 */
import { rewrittenScript, type RewrittenScript } from '../../shared/playground/rewrite';

export type { RewrittenScript } from '../../shared/playground/rewrite';
export { resolveName, resultName } from '../../shared/playground/rewrite';

/**
 * Feature: playground.rewrite — the source of an async function that runs the script, `(async () => { let
 * __datardoResult; <code>\n; return __datardoResult; })()`, or the syntax error with its line and column.
 */
export function rewritten(source: string): RewrittenScript {
  return rewrittenScript(source);
}
