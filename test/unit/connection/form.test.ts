import { describe, expect, it } from 'vitest';
import {
  initialForm,
  openedOf,
  parse,
  refusedField,
  request,
  view,
  withPasswordMoved,
  type FormState,
} from '../../../src/features/connection/form';
import { withRedisMode } from '../../../src/features/connection/redis-string';
import type { ConnectionForm } from '../../../src/shared/connection';
import { contextOf, formOf, mongoConnection, redisConnection, stateWith } from './context';

const local = mongoConnection({
  folder: 'Work',
  tls: { caFile: 'C:/certs/ca.pem' },
  ssh: { host: 'bastion', port: 22, username: 'ops', authentication: 'password' },
  secrets: {
    connectionString: true,
    password: true,
    secretOptions: [],
    keyPassword: true,
    sshPassword: true,
    passphrase: false,
  },
});
const cache = redisConnection({ folder: 'Work' });
const connections = stateWith([local, cache]).connections;

function stateOf(form: ConnectionForm, more: Partial<FormState> = {}): FormState {
  return { opened: { engine: form.engine }, connections, form, ...more };
}

describe('connection.form', () => {
  it('opens a new MongoDB form on mongodb://localhost:27017, with the focus on the connection string', () => {
    const form = initialForm({ engine: 'mongodb' }, connections);
    expect(form).toEqual(formOf('mongodb'));
    const shown = view(stateOf(form));
    expect(shown.heading).toBe('New connection');
    expect(shown.engine).toBe('MongoDB');
    expect(shown.focus).toBe('connection-string');
    expect(form.ssh.port).toBe('22');
    expect(form.ssh.authentication).toBe('password');
    expect(form.oplog.connection).toBe('');
    expect(shown.fields['connection-string']?.placeholder).toBe('mongodb://user@host:27017/?authSource=admin');
  });

  it('opens a new Redis form on Fields, localhost, 6379, database 0 and TLS off, with the focus on Host', () => {
    const form = initialForm({ engine: 'redis' }, connections);
    expect(form).toMatchObject({ redisMode: 'fields', host: 'localhost', port: '6379', username: '', database: '0' });
    expect(form.tls.on).toBe(false);
    const shown = view(stateOf(form));
    expect(shown.focus).toBe('host');
    expect(shown.fields['connection-string']).toBeUndefined();
    expect(shown.redisModes?.choices.map((choice) => choice.label)).toEqual(['Fields', 'Connection string']);
    expect(shown.sections.oplog).toBeUndefined();
  });

  it('opens a new form in the folder it was started on', () => {
    expect(initialForm({ engine: 'mongodb', folder: 'Work' }, connections).folder).toBe('Work');
  });

  it('opens a saved connection with its values, no secret and the focus on Name', () => {
    const form = initialForm({ engine: 'mongodb', edits: local.id }, connections);
    expect(form).toMatchObject({ name: 'Local', connectionString: 'mongodb://ada@db1:27017/app', password: '' });
    expect(form.folder).toBe('Work');
    expect(form.tls).toMatchObject({ on: true, caFile: 'C:/certs/ca.pem', keyPassword: '' });
    expect(form.ssh).toMatchObject({ on: true, host: 'bastion', port: '22', username: 'ops', password: '' });
    const shown = view({ opened: { engine: 'mongodb', edits: local.id }, connections, form });
    expect(shown.heading).toBe('Connection Local');
    expect(shown.focus).toBe('name');
    expect(shown.fields.password?.placeholder).toBe('Saved — leave empty to keep it');
    expect(shown.fields['key-password']?.placeholder).toBe('Saved — leave empty to keep it');
    expect(shown.fields['ssh-password']?.placeholder).toBe('Saved — leave empty to keep it');
  });

  it('asks the password again when the user or a host of a saved connection changes', () => {
    const opened = { engine: 'mongodb' as const, edits: local.id };
    const form = { ...initialForm(opened, connections), connectionString: 'mongodb://bob@db1:27017/app' };
    const password = view({ opened, connections, form }).fields.password;
    expect(password?.placeholder).toBeUndefined();
    expect(password?.hint).toBe('The user or the host changed: enter the password again.');
    const sameUser = { ...form, connectionString: 'mongodb://ada@db1:27017/other' };
    expect(view({ opened, connections, form: sameUser }).fields.password?.placeholder).toBe(
      'Saved — leave empty to keep it',
    );
  });

  it('disables the fields of a section while its checkbox is off, and shows those of the authentication', () => {
    const form = formOf('mongodb');
    const off = view(stateOf(form)).fields;
    expect(off['ca-file']?.disabled).toBe(true);
    expect(off['ssh-host']?.disabled).toBe(true);
    expect(off['linked-connection']?.disabled).toBe(true);
    const on = view(stateOf({ ...form, tls: { ...form.tls, on: true }, ssh: { ...form.ssh, on: true } })).fields;
    expect(on['ca-file']?.disabled).toBe(false);
    expect(on['ssh-password']).toBeDefined();
    expect(on['ssh-private-key']).toBeUndefined();
    const key = view(stateOf({ ...form, ssh: { ...form.ssh, authentication: 'private-key' } }));
    expect(key.fields['ssh-private-key']?.browse?.title).toBe('Choose the SSH private key');
    expect(key.fields.passphrase?.placeholder).toBe('If the key is encrypted');
    expect(key.fields['ssh-password']).toBeUndefined();
    const agent = view(stateOf({ ...form, ssh: { ...form.ssh, authentication: 'agent' } }));
    expect(agent.agentHint).toBe(
      'Uses the keys loaded in the running agent (SSH_AUTH_SOCK, or the Windows OpenSSH agent).',
    );
  });

  it('turns a Redis connection string into the fields and back', () => {
    const typed = { ...formOf('redis'), redisMode: 'connection-string' as const };
    const fields = withRedisMode({ ...typed, connectionString: 'rediss://cache.example.com:6380/2' }, 'fields');
    expect(fields).toMatchObject({ host: 'cache.example.com', port: '6380', database: '2' });
    expect(fields.tls.on).toBe(true);
    const back = withRedisMode({ ...fields, tls: { ...fields.tls, on: false } }, 'connection-string');
    expect(back.connectionString).toBe('redis://cache.example.com:6380/2');
  });

  it('moves a password typed in the connection string to Password', () => {
    const redis = {
      ...formOf('redis'),
      redisMode: 'connection-string' as const,
      connectionString: 'redis://:s3cret@cache',
    };
    expect(withPasswordMoved(redis)).toMatchObject({ connectionString: 'redis://cache', password: 's3cret' });
    const mongo = formOf('mongodb', { connectionString: 'mongodb://ada:p%40ss@db1:27017/app' });
    expect(withPasswordMoved(mongo)).toMatchObject({
      connectionString: 'mongodb://ada@db1:27017/app',
      password: 'p@ss',
    });
    const none = formOf('mongodb');
    expect(withPasswordMoved(none)).toBe(none);
  });

  it('marks and focuses the field a refusal names', () => {
    const form = formOf('mongodb', { connectionString: 'localhost:27017' });
    const message = 'The connection string must start with mongodb:// or mongodb+srv://';
    const field = refusedField(form, undefined, message);
    expect(field).toBe('connection-string');
    const shown = view(stateOf(form, { result: { ok: false, text: message, field: 'connection-string' } }));
    expect(shown.focus).toBe('connection-string');
    expect(shown.fields['connection-string']?.marked).toBe(true);
    expect(shown.message).toEqual({ ok: false, text: message });
    const missing = 'Stopped at step 1 of 2. The CA certificate file does not exist: C:/certs/ca.pem';
    expect(refusedField(formOf('mongodb'), undefined, missing)).toBe('ca-file');
  });

  it('disables the four buttons while a test or a save runs', () => {
    const testing = view(stateOf(formOf('mongodb'), { busy: 'testing' })).buttons;
    expect(testing.test).toMatchObject({ label: 'Testing…', disabled: true });
    expect([testing.cancel, testing.save, testing.saveAndConnect].every((button) => button.disabled)).toBe(true);
    expect(view(stateOf(formOf('mongodb'), { busy: 'saving' })).buttons.save.label).toBe('Saving…');
    expect(view(stateOf(formOf('mongodb'))).buttons.save.disabled).toBe(false);
  });

  it('says when no keychain is available', () => {
    const none = { ...connections, keychain: false };
    expect(view({ ...stateOf(formOf('mongodb')), connections: none }).noKeychain).toBe(
      'Passwords are not saved on this computer: no keychain is available.',
    );
    expect(view(stateOf(formOf('mongodb'))).noKeychain).toBeUndefined();
  });

  it('offers the folders in use and the saved Redis connections', () => {
    const shown = view(stateOf(formOf('mongodb')));
    expect(shown.folders).toEqual(['Work']);
    expect(shown.redisConnections).toEqual([{ value: cache.id, label: 'Work / Cache local' }]);
    expect(shown.colors.map((color) => color.label)).toEqual([
      'None',
      'Red',
      'Orange',
      'Yellow',
      'Green',
      'Blue',
      'Purple',
    ]);
  });

  it('gives the Read-only checkbox of a read-only connection the element of allow-changes when unchecked', () => {
    const readOnly = mongoConnection({ readOnly: true });
    const state = stateWith([readOnly]).connections;
    const opened = { engine: 'mongodb' as const, edits: readOnly.id };
    const form = initialForm(opened, state);
    expect(view({ opened, connections: state, form }).fields['read-only']?.element).toBe('connection.read-only@form');
    expect(view({ opened, connections: state, form: { ...form, readOnly: false } }).fields['read-only']?.element).toBe(
      'connection.allow-changes@form',
    );
  });

  it('knows the form a tab shows', () => {
    expect(openedOf({ kind: 'app', page: 'connection-form', engine: 'redis', folder: 'Work' }, connections)).toEqual({
      engine: 'redis',
      folder: 'Work',
    });
    expect(openedOf({ kind: 'app', page: 'connection-form', edits: local.id }, connections)).toEqual({
      engine: 'mongodb',
      edits: local.id,
    });
    expect(openedOf({ kind: 'app', page: 'settings' }, connections)).toBeUndefined();
  });

  it('asks the main process for a file with Browse…, and gives the path chosen', () => {
    const context = contextOf('connection.form', stateWith([]));
    expect(request(context, { title: 'Choose the CA certificate', kind: 'certificate' })).toEqual({
      kind: 'app',
      action: 'connection.choose-file',
      args: { title: 'Choose the CA certificate', kind: 'certificate' },
    });
    expect(parse(['C:/certs/ca.pem'])).toBe('C:/certs/ca.pem');
    expect(parse([null])).toBeNull();
  });
});
