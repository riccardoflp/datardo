/**
 * What follows a plan, or a read the user started (`runner.run`, "After"): notify, read the open pages again, open a
 * page, copy, start another feature, write a line in the Log, keep a value until Datardo quits.
 */
import type { After, Context } from '../shared/feature';
import { writeLog } from './log';
import { notify, remember } from './notify';
import type { RunnerPorts } from './ports';

/** The action of the nav area that shows a page in the main island, until tabs exist (M4). */
const showPageAction = 'nav.show-page';

/** The action of the runner area that copies a text to the clipboard. */
export const copyAction = 'runner.copy';

/** Carries out what follows, in order; a failure of one is written in the Log and does not undo the plan (R4.5). */
export async function carryOutAfter(
  ports: RunnerPorts,
  context: Context,
  afters: readonly After[],
  startFeature: (after: Extract<After, { kind: 'start' }>) => Promise<unknown>,
): Promise<void> {
  for (const after of afters) {
    try {
      await carryOutOne(ports, context, after, startFeature);
    } catch (error: unknown) {
      const text = error instanceof Error ? error.message : String(error);
      writeLog(ports, [{ feature: context.feature, kind: 'error', text: `what follows failed: ${text}` }]);
    }
  }
}

async function carryOutOne(
  ports: RunnerPorts,
  context: Context,
  after: After,
  startFeature: (after: Extract<After, { kind: 'start' }>) => Promise<unknown>,
): Promise<void> {
  const signal = new AbortController().signal;
  switch (after.kind) {
    case 'notify':
      notify(ports, {
        feature: context.feature,
        level: after.level,
        text: after.text,
        ...(after.details === undefined ? {} : { details: after.details }),
        ...(after.actions === undefined ? {} : { actions: after.actions }),
        ...(after.element === undefined ? {} : { element: after.element }),
      });
      return;
    case 'refresh':
      ports.state.dispatch({
        slice: 'runner',
        type: 'refresh-asked',
        ...(after.connection === undefined ? {} : { connection: after.connection }),
      });
      return;
    case 'start':
      await startFeature(after);
      return;
    case 'copy':
      await ports.appActions.get(copyAction)?.({ text: after.text }, signal);
      return;
    case 'open':
      ports.state.dispatch({
        slice: 'runner',
        type: 'page-opened',
        page: after.page,
        ...(after.at === undefined ? {} : { at: after.at }),
      });
      await ports.appActions.get(showPageAction)?.({ page: after.page }, signal);
      return;
    case 'log':
      writeLog(ports, [{ feature: context.feature, kind: 'info', text: after.text }]);
      return;
    case 'remember':
      remember(ports, after.key, after.value);
      return;
  }
}
