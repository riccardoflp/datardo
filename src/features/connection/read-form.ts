/**
 * Feature: connection.read-form — turns the fields of the connection form into the settings of a connection, or into
 * a refusal that names a field. `connection.test` and `connection.save` both start from it, so they refuse the same
 * things with the same words.
 */
import type {
  ConnectionDraft,
  ConnectionForm,
  ConnectionView,
  FormField,
  SecretChange,
  SshSettings,
  TlsSettings,
} from '../../shared/connection';
import type { EngineName } from '../../shared/engine-request';
import { connectionId } from '../../shared/ids';
import {
  databaseNumber,
  defaultRedisPort,
  isRedisStringProblem,
  portNumber,
  redisFromString,
  redisToString,
  type RedisFields,
} from './redis-string';
import {
  decoded,
  encodePassword,
  optionName,
  optionValue,
  secretOptionNames,
  splitCredentials,
  uriParts,
  withoutSecrets,
} from './string-secrets';
import { formText, redisText } from './text';
import type { FileFacts } from './types';

/** A refusal of the form: its code, its text and the field it marks. */
export interface FormRefusal {
  readonly kind: 'refused';
  readonly code: string;
  readonly message: string;
  readonly field: FormField;
}

/** The settings the form says, or the first refusal in the order of the form. */
export type FormResult = { readonly kind: 'draft'; readonly draft: ConnectionDraft } | FormRefusal;

/** The address part of the form, read. */
interface Address {
  readonly address: string;
  readonly hosts: string;
  readonly password: SecretChange;
  readonly secretOptions: Readonly<Record<string, SecretChange>>;
}

const keep: SecretChange = { kind: 'keep' };
const drop: SecretChange = { kind: 'drop' };

function replace(value: string): SecretChange {
  return { kind: 'replace', value };
}

function refused(code: string, message: string, field: FormField): FormRefusal {
  return { kind: 'refused', code, message, field };
}

function isRefusal(value: unknown): value is FormRefusal {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'refused';
}

/** Who and where a connection string reaches: the user and the hosts (for Redis the user name, host and port). */
export function identityOf(engine: EngineName, address: string | undefined): string | undefined {
  if (address === undefined) {
    return undefined;
  }
  if (engine === 'redis') {
    const fields = redisFromString(address);
    return isRedisStringProblem(fields) ? undefined : `${fields.username}@${fields.host}:${String(fields.port)}`;
  }
  const uri = uriParts(address);
  return uri === undefined ? undefined : `${splitCredentials(uri.credentials).user ?? ''}@${uri.hosts}`;
}

/** The secret options a connection string names, with or without a value. */
function secretOptionsNamed(address: string): Set<string> {
  const named = new Set<string>();
  for (const option of uriParts(address)?.options ?? []) {
    const name = optionName(option).toLowerCase();
    const secret = secretOptionNames.find((each) => each.toLowerCase() === name);
    if (secret !== undefined) {
      named.add(secret);
    }
    if (name === 'authmechanismproperties' && /(^|,)AWS_SESSION_TOKEN:/i.test(decoded(optionValue(option)))) {
      named.add('AWS_SESSION_TOKEN');
    }
  }
  return named;
}

function passwordChange(inString: string | undefined, typed: string, kept: boolean): SecretChange {
  if (inString !== undefined && inString !== '') {
    return replace(inString);
  }
  if (typed !== '') {
    return replace(encodePassword(typed));
  }
  return kept ? keep : drop;
}

function mongoAddress(form: ConnectionForm, saved: ConnectionView | undefined): Address | FormRefusal {
  const written = form.connectionString.trim();
  if (!/^mongodb(\+srv)?:\/\//i.test(written)) {
    return refused('connection.read-form/connection-string', formText.mongoScheme, 'connection-string');
  }
  const uri = uriParts(written);
  if (uri === undefined || uri.hosts === '') {
    return refused('connection.read-form/connection-string', formText.noHost, 'connection-string');
  }
  const { connectionString: address, secrets } = withoutSecrets(written, 'shown');
  const user = splitCredentials(uri.credentials).user ?? '';
  const typed = form.password.trim();
  if (user === '' && (secrets.password !== undefined || typed !== '')) {
    return refused('connection.read-form/no-user', formText.noUser, 'password');
  }
  const same = saved !== undefined && identityOf('mongodb', saved.address) === identityOf('mongodb', address);
  const secretOptions: Record<string, SecretChange> = {};
  for (const name of secretOptionsNamed(address)) {
    const value = secrets.options[name];
    secretOptions[name] =
      value !== undefined ? replace(value) : same && saved.secrets.secretOptions.includes(name) ? keep : drop;
  }
  return {
    address,
    hosts: uri.hosts,
    password: passwordChange(secrets.password, typed, same && saved.secrets.password),
    secretOptions,
  };
}

function redisFieldsOf(form: ConnectionForm): RedisFields | FormRefusal {
  if (form.redisMode === 'connection-string') {
    const read = redisFromString(form.connectionString);
    if (!isRedisStringProblem(read)) {
      return read;
    }
    const field: FormField = 'connection-string';
    switch (read.reason) {
      case 'connection-string':
        return refused('connection.read-form/connection-string', read.message, field);
      case 'port':
        return refused('connection.read-form/port', read.message, field);
      case 'database':
        return refused('connection.read-form/database', read.message, field);
    }
  }
  const host = form.host.trim();
  if (host === '') {
    return refused('connection.read-form/host', formText.hostMissing, 'host');
  }
  const portText = form.port.trim();
  const port = portText === '' ? defaultRedisPort : portNumber(portText);
  if (port === undefined) {
    return refused('connection.read-form/port', formText.port, 'port');
  }
  const databaseText = form.database.trim();
  const database = databaseText === '' ? 0 : databaseNumber(databaseText);
  if (database === undefined) {
    return refused('connection.read-form/database', redisText.database(databaseText), 'database');
  }
  return { host, port, username: form.username.trim(), password: '', database, tls: false };
}

function redisAddress(form: ConnectionForm, saved: ConnectionView | undefined): Address | FormRefusal {
  const fields = redisFieldsOf(form);
  if (isRefusal(fields)) {
    return fields;
  }
  const address = redisToString({ ...fields, password: '', tls: form.tls.on });
  const same = saved !== undefined && identityOf('redis', saved.address) === identityOf('redis', address);
  const host = fields.host.includes(':') ? `[${fields.host}]` : fields.host;
  return {
    address,
    hosts: `${host}:${String(fields.port)}`,
    password: passwordChange(
      fields.password === '' ? undefined : encodePassword(fields.password),
      form.password.trim(),
      same && saved.secrets.password,
    ),
    secretOptions: {},
  };
}

function isMissing(files: FileFacts, path: string): boolean {
  return path !== '' && files.missing.includes(path);
}

function readTls(
  form: ConnectionForm,
  saved: ConnectionView | undefined,
  files: FileFacts,
): { tls?: TlsSettings; keyPassword: SecretChange } | FormRefusal {
  if (!form.tls.on) {
    return { keyPassword: drop };
  }
  const caFile = form.tls.caFile.trim();
  const certificateKeyFile = form.tls.certificateKeyFile.trim();
  if (isMissing(files, caFile)) {
    return refused('connection.read-form/file-missing', formText.caFileMissing(caFile), 'ca-file');
  }
  if (isMissing(files, certificateKeyFile)) {
    return refused(
      'connection.read-form/file-missing',
      formText.certificateMissing(certificateKeyFile),
      'certificate-key-file',
    );
  }
  const typed = form.tls.keyPassword.trim();
  const keyPassword =
    certificateKeyFile === ''
      ? drop
      : typed !== ''
        ? replace(typed)
        : saved?.secrets.keyPassword === true
          ? keep
          : drop;
  return {
    tls: {
      ...(caFile === '' ? {} : { caFile }),
      ...(certificateKeyFile === '' ? {} : { certificateKeyFile }),
      ...(form.tls.allowInvalidCertificates ? { allowInvalidCertificates: true } : {}),
      ...(form.tls.allowInvalidHostnames ? { allowInvalidHostnames: true } : {}),
    },
    keyPassword,
  };
}

/** The SSH section, read; its secrets follow in {@link sshSecrets}. */
function readSsh(form: ConnectionForm, files: FileFacts): SshSettings | undefined | FormRefusal {
  if (!form.ssh.on) {
    return undefined;
  }
  const host = form.ssh.host.trim();
  if (host === '') {
    return refused('connection.read-form/ssh-host', formText.sshHost, 'ssh-host');
  }
  const portText = form.ssh.port.trim();
  const port = portText === '' ? 22 : portNumber(portText);
  if (port === undefined) {
    return refused('connection.read-form/ssh-port', formText.sshPort, 'ssh-port');
  }
  const username = form.ssh.username.trim();
  if (username === '') {
    return refused('connection.read-form/ssh-username', formText.sshUsername, 'ssh-username');
  }
  const privateKeyFile = form.ssh.privateKeyFile.trim();
  if (form.ssh.authentication === 'private-key' && privateKeyFile === '') {
    return refused('connection.read-form/ssh-key', formText.sshKey, 'ssh-private-key');
  }
  if (form.ssh.authentication === 'private-key' && isMissing(files, privateKeyFile)) {
    return refused('connection.read-form/file-missing', formText.privateKeyMissing(privateKeyFile), 'ssh-private-key');
  }
  if (form.engine === 'mongodb' && /^mongodb\+srv:\/\//i.test(form.connectionString.trim())) {
    return refused('connection.read-form/srv-through-ssh', formText.srvThroughSsh, 'connection-string');
  }
  return {
    host,
    port,
    username,
    authentication: form.ssh.authentication,
    ...(form.ssh.authentication === 'private-key' ? { privateKeyFile } : {}),
  };
}

function sshSecrets(
  form: ConnectionForm,
  ssh: SshSettings | undefined,
  saved: ConnectionView | undefined,
): { sshPassword: SecretChange; passphrase: SecretChange } {
  const before = saved?.ssh;
  const same =
    ssh !== undefined &&
    before !== undefined &&
    before.host === ssh.host &&
    before.port === ssh.port &&
    before.username === ssh.username;
  const password = form.ssh.password.trim();
  const passphrase = form.ssh.passphrase.trim();
  const keptPassword = same && saved?.secrets.sshPassword === true ? keep : replace('');
  const keptPassphrase = same && saved?.secrets.passphrase === true ? keep : drop;
  return {
    sshPassword: ssh?.authentication !== 'password' ? drop : password !== '' ? replace(password) : keptPassword,
    passphrase: ssh?.authentication !== 'private-key' ? drop : passphrase !== '' ? replace(passphrase) : keptPassphrase,
  };
}

/** The settings of the sections after the address, or the first refusal among them. */
function readSections(
  form: ConnectionForm,
  saved: ConnectionView | undefined,
  files: FileFacts,
): Omit<ConnectionDraft, 'name' | 'engine' | keyof Address> | FormRefusal {
  const queriesFolder = form.engine === 'mongodb' ? form.queriesFolder.trim() : '';
  if (isMissing(files, queriesFolder)) {
    return refused('connection.read-form/file-missing', formText.queriesFolderMissing(queriesFolder), 'queries-folder');
  }
  const tls = readTls(form, saved, files);
  if (isRefusal(tls)) {
    return tls;
  }
  const ssh = readSsh(form, files);
  if (isRefusal(ssh)) {
    return ssh;
  }
  const linked = form.engine === 'mongodb' && form.oplog.on ? form.oplog.connection.trim() : '';
  if (form.engine === 'mongodb' && form.oplog.on && linked === '') {
    return refused('connection.read-form/no-linked-connection', formText.noLinkedConnection, 'linked-connection');
  }
  const folder = form.folder.trim();
  return {
    keyPassword: tls.keyPassword,
    ...sshSecrets(form, ssh, saved),
    ...(tls.tls === undefined ? {} : { tls: tls.tls }),
    ...(ssh === undefined ? {} : { ssh }),
    ...(folder === '' ? {} : { folder }),
    ...(form.color === '' ? {} : { color: form.color }),
    readOnly: form.readOnly,
    ...(queriesFolder === '' ? {} : { queriesFolder }),
    ...(linked === '' ? {} : { publishesTo: connectionId(linked) }),
    ...(form.engine === 'mongodb' && form.oplog.settings !== undefined ? { oplog: form.oplog.settings } : {}),
  };
}

/**
 * Feature: connection.read-form — the settings of a connection from the form, the saved connection (with which
 * secrets it has) and what is known of the files the form names; or the first refusal in the order of the form.
 */
export function connectionFromForm(
  form: ConnectionForm,
  saved: ConnectionView | undefined,
  files: FileFacts,
): FormResult {
  const address = form.engine === 'mongodb' ? mongoAddress(form, saved) : redisAddress(form, saved);
  if (isRefusal(address)) {
    return address;
  }
  const sections = readSections(form, saved, files);
  if (isRefusal(sections)) {
    return sections;
  }
  const name = form.name.trim();
  return {
    kind: 'draft',
    draft: { name: name === '' ? address.hosts : name, engine: form.engine, ...address, ...sections },
  };
}
