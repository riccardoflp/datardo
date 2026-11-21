/**
 * What the controls of the Server page do: a control that starts a feature starts it from its place, with what its
 * View gave; **Disconnect…**, **Clear…**, **Find largest keys** and **Examine 100,000 more** go through the page,
 * which follows what they do; a control that copies puts its text on the clipboard.
 */
import type { ServerControl } from '../../../features/server/types';
import type { Json } from '../../../shared/engine-request';
import type { Place } from '../../../shared/ids';
import { startFeature } from '../../shell/intent';
import { examineMoreKeys, findLargestKeys } from './server-largest';
import { clearSlowLog, disconnectClient } from './server-reads';

/** The place of an element written whole (`server.kill-client@row-menu`), or `fallback` for a control with none. */
export function placeOf(element: string | undefined, fallback: Place): Place {
  const place = element?.split('@')[1];
  return (place ?? fallback) as Place;
}

function fieldOf(value: Json | undefined, name: string): Json | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, Json>>)[name]
    : undefined;
}

function clientOf(args: Json | undefined): string {
  const id = fieldOf(fieldOf(args, 'client'), 'id');
  return typeof id === 'string' ? id : '';
}

function isMore(args: Json | undefined): boolean {
  return fieldOf(args, 'more') === true;
}

/** Carries out a control of the page, from its place. */
export function act(tab: string, control: ServerControl, fallback: Place): void {
  if (control.kind === 'copy') {
    void navigator.clipboard.writeText(control.text);
    return;
  }
  if (!control.enabled) {
    return;
  }
  const place = placeOf(control.element, fallback);
  switch (control.feature) {
    case 'server.kill-client':
      void disconnectClient(tab, clientOf(control.args), control.args ?? null, place);
      return;
    case 'server.slow-log-reset':
      void clearSlowLog(tab);
      return;
    case 'server.largest-keys':
      if (isMore(control.args)) {
        examineMoreKeys(tab);
      } else {
        findLargestKeys(tab);
      }
      return;
    default:
      startFeature(control.feature, {
        place,
        target: control.target,
        ...(control.args === undefined ? {} : { args: control.args }),
      });
  }
}
