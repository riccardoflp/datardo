/**
 * The actions of the scheduled tasks area (`src/main/task-actions.ts`), each carried out by the host of the tasks,
 * which is there once the area has started, before the window opens.
 */
import type { AreaActions } from '.';
import type { AppAction } from '../../runner/ports';
import { taskActions } from '../task-actions';
import { taskHost } from '../tasks';

const names = [
  'task.save',
  'task.delete',
  'task.set-enabled',
  'task.start-run',
  'task.record-run',
  'task.forget-outputs',
  'task.record-missed',
  'task.cancel-run',
  'task.default-folder',
] as const;

function action(name: (typeof names)[number]): AppAction {
  return (args, signal, progress) => {
    const host = taskHost();
    if (host === undefined) {
      return Promise.reject(new Error('The scheduled tasks are not loaded yet.'));
    }
    const carried = taskActions(host)[name];
    if (carried === undefined) {
      return Promise.reject(new Error(`Datardo has no action named ${name}.`));
    }
    return carried(args, signal, progress);
  };
}

/** The actions of the area, by name. */
export const actions: AreaActions = () => Object.fromEntries(names.map((name) => [name, action(name)]));
