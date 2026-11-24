/**
 * What a connection read from a file does beyond its name and its host (`connection.import`): which safeguards it
 * turns off and where else it connects. The import shows these before anything is saved, since the file may come
 * from someone else (T5). No password is ever part of them.
 */
import { isRedisStringProblem, redisFromString } from '../redis-string';
import { decoded, optionName, optionValue, uriParts } from '../string-secrets';
import { transferText } from '../text';
import type { FileConnection } from '../types';

/** The value of an option of a connection string, decoded; undefined when the string does not have it. */
function optionOf(connectionString: string, name: string): string | undefined {
  const option = uriParts(connectionString)?.options.find((each) => optionName(each).toLowerCase() === name);
  return option === undefined ? undefined : decoded(optionValue(option));
}

function isTrue(value: string | undefined): boolean {
  return value?.toLowerCase() === 'true';
}

/** The proxy a MongoDB connection string goes through, as `<host>[:<port>]`. */
function proxyOf(connection: FileConnection): string | undefined {
  if (connection.engine !== 'mongodb') {
    return undefined;
  }
  const host = optionOf(connection.connectionString, 'proxyhost');
  const port = optionOf(connection.connectionString, 'proxyport');
  return host === undefined || host === ''
    ? undefined
    : `${host}${port === undefined || port === '' ? '' : `:${port}`}`;
}

/** The Redis server the writes of a MongoDB connection would be published to, as `<host>:<port>`; undefined when unread. */
function oplogHost(connection: FileConnection, all: readonly FileConnection[]): string | undefined {
  const oplog = connection.oplog;
  if (oplog === undefined) {
    return undefined;
  }
  const linked = oplog.connection === undefined ? undefined : all.find((each) => each.id === oplog.connection);
  const address = linked?.connectionString ?? oplog.url;
  const fields = address === undefined ? undefined : redisFromString(address);
  return fields === undefined || isRedisStringProblem(fields) || fields.host === ''
    ? undefined
    : `${fields.host}:${String(fields.port)}`;
}

/**
 * What the connection does beyond its host, in this order and each only when it applies: **TLS**; **invalid
 * certificates allowed** and **invalid host names allowed**, from the TLS settings or from the options left in the
 * connection string; **proxy <host>[:<port>]**; **SSH <user>@<host>[:<port>]**, the port only when it is not 22;
 * **redis-oplog → <host>:<port>**; **no undo history**; **queries folder <path>**.
 */
export function securityNotes(connection: FileConnection, all: readonly FileConnection[]): readonly string[] {
  const option = (name: string): boolean => isTrue(optionOf(connection.connectionString, name));
  const insecure = connection.engine === 'mongodb' && option('tlsinsecure');
  const certificates =
    connection.tls?.allowInvalidCertificates === true || insecure || option('tlsallowinvalidcertificates');
  const hostNames = connection.tls?.allowInvalidHostnames === true || insecure || option('tlsallowinvalidhostnames');
  const proxy = proxyOf(connection);
  const ssh = connection.ssh;
  const oplog = oplogHost(connection, all);
  return [
    ...(connection.tls === undefined ? [] : [transferText.tls]),
    ...(certificates ? [transferText.invalidAllowed('certificates')] : []),
    ...(hostNames ? [transferText.invalidAllowed('host names')] : []),
    ...(proxy === undefined ? [] : [transferText.proxy(proxy)]),
    ...(ssh === undefined
      ? []
      : [
          transferText.ssh(
            ssh.username,
            `${ssh.host}${ssh.port === undefined || ssh.port === 22 ? '' : `:${String(ssh.port)}`}`,
          ),
        ]),
    ...(connection.oplog === undefined ? [] : [transferText.redisOplog(oplog)]),
    ...(connection.noHistory === true ? [transferText.noUndoHistory] : []),
    ...(connection.queriesFolder === undefined ? [] : [transferText.queriesFolder(connection.queriesFolder)]),
  ];
}
