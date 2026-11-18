/**
 * Feature: connection.edit — opens the connection form of a saved connection, to change anything about it.
 */
import type { ConnectionForm, ConnectionView } from '../../shared/connection';
import type { Answers, Context, Outcome } from '../../shared/feature';
import { ask, noDanger, run } from '../../shared/feature';
import { connectionId, featureId } from '../../shared/ids';
import { appTarget } from '../../shared/target';
import { emptySsh, emptyTls, formShows, newForm } from './add';
import { isRedisStringProblem, redisFromString } from './redis-string';
import { planText } from './text';
import { connectionById, connectionsOf, nothingToDo, targetConnection } from './types';

const nothingToUndo = 'Nothing to undo: closing the form saves nothing.';

/** The saved connections by folder, then by name: the list **Which connection?** offers. */
export function byFolder(saved: readonly ConnectionView[]): readonly ConnectionView[] {
  return [...saved].sort(
    (a, b) =>
      (a.folder ?? '').localeCompare(b.folder ?? '') || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
}

function whichConnection(saved: readonly ConnectionView[]): Outcome {
  return ask({
    title: planText.editTitle,
    button: planText.open,
    fields: [
      {
        kind: 'pick-one',
        key: 'connection',
        label: planText.whichConnection,
        choices: byFolder(saved).map((each) => ({
          value: each.id,
          label: each.name,
          ...(each.folder === undefined ? {} : { description: each.folder }),
        })),
      },
    ],
  });
}

function chosen(context: Context, answers: Answers): ConnectionView | undefined {
  const fromTarget = targetConnection(context);
  if (fromTarget !== undefined) {
    return fromTarget;
  }
  const current = context.state.nav.current;
  const picked = typeof answers['connection'] === 'string' ? connectionId(answers['connection']) : current;
  return picked === undefined ? undefined : connectionById(context, picked);
}

/** Feature: connection.edit — opens the form of the connection; from Go to with no current connection, asks which. */
export function plan(context: Context, answers: Answers): Outcome {
  const connection = chosen(context, answers);
  if (connection === undefined) {
    const saved = connectionsOf(context.state).saved;
    return saved.length === 0 || answers['connection'] !== undefined
      ? nothingToDo(planText.editTitle, nothingToUndo)
      : whichConnection(saved);
  }
  return run({
    title: planText.editTitle,
    steps: [],
    danger: noDanger,
    undo: { cannot: nothingToUndo },
    publishes: false,
    after: [
      {
        kind: 'start',
        feature: featureId('tab.open'),
        target: appTarget,
        args: { shows: formShows({ edits: connection.id }) },
      },
    ],
  });
}

function redisFieldsOf(saved: ConnectionView): Partial<ConnectionForm> {
  const read = redisFromString(saved.address ?? '');
  if (isRedisStringProblem(read)) {
    return { connectionString: saved.address ?? '', redisMode: 'connection-string' };
  }
  return {
    connectionString: saved.address ?? '',
    host: read.host,
    port: String(read.port),
    username: read.username,
    database: String(read.database),
  };
}

/** The form of a saved connection, with its saved values and every secret field empty. */
export function savedForm(saved: ConnectionView): ConnectionForm {
  const tls = saved.tls;
  const ssh = saved.ssh;
  return {
    ...newForm(saved.engine, saved.folder ?? ''),
    name: saved.name,
    ...(saved.engine === 'mongodb' ? { connectionString: saved.address ?? '' } : redisFieldsOf(saved)),
    color: saved.color ?? '',
    readOnly: saved.readOnly,
    queriesFolder: saved.queriesFolder ?? '',
    tls:
      tls === undefined
        ? emptyTls
        : {
            ...emptyTls,
            on: true,
            caFile: tls.caFile ?? '',
            certificateKeyFile: tls.certificateKeyFile ?? '',
            allowInvalidCertificates: tls.allowInvalidCertificates === true,
            allowInvalidHostnames: tls.allowInvalidHostnames === true,
          },
    ssh:
      ssh === undefined
        ? emptySsh
        : { ...emptySsh, on: true, ...ssh, port: String(ssh.port), privateKeyFile: ssh.privateKeyFile ?? '' },
    oplog: {
      on: saved.publishesTo !== undefined,
      connection: saved.publishesTo ?? '',
      ...(saved.oplog === undefined ? {} : { settings: saved.oplog }),
    },
  };
}
