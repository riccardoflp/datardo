/**
 * Feature: connection.tls-in-uri — Datardo keeps the certificate files apart from the connection string; Compass and a
 * list of connection strings keep them in it. These move the TLS settings out of and into a MongoDB connection string.
 */
import type { TlsSettings } from '../../shared/connection';
import { decoded, joinUri, optionName, optionValue, uriParts } from './string-secrets';

/** The TLS settings a connection string can hold, with the key password, which is a secret. */
export type UriTls = TlsSettings & { readonly certificateKeyFilePassword?: string };

/** Whether the key password goes into the connection string. */
export type KeyPasswordIn = 'with-secrets' | 'without-secrets';

const tlsOptions = [
  'tls',
  'ssl',
  'tlsCAFile',
  'tlsCertificateKeyFile',
  'tlsCertificateKeyFilePassword',
  'tlsAllowInvalidCertificates',
  'tlsAllowInvalidHostnames',
  'tlsInsecure',
];

/** The decoded value of an option, by its name ignoring case. */
function option(connectionString: string, name: string): string | undefined {
  const found = uriParts(connectionString)?.options.find(
    (each) => optionName(each).toLowerCase() === name.toLowerCase(),
  );
  return found === undefined ? undefined : decoded(optionValue(found));
}

/**
 * The connection string with options removed (`undefined`) or set (added at the end, encoded, replacing those of the
 * same name ignoring case); the other options keep their place and their spelling.
 */
export function setOptions(
  connectionString: string,
  changes: readonly (readonly [string, string | undefined])[],
): string {
  const uri = uriParts(connectionString);
  if (uri === undefined) {
    return connectionString;
  }
  const names = new Set(changes.map(([name]) => name.toLowerCase()));
  const kept = uri.options.filter((each) => !names.has(optionName(each).toLowerCase()));
  const added = changes.flatMap(([name, value]) =>
    value === undefined ? [] : [`${name}=${encodeURIComponent(value)}`],
  );
  return joinUri({ ...uri, options: [...kept, ...added] });
}

const isTrue = (value: string | undefined): boolean => value?.toLowerCase() === 'true';

/**
 * Feature: connection.tls-in-uri — the TLS settings out of a connection string, only when it names a certificate file
 * and TLS is not turned off; the TLS options are then removed from it.
 */
export function tlsFromUri(connectionString: string): { readonly connectionString: string; readonly tls?: UriTls } {
  const caFile = option(connectionString, 'tlsCAFile');
  const certificateKeyFile = option(connectionString, 'tlsCertificateKeyFile');
  if ((caFile === undefined || caFile === '') && (certificateKeyFile === undefined || certificateKeyFile === '')) {
    return { connectionString };
  }
  if ((option(connectionString, 'tls') ?? option(connectionString, 'ssl'))?.toLowerCase() === 'false') {
    return { connectionString };
  }
  const insecure = isTrue(option(connectionString, 'tlsInsecure'));
  const keyPassword = option(connectionString, 'tlsCertificateKeyFilePassword');
  const hasCertificate = certificateKeyFile !== undefined && certificateKeyFile !== '';
  const tls: UriTls = {
    ...(caFile === undefined || caFile === '' ? {} : { caFile }),
    ...(hasCertificate ? { certificateKeyFile } : {}),
    ...(hasCertificate && keyPassword !== undefined && keyPassword !== ''
      ? { certificateKeyFilePassword: keyPassword }
      : {}),
    ...(insecure || isTrue(option(connectionString, 'tlsAllowInvalidCertificates'))
      ? { allowInvalidCertificates: true }
      : {}),
    ...(insecure || isTrue(option(connectionString, 'tlsAllowInvalidHostnames'))
      ? { allowInvalidHostnames: true }
      : {}),
  };
  const without = setOptions(
    connectionString,
    tlsOptions.map((name) => [name, undefined] as const),
  );
  return { connectionString: without, tls };
}

/**
 * Feature: connection.tls-in-uri — the TLS settings written into a connection string: `tls=true`, the files, the key
 * password only with the secrets, and the two exceptions when on.
 */
export function tlsIntoUri(connectionString: string, tls: UriTls | undefined, keyPassword: KeyPasswordIn): string {
  if (tls === undefined) {
    return connectionString;
  }
  return setOptions(connectionString, [
    ['tls', 'true'],
    ['ssl', undefined],
    ['tlsCAFile', tls.caFile],
    ['tlsCertificateKeyFile', tls.certificateKeyFile],
    ['tlsCertificateKeyFilePassword', keyPassword === 'with-secrets' ? tls.certificateKeyFilePassword : undefined],
    ['tlsAllowInvalidCertificates', tls.allowInvalidCertificates === true ? 'true' : undefined],
    ['tlsAllowInvalidHostnames', tls.allowInvalidHostnames === true ? 'true' : undefined],
    ['tlsInsecure', undefined],
  ]);
}
