import { describe, expect, it } from 'vitest';
import * as exportConnections from '../../../src/features/connection/export';
import { connectionsFromText } from '../../../src/features/connection/read-file';
import { nodeFileCrypto } from '../../../src/main/file-crypto';
import * as importConnections from '../../../src/features/connection/import';
import { view as menu } from '../../../src/features/connection/menu';
import * as trustHostKey from '../../../src/features/connection/trust-host-key';
import type { FileConnection, FileConnections } from '../../../src/features/connection/types';
import type { Answers, Context, Outcome, Plan } from '../../../src/shared/feature';
import type { Question } from '../../../src/shared/question';
import { connectionId } from '../../../src/shared/ids';
import { contextOf, mongoConnection, redisConnection, stateWith } from './context';

const local = mongoConnection();
const cache = redisConnection();

function planOf(outcome: Outcome): Plan {
  if (outcome.kind !== 'run') {
    throw new Error(`Expected a plan, got ${outcome.kind}`);
  }
  return outcome.plan;
}

function questionOf(outcome: Outcome): Question {
  if (outcome.kind !== 'ask') {
    throw new Error(`Expected a question, got ${outcome.kind}`);
  }
  return outcome.question;
}

function textOf(plan: Plan): string {
  const [after] = plan.after;
  return after?.kind === 'notify' ? after.text : '';
}

function stepArgs(plan: Plan): readonly unknown[] {
  return plan.steps.map((each) => (each.kind === 'app' ? each.args : each));
}

describe('connection.trust-host-key', () => {
  const facts = { host: 'bastion', port: 22, fingerprint: 'SHA256:new' };
  const user = contextOf('connection.trust-host-key', stateWith([]));

  it('a key equal to the remembered one connects without asking', () => {
    expect(planOf(trustHostKey.plan(user, { args: { ...facts, remembered: 'SHA256:new' } })).steps).toEqual([]);
  });

  it('asks about a server met for the first time, then remembers its key by host:port', () => {
    const question = questionOf(trustHostKey.plan(user, { args: facts }));
    expect(question.title).toBe('Trust the SSH server bastion:22?');
    expect(question.element).toBe('connection.trust-host-key@dialog');
    const plan = planOf(trustHostKey.plan(user, { args: facts, [trustHostKey.trustedAnswer]: true }));
    expect(plan.danger.kind).toBe('none');
    expect(plan.steps[0]).toMatchObject({
      action: 'connection.remember-host-key',
      args: { server: 'bastion:22', fingerprint: 'SHA256:new' },
    });
  });

  it('warns with a confirmation when the key changed', () => {
    const plan = planOf(trustHostKey.plan(user, { args: { ...facts, remembered: 'SHA256:old' } }));
    expect(plan.danger).toMatchObject({ kind: 'confirm', button: 'Trust new key' });
  });

  it('a scheduled task or a tool of the MCP server does not ask: the key is not trusted', () => {
    for (const startedBy of ['task', 'mcp'] as const) {
      const context: Context = { ...user, startedBy };
      expect(trustHostKey.plan(context, { args: facts })).toEqual({
        kind: 'refuse',
        code: 'connection.trust-host-key/not-trusted',
        message: 'SSH: the host key of bastion:22 was not trusted',
      });
    }
  });
});

const fileOf = (connections: readonly FileConnection[], format: FileConnections['format'] = 'datardo') => ({
  format,
  connections,
  skipped: 0,
});

const shop: FileConnection = { name: 'Shop', engine: 'mongodb', connectionString: 'mongodb://db1/shop', notes: [] };
const fromFile: Answers = { source: 'file', 'source-read': { text: '[]', name: 'connections.json' } };

function imported(context: Context, file: ReturnType<typeof fileOf>, more: Answers, same: number[] = []): Outcome {
  return importConnections.plan(context, { ...fromFile, 'parsed-0': { file, same }, ...more });
}

describe('connection.import', () => {
  const context = contextOf('connection.import', stateWith([local, cache]));

  it('asks where, then reads the source in the main process', () => {
    expect(questionOf(importConnections.plan(context, {})).fields[0]).toMatchObject({ key: 'source' });
    expect(importConnections.plan(context, { source: 'clipboard' })).toMatchObject({
      kind: 'read',
      need: { key: 'source-read', read: 'connection.import:source', args: { source: 'clipboard' } },
    });
  });

  it('starts unchecked the connections with the same name and connection string', () => {
    const same: FileConnection = { ...shop, name: 'Local' };
    const field = questionOf(imported(context, fileOf([shop, same]), {}, [1])).fields[0];
    expect(field).toMatchObject({ kind: 'pick-many', default: ['0'] });
    expect(field?.kind === 'pick-many' ? field.choices[1]?.description : '').toContain(
      '✓ already exists (same connection string)',
    );
  });

  it('Skip leaves out the taken names; Keep both adds them with a number', () => {
    const taken: FileConnection = { ...shop, name: 'Local' };
    const file = fileOf([taken]);
    expect(questionOf(imported(context, file, { chosen: ['0'] })).fields[0]).toMatchObject({ key: 'taken' });
    const skip = planOf(imported(context, file, { chosen: ['0'], taken: 'skip', folder: 'no-folder' }));
    expect(skip.steps).toEqual([]);
    const keep = planOf(imported(context, file, { chosen: ['0'], taken: 'keep', folder: 'no-folder' }));
    expect(stepArgs(keep)[0]).toMatchObject({ saved: { name: 'Local (2)' } });
  });

  it('Replace keeps the id, and the read-only of the saved one; never one of the other engine', () => {
    const readOnly = mongoConnection({ readOnly: true });
    const replacing = contextOf('connection.import', stateWith([readOnly, cache]));
    const file = fileOf([
      { ...shop, name: 'Local' },
      { ...shop, name: 'Cache local' },
    ]);
    const plan = planOf(imported(replacing, file, { chosen: ['0', '1'], taken: 'replace', folder: 'no-folder' }));
    const [replaced, added] = stepArgs(plan);
    expect(stepArgs(plan)).toHaveLength(2);
    expect(replaced).toMatchObject({ saved: { id: 'c-local', readOnly: true } });
    expect(added).toMatchObject({ saved: { name: 'Cache local (2)', engine: 'mongodb' } });
  });

  it('started on a folder, puts every connection in it without asking', () => {
    const plan = planOf(imported(context, fileOf([shop]), { chosen: ['0'], args: { folder: 'Work' } }));
    expect(stepArgs(plan)[0]).toMatchObject({ saved: { folder: 'Work' } });
  });

  it('asks a passphrase for encrypted passwords, again when it is wrong', () => {
    const encrypted = {
      ...fromFile,
      'source-read': { text: '{"connections":[{"connectionSecrets":"x"}]}', name: 'c.json' },
    };
    expect(questionOf(importConnections.plan(context, encrypted)).fields[0]).toMatchObject({ key: 'passphrase-1' });
    const wrong = { ...encrypted, 'passphrase-1': 'nope', 'parsed-1': { wrongPassphrase: true } };
    expect(questionOf(importConnections.plan(context, wrong)).text).toContain('Wrong passphrase');
  });

  it('links a Mongoster connection to a Redis connection added for its address', () => {
    const mongo: FileConnection = { ...shop, oplog: { url: 'redis://:pw@cache2:6380', settings: {} } };
    const plan = planOf(imported(context, fileOf([mongo], 'mongoster'), { chosen: ['0'], folder: 'no-folder' }));
    const steps = plan.steps.map((each) => (each.kind === 'app' ? each.action : each.kind));
    expect(steps).toEqual(['connection.import-one', 'connection.import-one', 'connection.link']);
    expect(stepArgs(plan)[1]).toMatchObject({ saved: { name: 'cache2:6380', engine: 'redis' } });
  });

  it('links to the saved Redis connection of the same address', () => {
    const mongo: FileConnection = { ...shop, oplog: { url: 'redis://cache:6379', settings: {} } };
    const plan = planOf(imported(context, fileOf([mongo], 'mongoster'), { chosen: ['0'], folder: 'no-folder' }));
    expect(stepArgs(plan)[1]).toMatchObject({ to: 'c-cache' });
  });

  it('imports a Mongoster export of ten connections, two of them linked to Redis (M7)', async () => {
    const entries = Array.from({ length: 10 }, (_, index) => ({
      name: `Shop ${String(index + 1)}`,
      uri: `mongodb://ada:pw${String(index)}@db${String(index)}:27017/shop`,
      folder: 'Clients',
      ...(index === 2 ? { redisOplog: { url: 'redis://:s3cret@cache2:6380', channelPrefix: '' } } : {}),
      ...(index === 7 ? { redisOplog: { url: 'redis://cache:6379' } } : {}),
    }));
    const text = JSON.stringify({
      type: 'Mongoster Connections',
      version: 1,
      secrets: 'included',
      connections: entries,
    });
    const file = await connectionsFromText(text, undefined, nodeFileCrypto);
    if ('problem' in file) {
      throw new Error(file.problem);
    }
    const all = file.connections.map((_, index) => String(index));
    const plan = planOf(imported(context, file, { chosen: all, folder: 'from-file' }));
    const saved = plan.steps.flatMap((each) =>
      each.kind === 'app' && each.action === 'connection.import-one'
        ? [(each.args as unknown as { saved: { name: string; engine: string; folder?: string } }).saved]
        : [],
    );
    expect(saved.filter((each) => each.engine === 'mongodb')).toHaveLength(10);
    expect(saved.filter((each) => each.engine === 'redis')).toEqual([
      expect.objectContaining({ name: 'cache2:6380', folder: 'Clients' }),
    ]);
    const links = plan.steps.flatMap((each) =>
      each.kind === 'app' && each.action === 'connection.link' ? [each.args] : [],
    );
    expect(links).toHaveLength(2);
    expect(links[1]).toMatchObject({ to: 'c-cache' });
    const redis = plan.steps.find(
      (each) => each.kind === 'app' && each.action === 'connection.import-one' && each.text.includes('cache2'),
    );
    expect(redis?.kind === 'app' ? redis.args : null).toMatchObject({
      connectionString: 'redis://:s3cret@cache2:6380',
    });
  });

  it('refuses a source with no connection', () => {
    expect(imported(context, fileOf([]), {})).toMatchObject({
      kind: 'refuse',
      code: 'connection.import/nothing-found',
    });
  });
});

describe('connection.export', () => {
  const linked = mongoConnection({ publishesTo: cache.id });
  const lost = mongoConnection({
    id: connectionId('c-lost'),
    name: 'Lost',
    secrets: { ...local.secrets, connectionString: false },
  });
  const context = contextOf('connection.export', stateWith([linked, cache, lost]));
  const chosen: Answers = { chosen: ['c-local'], format: 'datardo' };

  it('offers Without passwords first, and no encryption for a list', () => {
    const field = questionOf(exportConnections.plan(context, chosen)).fields[0];
    expect(field?.kind === 'pick-one' ? field.choices.map((each) => each.value) : []).toEqual([
      'remove',
      'encrypt',
      'include',
    ]);
    const list = questionOf(exportConnections.plan(context, { ...chosen, format: 'list' })).fields[0];
    expect(list?.kind === 'pick-one' ? list.choices.map((each) => each.value) : []).toEqual(['remove', 'include']);
  });

  it('started on a folder, checks only its connections', () => {
    const work = redisConnection({ folder: 'Work' });
    const field = questionOf(
      exportConnections.plan(contextOf('connection.export', stateWith([local, work])), { args: { folder: 'Work' } }),
    ).fields[0];
    expect(field).toMatchObject({ default: ['c-cache'] });
  });

  it('writes the file in the main process: the step carries ids and choices, no secret', () => {
    const plan = planOf(exportConnections.plan(context, { ...chosen, secrets: 'remove', path: { path: 'D:/c.json' } }));
    expect(plan.steps).toEqual([
      expect.objectContaining({
        kind: 'file',
        action: 'write',
        path: 'D:/c.json',
        content: {
          writer: 'connection.write-file',
          args: { ids: ['c-local', 'c-cache'], format: 'datardo', secrets: 'remove', passphrase: '' },
        },
      }),
    ]);
    expect(textOf(plan)).toContain('1 linked Redis connection was added');
  });

  it('leaves out the connections whose connection string is lost', () => {
    const plan = planOf(
      exportConnections.plan(context, {
        chosen: ['c-lost', 'c-cache'],
        format: 'list',
        secrets: 'remove',
        path: { path: 'c.txt' },
      }),
    );
    expect(textOf(plan)).toContain('1 connection exported to c.txt');
  });

  it('confirms passwords in clear text, and writes nothing when the dialog is dismissed', () => {
    const clear = planOf(exportConnections.plan(context, { ...chosen, secrets: 'include', path: { path: 'c.json' } }));
    expect(clear.danger).toMatchObject({ kind: 'confirm', button: 'Export with passwords' });
    expect(planOf(exportConnections.plan(context, { ...chosen, secrets: 'remove', path: null })).steps).toEqual([]);
  });

  it('asks the passphrase twice, at least 8 characters, the same again', () => {
    const first = questionOf(exportConnections.plan(context, { ...chosen, secrets: 'encrypt' })).fields[0];
    expect(first).toMatchObject({ key: 'passphrase', secret: true });
    const second = questionOf(
      exportConnections.plan(context, { ...chosen, secrets: 'encrypt', passphrase: 'long enough' }),
    ).fields[0];
    expect(second).toMatchObject({ key: 'passphrase2', rules: [{ kind: 'equals', value: 'long enough' }] });
  });

  it('refuses when no connection is saved', () => {
    expect(exportConnections.plan(contextOf('connection.export', stateWith([])), {})).toMatchObject({
      kind: 'refuse',
      code: 'connection.export/no-connections',
    });
  });
});

describe('connection.menu', () => {
  it('a MongoDB connection linked to Cache local offers Link and Unlink Cache local; a Redis one neither', () => {
    const linked = mongoConnection({ publishesTo: cache.id });
    const labels = (connection: typeof local) =>
      menu({ connections: stateWith([linked, cache]).connections, connection, place: 'home' }).entries.flatMap(
        (each) => (each.kind === 'item' ? [each.label] : []),
      );
    expect(labels(linked)).toEqual(expect.arrayContaining(['Link a Redis connection…', 'Unlink Cache local']));
    expect(labels(cache).filter((each) => each.includes('ink'))).toEqual([]);
  });
});
