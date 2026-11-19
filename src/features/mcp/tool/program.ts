/**
 * How a tool of the MCP server is written as a pure function that reads in rounds.
 *
 * A tool is written as straight code: it calls `session.send(requests)` and gets the replies, `session.app(action,
 * args)` and gets the main process's reply. It is run again from the start for each round, with the replies of the
 * rounds before: a round whose replies are in is answered at once, and the first round whose replies are not yet in
 * stops the run and becomes the step returned. The code reads no clock and draws nothing at random, so each run takes
 * the same path up to where the last one stopped. A sentence for the model is thrown as a {@link ToolProblem}.
 */
import type { ConnectionRequest, Json } from '../../../shared/engine-request';
import type { Context } from '../../../shared/feature';
import { withoutSecrets } from '../../runner/error';
import { truncated } from '../output-limits';
import type { ToolArguments, ToolCall, ToolStep } from '../types';
import { isFailed } from '../types';

/** A sentence the model gets with `isError: true`, thrown where the tool finds it. */
export class ToolProblem extends Error {}

/** The run stopped at a round whose replies are not in yet: the step to return. */
class Waiting extends Error {
  constructor(readonly step: ToolStep) {
    super('waiting');
  }
}

/** How many rounds a tool may ask for, so that a mistake cannot loop forever. */
export const mostRounds = 60;

/** What a tool is given: its context, its arguments, and the way to read. */
export interface ToolSession {
  readonly context: Context;
  readonly args: ToolArguments;
  /** The replies of the requests, in their order, once they are in; a failed request gives a `FailedReply`. */
  send(requests: readonly ConnectionRequest[]): readonly unknown[];
  /** The main process's reply to an app action (`mcpActions`). */
  app(action: string, args: Json): unknown;
}

/** A tool's code: the text of its answer, from what it read. */
export type ToolRun = (session: ToolSession) => string;

function sessionOf(context: Context, call: ToolCall): ToolSession {
  let round = 0;
  const next = (step: ToolStep): readonly unknown[] => {
    const replies = call.rounds[round];
    round += 1;
    if (round > mostRounds) {
      throw new ToolProblem(`The tool asked more than ${String(mostRounds)} times.`);
    }
    if (replies === undefined) {
      throw new Waiting(step);
    }
    return replies;
  };
  return {
    context,
    args: call.arguments,
    send: (requests) => (requests.length === 0 ? [] : next({ kind: 'send', requests })),
    app: (action, args) => next({ kind: 'app', action, args })[0],
  };
}

/** The step of a tool's run: what it needs next, or its answer cut at `MAX_OUTPUT`, or its sentence of failure. */
export function stepOf(run: ToolRun, context: Context, call: ToolCall): ToolStep {
  try {
    return { kind: 'answer', text: truncated(run(sessionOf(context, call))) };
  } catch (error: unknown) {
    // Both are how the tool ends a run on purpose: what it needs next, or the sentence it gives the model.
    if (error instanceof Waiting) {
      return error.step;
    }
    if (error instanceof ToolProblem) {
      return { kind: 'fail', message: truncated(withoutSecrets(error.message)) };
    }
    throw error;
  }
}

/** The reply, or the failure of its request as the tool's sentence: `<prefix><the server's message>`. */
export function replyOrProblem(reply: unknown, prefix = ''): unknown {
  if (isFailed(reply)) {
    throw new ToolProblem(`${prefix}${withoutSecrets(reply.message)}`);
  }
  return reply;
}
