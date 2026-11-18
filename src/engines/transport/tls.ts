/**
 * The TLS settings of a connection as a TLS socket takes them (connection.connect), for the engines whose driver opens
 * its socket with Node's options. A host name, not an IP address, is what the certificate is checked against.
 */
import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import type { ConnectionOptions } from 'node:tls';
import type { ClientTls } from '../engine';
import { EngineError } from '../engine';

async function readPem(path: string, what: string): Promise<Buffer> {
  try {
    return await readFile(path);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new EngineError(`Can't read the ${what} ${path}: ${reason}`);
  }
}

/**
 * The options of a TLS socket: the authority, the certificate and its key (one PEM file holds both), the key password,
 * and the two exceptions. Without files, the system's trusted authorities are used.
 */
export async function socketTlsOptions(tls: ClientTls, host: string): Promise<ConnectionOptions> {
  const ca = tls.caFile === undefined ? undefined : await readPem(tls.caFile, 'CA certificate');
  const pem =
    tls.certificateKeyFile === undefined ? undefined : await readPem(tls.certificateKeyFile, 'client certificate');
  return {
    ...(ca === undefined ? {} : { ca }),
    ...(pem === undefined ? {} : { cert: pem, key: pem }),
    ...(tls.certificateKeyFilePassword === undefined || tls.certificateKeyFilePassword === ''
      ? {}
      : { passphrase: tls.certificateKeyFilePassword }),
    rejectUnauthorized: tls.allowInvalidCertificates !== true,
    ...(tls.allowInvalidHostnames === true ? { checkServerIdentity: () => undefined } : {}),
    ...(isIP(host) === 0 ? { servername: host } : {}),
  };
}
