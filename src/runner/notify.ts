/**
 * Notifications (`runner.notify`) and refusals (`runner.refuse`) as the runner sends them: each is a line of the Log
 * and a notification, and the same message within 30 seconds counts on the one shown instead of adding another.
 */
import type { Json } from '../shared/engine-request';
import type { NotificationAction } from '../shared/feature';
import type { FeatureId, RefusalCode } from '../shared/ids';
import type { NotificationLevel } from '../shared/state/runner';
import { writeLog } from './log';
import type { RunnerPorts } from './ports';

/** The same message within 30 seconds is counted, not repeated (Datardo's choice). */
export const repeatWindowMs = 30_000;

/** What a notification says. */
export interface Notice {
  readonly feature: FeatureId | string;
  readonly level: NotificationLevel;
  readonly text: string;
  readonly details?: string;
  readonly actions?: readonly NotificationAction[];
  readonly connection?: string;
}

/** What sending a notification needs: the state and the time. */
export type NotifyPorts = Pick<RunnerPorts, 'state' | 'now'>;

/** Writes the notice in the Log and shows it, or counts it on the same one shown within 30 seconds. */
export function notify(ports: NotifyPorts, notice: Notice): void {
  writeLog(ports, [
    {
      feature: notice.feature,
      kind: 'notification',
      text: notice.text,
      ...(notice.connection === undefined ? {} : { connection: notice.connection }),
    },
  ]);
  showNotification(ports, notice);
}

/** Who started what was refused: a refusal to a tool of the MCP server is its error, not a notification. */
export type RefusalAudience = 'user' | 'mcp' | 'task';

/**
 * A refusal (`runner.refuse`): `[<feature>] refused: <code>` and the message in the Log, and a notification of the
 * kind *warning* whose **Details** is the code, for a person.
 */
export function reportRefusal(
  ports: NotifyPorts,
  refusal: { readonly feature: FeatureId; readonly code: RefusalCode; readonly message: string },
  audience: RefusalAudience,
): void {
  writeLog(ports, [{ feature: refusal.feature, kind: 'refusal', text: `refused: ${refusal.code} ${refusal.message}` }]);
  if (audience !== 'mcp') {
    showNotification(ports, {
      feature: refusal.feature,
      level: 'warning',
      text: refusal.message,
      details: refusal.code,
    });
  }
}

/** Shows a notification already written in the Log: a refusal's line is its own. */
function showNotification(ports: NotifyPorts, notice: Notice): void {
  const state = ports.state.get().runner;
  const now = ports.now();
  const same = state.notifications.find(
    (item) => item.level === notice.level && item.text === notice.text && now - item.time <= repeatWindowMs,
  );
  ports.state.dispatch({
    slice: 'runner',
    type: 'notified',
    notification: {
      id: same?.id ?? `notification-${String(state.logged)}`,
      level: notice.level,
      text: notice.text,
      feature: notice.feature as FeatureId,
      count: (same?.count ?? 0) + 1,
      time: now,
      logLine: state.logged,
      ...(notice.details === undefined ? {} : { details: notice.details }),
      ...(notice.actions === undefined ? {} : { actions: notice.actions.slice(0, 2) }),
    },
  });
}

/** Keeps a value until Datardo quits, under a key (an `After` of kind `remember`). */
export function remember(ports: NotifyPorts, key: string, value: Json): void {
  ports.state.dispatch({ slice: 'runner', type: 'remembered', key, value });
}
