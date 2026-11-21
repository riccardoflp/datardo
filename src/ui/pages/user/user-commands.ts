/**
 * The commands of the user area from Go to and their keys, carried out by the window where it knows more than the
 * main process: **Create user…** is followed as its button is (`user.create`), and the commands that act on a user or
 * a role act on what is selected in the active Users and roles tab, as its row's menu and its inspector do.
 */
import { view as inspectView } from '../../../features/user/inspect';
import { view as pageView } from '../../../features/user/show';
import { intentOf } from '../../../features/palette/run-command';
import type { UserControl } from '../../../features/user/types';
import { featureId } from '../../../shared/ids';
import type { AppState } from '../../../shared/state';
import { targetConnection, type Target } from '../../../shared/target';
import { act, createUser } from './user-actions';
import { activeUsersTab, inspectStateOf, pageStateOf } from './user-state';

/** The commands carried out here. */
const carried: ReadonlySet<string> = new Set([
  'user.create',
  'user.change-password',
  'user.grant-role',
  'user.revoke-role',
  'user.delete',
  'user.create-role',
  'user.edit-role',
  'user.delete-role',
]);

/** Whether a command is carried out here. */
export function isUserCommand(id: string): boolean {
  return carried.has(id);
}

/** The control of what is selected that starts a feature, from the inspector's buttons. */
function selectedControl(state: AppState, feature: string): UserControl | undefined {
  const active = activeUsersTab(state);
  const inspected = active === undefined ? undefined : inspectStateOf(state, active.tab);
  if (inspected === undefined) {
    return undefined;
  }
  const shown = inspectView(inspected);
  const controls: readonly UserControl[] = [
    ...shown.buttons,
    ...(shown.kind === 'user' && shown.grant?.control !== undefined ? [shown.grant.control] : []),
  ];
  return controls.find((control) => control.kind === 'start' && control.feature === feature);
}

/** Puts the focus on a control of the inspector, for a command that needs the user to choose there. */
function focusInspector(selector: string): void {
  const found = document.querySelector<HTMLElement>(`[data-feature="user.inspect@inspector"] ${selector}`);
  found?.focus();
}

/**
 * Starts **Create user…** or **Create role…** away from the page: on the connection, with the database of what the
 * user is looking at as the one the dialog starts with, so that the Log names it whole.
 */
function startOnConnection(id: string, target: Target): void {
  const connection = targetConnection(target);
  if (connection === undefined) {
    return;
  }
  const database = target.kind === 'database' || target.kind === 'collection' ? target.database : null;
  const on: Target = { kind: 'connection', connection };
  const args = { connection, database };
  if (id === 'user.create') {
    void createUser(on, args);
  } else {
    void window.datardo.start({ feature: featureId(id), target: on, args });
  }
}

/** Carries out a command of the area; one not offered now does nothing. */
export function runUserCommand(id: string, state: AppState): void {
  const intent = intentOf(state, id);
  if (intent === undefined) {
    return;
  }
  const active = activeUsersTab(state);
  if (id === 'user.create' || id === 'user.create-role') {
    // On the page, they start as its buttons do, with the database chosen in it.
    const shown = active === undefined ? undefined : pageView(pageStateOf(state, active.tab));
    const control = id === 'user.create' ? shown?.users.create : shown?.roles.create;
    if (control !== undefined) {
      act(control, 'toolbar');
    } else {
      startOnConnection(id, intent.target);
    }
    return;
  }
  const control = selectedControl(state, id);
  if (control !== undefined) {
    act(control, 'inspector');
    return;
  }
  if (id === 'user.grant-role') {
    focusInspector('input');
  } else if (id === 'user.revoke-role') {
    focusInspector('[data-feature="user.revoke-role@inspector"]');
  }
}
