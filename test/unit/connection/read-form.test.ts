import { describe, expect, it } from 'vitest';
import { connectionFromForm, type FormResult } from '../../../src/features/connection/read-form';
import { noFileMissing } from '../../../src/features/connection/types';
import type { ConnectionDraft } from '../../../src/shared/connection';
import { formOf, mongoConnection, redisConnection } from './context';

function draftOf(result: FormResult): ConnectionDraft {
  if (result.kind === 'refused') {
    throw new Error(`refused: ${result.code}`);
  }
  return result.draft;
}

const saved = mongoConnection();
const sshOn = { ...formOf('mongodb').ssh, on: true, host: 'bastion', username: 'me' };

describe('connection.read-form', () => {
  it('names a new MongoDB connection after its hosts and takes the password out of the string', () => {
    const draft = draftOf(
      connectionFromForm(
        formOf('mongodb', { connectionString: ' mongodb://u:p@a:1,b:2/db ' }),
        undefined,
        noFileMissing,
      ),
    );
    expect(draft.name).toBe('a:1,b:2');
    expect(draft.address).toBe('mongodb://u@a:1,b:2/db');
    expect(draft.password).toEqual({ kind: 'replace', value: 'p' });
  });

  it('keeps the saved password while the user and the hosts are those saved', () => {
    const form = formOf('mongodb', { name: 'Local', connectionString: 'mongodb://ada@db1:27017/app' });
    expect(draftOf(connectionFromForm(form, saved, noFileMissing)).password).toEqual({ kind: 'keep' });
    const otherDatabase = { ...form, connectionString: 'mongodb://ada@db1:27017/other' };
    expect(draftOf(connectionFromForm(otherDatabase, saved, noFileMissing)).password).toEqual({ kind: 'keep' });
  });

  it('drops the saved password when a host changes, and replaces it when one is typed', () => {
    const moved = formOf('mongodb', { connectionString: 'mongodb://ada@db2:27017/app' });
    expect(draftOf(connectionFromForm(moved, saved, noFileMissing)).password).toEqual({ kind: 'drop' });
    const typed = formOf('mongodb', { connectionString: 'mongodb://ada@db1:27017/app', password: 'n3w' });
    expect(draftOf(connectionFromForm(typed, saved, noFileMissing)).password).toEqual({
      kind: 'replace',
      value: 'n3w',
    });
    const encoded = formOf('mongodb', { connectionString: 'mongodb://ada@db1:27017/app', password: 'p@ss' });
    expect(draftOf(connectionFromForm(encoded, saved, noFileMissing)).password).toEqual({
      kind: 'replace',
      value: 'p%40ss',
    });
  });

  it('keeps a secret option left empty, and drops one that is removed', () => {
    const withProxy = mongoConnection({
      address: 'mongodb://ada@db1:27017/app?proxyPassword=',
      secrets: { ...saved.secrets, secretOptions: ['proxyPassword'] },
    });
    const kept = formOf('mongodb', { connectionString: 'mongodb://ada@db1:27017/app?proxyPassword=' });
    expect(draftOf(connectionFromForm(kept, withProxy, noFileMissing)).secretOptions).toEqual({
      proxyPassword: { kind: 'keep' },
    });
    const removed = formOf('mongodb', { connectionString: 'mongodb://ada@db1:27017/app' });
    expect(draftOf(connectionFromForm(removed, withProxy, noFileMissing)).secretOptions).toEqual({});
    const typed = formOf('mongodb', { connectionString: 'mongodb://ada@db1:27017/app?proxyPassword=pp' });
    const draft = draftOf(connectionFromForm(typed, withProxy, noFileMissing));
    expect(draft.secretOptions).toEqual({ proxyPassword: { kind: 'replace', value: 'pp' } });
    expect(draft.address).toBe('mongodb://ada@db1:27017/app?proxyPassword=');
  });

  it('refuses what is not a MongoDB connection string', () => {
    expect(
      connectionFromForm(formOf('mongodb', { connectionString: 'localhost:27017' }), undefined, noFileMissing),
    ).toEqual({
      kind: 'refused',
      code: 'connection.read-form/connection-string',
      message: 'The connection string must start with mongodb:// or mongodb+srv://',
      field: 'connection-string',
    });
    expect(
      connectionFromForm(formOf('mongodb', { connectionString: 'mongodb:///db' }), undefined, noFileMissing),
    ).toMatchObject({
      code: 'connection.read-form/connection-string',
      message: 'The connection string has no host',
    });
  });

  it('refuses a password with no user', () => {
    const form = formOf('mongodb', { connectionString: 'mongodb://db1/app', password: 'x' });
    expect(connectionFromForm(form, undefined, noFileMissing)).toEqual({
      kind: 'refused',
      code: 'connection.read-form/no-user',
      message: 'Write the user in the connection string: mongodb://user@host',
      field: 'password',
    });
  });

  it('refuses a mongodb+srv:// string through an SSH tunnel', () => {
    const form = formOf('mongodb', { connectionString: 'mongodb+srv://c0.example.net/app', ssh: sshOn });
    expect(connectionFromForm(form, undefined, noFileMissing)).toMatchObject({
      code: 'connection.read-form/srv-through-ssh',
      message:
        'A mongodb+srv:// connection string can not go through an SSH tunnel: use the mongodb://host:port form of one of the servers.',
      field: 'connection-string',
    });
  });

  it('writes the Redis connection string from the fields, TLS from the checkbox', () => {
    const form = formOf('redis', {
      host: 'cache',
      port: '6379',
      password: 's3cret',
      database: '2',
      tls: { ...formOf('redis').tls, on: true },
    });
    const draft = draftOf(connectionFromForm(form, undefined, noFileMissing));
    expect(draft.address).toBe('rediss://cache/2');
    expect(draft.password).toEqual({ kind: 'replace', value: 's3cret' });
    expect(draft.name).toBe('cache:6379');
    expect(draft.tls).toEqual({});
  });

  it('reads a Redis connection string, its password included, with TLS from the checkbox', () => {
    const form = formOf('redis', { redisMode: 'connection-string', connectionString: 'rediss://:s3cret@cache:6380/2' });
    const draft = draftOf(connectionFromForm(form, undefined, noFileMissing));
    expect(draft.address).toBe('redis://cache:6380/2');
    expect(draft.password).toEqual({ kind: 'replace', value: 's3cret' });
  });

  it('keeps the saved Redis password while the user name, host and port stay, and drops it otherwise', () => {
    const cache = redisConnection({ secrets: { ...redisConnection().secrets, password: true } });
    const same = formOf('redis', { host: 'cache', port: '6379' });
    expect(draftOf(connectionFromForm(same, cache, noFileMissing)).password).toEqual({ kind: 'keep' });
    const otherPort = formOf('redis', { host: 'cache', port: '6380' });
    expect(draftOf(connectionFromForm(otherPort, cache, noFileMissing)).password).toEqual({ kind: 'drop' });
  });

  it('refuses the Redis fields that are not numbers or are missing', () => {
    expect(connectionFromForm(formOf('redis', { port: '0' }), undefined, noFileMissing)).toMatchObject({
      code: 'connection.read-form/port',
      message: 'The port must be a number from 1 to 65535',
      field: 'port',
    });
    expect(connectionFromForm(formOf('redis', { database: 'a' }), undefined, noFileMissing)).toMatchObject({
      code: 'connection.read-form/database',
      message: 'The database must be a number from 0: a',
      field: 'database',
    });
    expect(connectionFromForm(formOf('redis', { host: ' ' }), undefined, noFileMissing)).toMatchObject({
      code: 'connection.read-form/host',
      message: 'The host is missing',
      field: 'host',
    });
    const badString = formOf('redis', { redisMode: 'connection-string', connectionString: 'http://cache' });
    expect(connectionFromForm(badString, undefined, noFileMissing)).toMatchObject({
      code: 'connection.read-form/connection-string',
      field: 'connection-string',
    });
  });

  it('asks for the private key file of an SSH tunnel, with port 22 when it is empty', () => {
    const ssh = { ...sshOn, port: '', authentication: 'private-key' as const };
    expect(connectionFromForm(formOf('mongodb', { ssh }), undefined, noFileMissing)).toMatchObject({
      code: 'connection.read-form/ssh-key',
      message: 'Choose the private key file',
      field: 'ssh-private-key',
    });
    const draft = draftOf(
      connectionFromForm(
        formOf('mongodb', { ssh: { ...ssh, privateKeyFile: 'C:\\keys\\id' } }),
        undefined,
        noFileMissing,
      ),
    );
    expect(draft.ssh).toEqual({
      host: 'bastion',
      port: 22,
      username: 'me',
      authentication: 'private-key',
      privateKeyFile: 'C:\\keys\\id',
    });
  });

  it('refuses SSH fields that are missing, in the order of the form', () => {
    const missingHost = formOf('mongodb', { ssh: { ...sshOn, host: '' } });
    expect(connectionFromForm(missingHost, undefined, noFileMissing)).toMatchObject({
      code: 'connection.read-form/ssh-host',
    });
    const badPort = formOf('mongodb', { ssh: { ...sshOn, port: '99999' } });
    expect(connectionFromForm(badPort, undefined, noFileMissing)).toMatchObject({
      code: 'connection.read-form/ssh-port',
    });
    const noUser = formOf('mongodb', { ssh: { ...sshOn, username: '' } });
    expect(connectionFromForm(noUser, undefined, noFileMissing)).toMatchObject({
      code: 'connection.read-form/ssh-username',
    });
  });

  it('drops the SSH password for another server, saving it as empty', () => {
    const tunnel = mongoConnection({
      ssh: { host: 'bastion', port: 22, username: 'me', authentication: 'password' },
      secrets: { ...saved.secrets, sshPassword: true },
    });
    const same = formOf('mongodb', { connectionString: 'mongodb://ada@db1:27017/app', ssh: sshOn });
    expect(draftOf(connectionFromForm(same, tunnel, noFileMissing)).sshPassword).toEqual({ kind: 'keep' });
    const other = { ...same, ssh: { ...sshOn, host: 'bastion2' } };
    expect(draftOf(connectionFromForm(other, tunnel, noFileMissing)).sshPassword).toEqual({
      kind: 'replace',
      value: '',
    });
    const off = formOf('mongodb', { connectionString: 'mongodb://ada@db1:27017/app' });
    const draft = draftOf(connectionFromForm(off, tunnel, noFileMissing));
    expect(draft.sshPassword).toEqual({ kind: 'drop' });
    expect(draft.ssh).toBeUndefined();
  });

  it('gives no TLS settings and no refusal while TLS is off', () => {
    const form = formOf('mongodb', { tls: { ...formOf('mongodb').tls, caFile: 'C:\\missing.pem' } });
    const draft = draftOf(connectionFromForm(form, undefined, { missing: ['C:\\missing.pem'] }));
    expect(draft.tls).toBeUndefined();
    expect(draft.keyPassword).toEqual({ kind: 'drop' });
  });

  it('keeps TLS on without any file, and refuses a file that does not exist', () => {
    const on = { ...formOf('mongodb').tls, on: true };
    expect(draftOf(connectionFromForm(formOf('mongodb', { tls: on }), undefined, noFileMissing)).tls).toEqual({});
    const missing = formOf('mongodb', { tls: { ...on, caFile: 'C:\\missing.pem' } });
    expect(connectionFromForm(missing, undefined, { missing: ['C:\\missing.pem'] })).toEqual({
      kind: 'refused',
      code: 'connection.read-form/file-missing',
      message: 'The CA certificate file does not exist: C:\\missing.pem',
      field: 'ca-file',
    });
  });

  it('keeps the key password while a client certificate is set, and drops it without one', () => {
    const withKey = mongoConnection({ secrets: { ...saved.secrets, keyPassword: true } });
    const tls = { ...formOf('mongodb').tls, on: true, certificateKeyFile: 'client.pem' };
    const kept = formOf('mongodb', { connectionString: 'mongodb://ada@db1:27017/app', tls });
    expect(draftOf(connectionFromForm(kept, withKey, noFileMissing)).keyPassword).toEqual({ kind: 'keep' });
    const noCertificate = { ...kept, tls: { ...tls, certificateKeyFile: '', keyPassword: 'kp' } };
    expect(draftOf(connectionFromForm(noCertificate, withKey, noFileMissing)).keyPassword).toEqual({ kind: 'drop' });
  });

  it('asks for the Redis connection when redis-oplog is on, and keeps what is published', () => {
    const settings = { channelPrefix: 'app' };
    const none = formOf('mongodb', { oplog: { on: true, connection: '', settings } });
    expect(connectionFromForm(none, undefined, noFileMissing)).toMatchObject({
      code: 'connection.read-form/no-linked-connection',
      message: 'Choose the Redis connection',
      field: 'linked-connection',
    });
    const off = formOf('mongodb', { oplog: { on: false, connection: 'c-cache', settings } });
    const draft = draftOf(connectionFromForm(off, undefined, noFileMissing));
    expect(draft.publishesTo).toBeUndefined();
    expect(draft.oplog).toEqual(settings);
  });

  it('refuses a queries folder that does not exist, and trims every text', () => {
    const form = formOf('mongodb', { queriesFolder: ' D:\\queries ', folder: ' Work ', name: ' Local ', color: 'red' });
    expect(connectionFromForm(form, undefined, { missing: ['D:\\queries'] })).toMatchObject({
      code: 'connection.read-form/file-missing',
      message: 'The queries folder does not exist: D:\\queries',
      field: 'queries-folder',
    });
    const draft = draftOf(connectionFromForm(form, undefined, noFileMissing));
    expect(draft).toMatchObject({ name: 'Local', folder: 'Work', queriesFolder: 'D:\\queries', color: 'red' });
  });
});
