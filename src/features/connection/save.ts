/**
 * Feature: connection.save — saves a new connection, or the changes to one, with its secrets, its TLS settings, its
 * SSH tunnel and its redis-oplog link.
 */
import type { ConnectionDraft, ConnectionView, SecretChange } from '../../shared/connection';
import type { EngineName } from '../../shared/engine-request';
import type { After, AppStep, Answers, Context, Danger, Outcome, Step } from '../../shared/feature';
import { noDanger, refuse, run } from '../../shared/feature';
import { connectionId, featureId, type ConnectionId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { connectionState } from '../../shared/state/connections';
import type { Tab } from '../../shared/state/tabs';
import { appTarget } from '../../shared/target';
import { formPage } from './add';
import { allowChangesDanger } from './allow-changes';
import { disconnectStep, hasClient } from './disconnect';
import { connectionFromForm } from './read-form';
import { planText } from './text';
import { appStep, argumentsOf, connectionById, connectionsOf, formFromJson, noFileMissing } from './types';

/** A new id that no saved connection has, from the time: `c-<time in base 36>`, then `-2`, `-3`… */
export function newConnectionId(now: number, taken: readonly string[]): ConnectionId {
  const base = `c-${Math.max(0, Math.floor(now)).toString(36)}`;
  let id = base;
  for (let suffix = 2; taken.includes(id); suffix += 1) {
    id = `${base}-${String(suffix)}`;
  }
  return connectionId(id);
}

function withTab(tab: Tab | undefined): { readonly tab?: Tab } {
  return tab === undefined ? {} : { tab };
}

function changes(secret: SecretChange, saved: boolean): boolean {
  return secret.kind === 'replace' || (secret.kind === 'drop' && saved);
}

/** Whether saving the draft changes what reaches the server: then a connected connection is disconnected first. */
export function changesTheReach(saved: ConnectionView, draft: ConnectionDraft): boolean {
  const secrets = saved.secrets;
  const optionChanged = Object.entries(draft.secretOptions).some(([name, change]) =>
    changes(change, secrets.secretOptions.includes(name)),
  );
  return (
    saved.address !== draft.address ||
    changes(draft.password, secrets.password) ||
    optionChanged ||
    changes(draft.keyPassword, secrets.keyPassword) ||
    changes(draft.sshPassword, secrets.sshPassword) ||
    changes(draft.passphrase, secrets.passphrase) ||
    JSON.stringify(saved.tls ?? null) !== JSON.stringify(draft.tls ?? null) ||
    JSON.stringify(saved.ssh ?? null) !== JSON.stringify(draft.ssh ?? null)
  );
}

/** The open tab of the form that was saved: of the connection it edits, or of a new connection of its engine. */
export function formTab(state: AppState, editing: ConnectionId | undefined, engine: EngineName): Tab | undefined {
  return state.tabs.tabs.find(
    (tab) =>
      tab.shows.kind === 'app' &&
      tab.shows.page === formPage &&
      (editing === undefined
        ? tab.shows.edits === undefined && tab.shows.engine === engine
        : tab.shows.edits === editing),
  );
}

function afterSaving(
  saving: { readonly id: ConnectionId; readonly name: string; readonly tab?: Tab },
  thenConnect: boolean,
): readonly After[] {
  const closing: readonly After[] =
    saving.tab === undefined
      ? []
      : [{ kind: 'start', feature: featureId('tab.close'), target: appTarget, args: { tab: saving.tab.id } }];
  const saved: After = { kind: 'notify', level: 'success', text: planText.saved(saving.name) };
  if (!thenConnect) {
    return [...closing, saved];
  }
  const target = { kind: 'connection', connection: saving.id } as const;
  return [
    ...closing,
    saved,
    { kind: 'start', feature: featureId('nav.switch-connection'), target, args: { connection: saving.id } },
    { kind: 'start', feature: featureId('connection.connect'), target },
  ];
}

/** The step that makes the first connection saved the current one (`nav.empty`). */
function madeCurrent(id: ConnectionId, name: string): AppStep {
  return appStep('nav.make-current', { connection: id }, planText.makeCurrent(name));
}

/**
 * Feature: connection.save — `args` is `{ form, connection, connect }`: the fields of the form, the saved connection
 * it edits (null for a new one), and whether it is **Save and connect**. The plan is `save the connection <name>`,
 * after `disconnect <name>` when a connected connection changes what reaches the server. Turning **Read-only** off
 * asks the confirmation of `connection.allow-changes`.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const args = argumentsOf(answers);
  const form = formFromJson(args['form']);
  if (form === undefined) {
    throw new Error('connection.save needs the fields of the form.');
  }
  const editing = typeof args['connection'] === 'string' ? connectionId(args['connection']) : undefined;
  const saved = editing === undefined ? undefined : connectionById(context, editing);
  if (editing !== undefined && saved === undefined) {
    throw new Error(`The connection ${editing} is no longer saved.`);
  }
  const read = connectionFromForm(form, saved, noFileMissing);
  if (read.kind === 'refused') {
    return refuse(read.code, read.message);
  }
  const draft = read.draft;
  const connections = connectionsOf(context.state);
  const id =
    saved?.id ??
    newConnectionId(
      context.now,
      connections.saved.map((each) => each.id),
    );
  const disconnecting =
    saved !== undefined && hasClient(connectionState(connections, saved.id)) && changesTheReach(saved, draft);
  const steps: Step[] = [
    ...(disconnecting ? [disconnectStep(saved)] : []),
    appStep(
      'connection.write',
      { connection: id, isNew: saved === undefined, form: args['form'] as never },
      planText.saveConnection(draft.name),
    ),
  ];
  if (connections.saved.length === 0) {
    steps.push(madeCurrent(id, draft.name));
  }
  const allowing = saved?.readOnly === true && !draft.readOnly;
  const danger: Danger = allowing ? allowChangesDanger(saved) : noDanger;
  return run({
    title: allowing ? planText.allowChangesQuestion(saved.name) : planText.saveConnection(draft.name),
    steps,
    danger,
    undo: { cannot: planText.cannotUndoSave },
    publishes: false,
    after: afterSaving(
      { id, name: draft.name, ...withTab(formTab(context.state, editing, form.engine)) },
      args['connect'] === true,
    ),
  });
}
