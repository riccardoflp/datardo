/**
 * Feature: connection.add — starts a new connection: asks which engine it is for, and opens the connection form for
 * that engine.
 */
import type { ConnectionForm } from '../../shared/connection';
import type { EngineName, Json } from '../../shared/engine-request';
import type { After, Answers, Context, Outcome } from '../../shared/feature';
import { ask, noDanger, run } from '../../shared/feature';
import { appTarget } from '../../shared/target';
import { featureId, type ConnectionId } from '../../shared/ids';
import { planText } from './text';
import { argumentsOf } from './types';

/** The page of the app that is the connection form. */
export const formPage = 'connection-form';

function engineOf(value: unknown): EngineName | undefined {
  return value === 'mongodb' || value === 'redis' ? value : undefined;
}

/** The question **Which engine?**, MongoDB first. */
function whichEngine(): Outcome {
  return ask({
    title: planText.addTitle,
    text: planText.whichEngine,
    button: planText.open,
    fields: [
      {
        kind: 'pick-one',
        key: 'engine',
        label: planText.whichEngine,
        choices: [
          { value: 'mongodb', label: planText.mongoChoice, description: planText.mongoDescription },
          { value: 'redis', label: planText.redisChoice, description: planText.redisDescription },
        ],
      },
    ],
  });
}

/** What the tab of the connection form shows: the form of a saved connection, or of a new one of an engine. */
export function formShows(
  opened: { readonly engine: EngineName; readonly folder?: string } | { readonly edits: ConnectionId },
): Json {
  return 'edits' in opened
    ? { kind: 'app', page: formPage, edits: opened.edits }
    : {
        kind: 'app',
        page: formPage,
        engine: opened.engine,
        ...(opened.folder === undefined ? {} : { folder: opened.folder }),
      };
}

/**
 * What follows: the connection form for a new connection of the engine, in the folder it was started on, in its tab
 * (`tab.open`), which shows the open one when there is one.
 */
export function openForm(engine: EngineName, folder: string | undefined): After {
  return {
    kind: 'start',
    feature: featureId('tab.open'),
    target: appTarget,
    args: { shows: formShows(folder === undefined ? { engine } : { engine, folder }) },
  };
}

/** The engine the entry point says: the variant of the command (`connection.add:redis`), or `args.engine`. */
function engineAsked(answers: Answers): EngineName | undefined {
  const args = answers['args'];
  return engineOf(args) ?? engineOf(argumentsOf(answers)['engine']) ?? engineOf(answers['engine']);
}

/**
 * Feature: connection.add — `args` is `{ engine, folder }`, either left out, or the variant of a command (`mongodb`,
 * `redis`): the engine is asked when the entry point does not say it (`connection.add:mongodb`,
 * `connection.add:redis`, the Home page filtered by one engine). No step: nothing is saved until `connection.save`.
 */
export function plan(_context: Context, answers: Answers): Outcome {
  const args = argumentsOf(answers);
  const engine = engineAsked(answers);
  if (engine === undefined) {
    return whichEngine();
  }
  const folder = typeof args['folder'] === 'string' && args['folder'] !== '' ? args['folder'] : undefined;
  return run({
    title: planText.addTitle,
    steps: [],
    danger: noDanger,
    undo: { cannot: 'Nothing to undo: closing the form saves nothing.' },
    publishes: false,
    after: [openForm(engine, folder)],
  });
}

/** The TLS section of a new connection: off and empty. */
export const emptyTls: ConnectionForm['tls'] = {
  on: false,
  caFile: '',
  certificateKeyFile: '',
  keyPassword: '',
  allowInvalidCertificates: false,
  allowInvalidHostnames: false,
};

/** The SSH section of a new connection: off, port 22, password authentication. */
export const emptySsh: ConnectionForm['ssh'] = {
  on: false,
  host: '',
  port: '22',
  username: '',
  authentication: 'password',
  password: '',
  privateKeyFile: '',
  passphrase: '',
};

/** The form of a new connection of an engine: `mongodb://localhost:27017`, or `localhost` and `6379` for Redis. */
export function newForm(engine: EngineName, folder = ''): ConnectionForm {
  return {
    engine,
    name: '',
    connectionString: engine === 'mongodb' ? 'mongodb://localhost:27017' : '',
    password: '',
    redisMode: 'fields',
    host: 'localhost',
    port: '6379',
    username: '',
    database: '0',
    folder,
    color: '',
    readOnly: false,
    queriesFolder: '',
    tls: emptyTls,
    ssh: emptySsh,
    oplog: { on: false, connection: '' },
  };
}
