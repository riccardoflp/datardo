/**
 * Feature: connection.string-secrets — takes the secrets out of a connection string, so that it can be shown, logged
 * or exported, and puts them back before it is used. Also the reading of a connection string's parts that the other
 * cards of the area share.
 */

/** The parts of a connection string: scheme with its `//`, the credentials, the hosts, then the path and options. */
export interface UriParts {
  readonly scheme: string;
  /** Before `@`, as written; undefined when there is no `@`. */
  readonly credentials?: string;
  readonly hosts: string;
  /** The path, without the options: `/app`, `/`, or empty. */
  readonly path: string;
  /** The options as written, `name=value`, in order. */
  readonly options: readonly string[];
}

/** The secrets of a connection string, each as written (percent-encoded). */
export interface StringSecrets {
  readonly password?: string;
  /** By the name of the secret option, as {@link secretOptionNames} spells it. */
  readonly options: Readonly<Record<string, string>>;
}

/** How the secrets are taken out: left as empty values (*shown*), or removed with their option (*removed*). */
export type SecretsMode = 'shown' | 'removed';

/** The options of a MongoDB connection string whose values are secret, and the pair of `authMechanismProperties`. */
export const secretOptionNames = ['tlsCertificateKeyFilePassword', 'proxyPassword', 'AWS_SESSION_TOKEN'] as const;

const parts = /^([a-z][a-z0-9+.-]*:\/\/)(?:([^@/?#]*)@)?([^/?#]*)([^?#]*)(?:\?([^#]*))?/is;
const sessionToken = 'AWS_SESSION_TOKEN';
const mechanismProperties = 'authmechanismproperties';

/** The parts of a connection string, or undefined when it has no scheme. */
export function uriParts(connectionString: string): UriParts | undefined {
  const match = parts.exec(connectionString.trim());
  if (match === null) {
    return undefined;
  }
  const [, scheme = '', credentials, hosts = '', path = '', query] = match;
  return {
    scheme,
    ...(credentials === undefined ? {} : { credentials }),
    hosts,
    path,
    options: query === undefined ? [] : query.split('&').filter((option) => option !== ''),
  };
}

/** A connection string from its parts. */
export function joinUri(uri: UriParts): string {
  const credentials = uri.credentials === undefined ? '' : `${uri.credentials}@`;
  const query = uri.options.length === 0 ? '' : `${uri.path === '' ? '/' : uri.path}?${uri.options.join('&')}`;
  return `${uri.scheme}${credentials}${uri.hosts}${query === '' ? uri.path : query}`;
}

/** Text percent-decoded, or as it is when it cannot be. */
export function decoded(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    // Not percent-encoded text: it is its own value.
    return text;
  }
}

/** The name of an option as written, decoded. */
export function optionName(option: string): string {
  const equals = option.indexOf('=');
  return decoded(equals < 0 ? option : option.slice(0, equals));
}

/** The value of an option as written (not decoded). */
export function optionValue(option: string): string {
  const equals = option.indexOf('=');
  return equals < 0 ? '' : option.slice(equals + 1);
}

/** The user and the password of the credentials, as written. */
export function splitCredentials(credentials: string | undefined): { user?: string; password?: string } {
  if (credentials === undefined) {
    return {};
  }
  const colon = credentials.indexOf(':');
  return colon < 0
    ? { user: credentials }
    : { user: credentials.slice(0, colon), password: credentials.slice(colon + 1) };
}

/** A password typed in the form, percent-encoded to be put in a connection string. */
export function encodePassword(typed: string): string {
  return encodeURIComponent(typed);
}

function isMongo(uri: UriParts): boolean {
  return /^mongodb(\+srv)?:\/\/$/i.test(uri.scheme);
}

function secretOptionOf(option: string): string | undefined {
  const name = optionName(option).toLowerCase();
  return secretOptionNames.find((secret) => secret.toLowerCase() === name && secret !== sessionToken);
}

/** Splits `authMechanismProperties` into its pairs, as written, and finds the session token. */
function propertyPairs(value: string): { pairs: string[]; token?: string; at: number } {
  const pairs = value.split(',').filter((pair) => pair !== '');
  const at = pairs.findIndex((pair) => decoded(pair).toUpperCase().startsWith(`${sessionToken}:`));
  if (at < 0) {
    return { pairs, at };
  }
  const pair = pairs[at] ?? '';
  const colon = pair.search(/:|%3A/i);
  const token = pair.slice(colon + (pair[colon] === ':' ? 1 : 3));
  return { pairs, token, at };
}

/** The options without their secrets, and the secrets found. */
function optionsWithout(
  options: readonly string[],
  mode: SecretsMode,
): { options: string[]; found: Record<string, string> } {
  const found: Record<string, string> = {};
  const kept: string[] = [];
  for (const option of options) {
    const secret = secretOptionOf(option);
    if (secret !== undefined) {
      if (optionValue(option) !== '') {
        found[secret] = optionValue(option);
      }
      if (mode === 'shown') {
        const equals = option.indexOf('=');
        kept.push(`${equals < 0 ? option : option.slice(0, equals)}=`);
      }
      continue;
    }
    kept.push(...propertiesWithout(option, mode, found));
  }
  return { options: kept, found };
}

function propertiesWithout(option: string, mode: SecretsMode, found: Record<string, string>): string[] {
  if (optionName(option).toLowerCase() !== mechanismProperties) {
    return [option];
  }
  const name = option.slice(0, option.indexOf('='));
  const { pairs, token, at } = propertyPairs(optionValue(option));
  if (token === undefined) {
    return [option];
  }
  if (token !== '') {
    found[sessionToken] = token;
  }
  const left =
    mode === 'shown'
      ? pairs.map((pair, index) => (index === at ? `${sessionToken}:` : pair))
      : pairs.filter((_, index) => index !== at);
  return left.length === 0 ? [] : [`${name}=${left.join(',')}`];
}

/**
 * Feature: connection.string-secrets — the connection string without its secrets, and the secrets: the password and
 * its `:` go; in mode *shown* each secret option stays with an empty value, in mode *removed* it goes.
 */
export function withoutSecrets(
  connectionString: string,
  mode: SecretsMode,
): { readonly connectionString: string; readonly secrets: StringSecrets } {
  const uri = uriParts(connectionString);
  if (uri === undefined) {
    return { connectionString, secrets: { options: {} } };
  }
  const { user, password } = splitCredentials(uri.credentials);
  const { options, found } = isMongo(uri) ? optionsWithout(uri.options, mode) : { options: uri.options, found: {} };
  const changed = password !== undefined || options.join('&') !== uri.options.join('&');
  if (!changed) {
    return { connectionString, secrets: { options: {} } };
  }
  const credentials = user === undefined || user === '' ? undefined : user;
  const without: UriParts = { ...uri, options, ...(credentials === undefined ? {} : { credentials }) };
  const { credentials: _dropped, ...noCredentials } = without;
  return {
    connectionString: joinUri(credentials === undefined ? noCredentials : without),
    secrets: { ...(password === undefined || password === '' ? {} : { password }), options: found },
  };
}

/** The options with the secret options set: in their place when they are there, else added at the end. */
function optionsWith(options: readonly string[], secrets: Readonly<Record<string, string>>): string[] {
  const result = [...options];
  for (const name of secretOptionNames) {
    const value = secrets[name];
    if (value === undefined) {
      continue;
    }
    if (name === sessionToken) {
      setSessionToken(result, value);
      continue;
    }
    const at = result.findIndex((option) => optionName(option).toLowerCase() === name.toLowerCase());
    const written = at < 0 ? name : ((result[at] ?? '').split('=')[0] ?? name);
    if (at < 0) {
      result.push(`${name}=${value}`);
    } else {
      result[at] = `${written}=${value}`;
    }
  }
  return result;
}

function setSessionToken(options: string[], token: string): void {
  const at = options.findIndex((option) => optionName(option).toLowerCase() === mechanismProperties);
  if (at < 0) {
    options.push(`authMechanismProperties=${sessionToken}:${token}`);
    return;
  }
  const option = options[at] ?? '';
  const { pairs, at: pairAt } = propertyPairs(optionValue(option));
  const pair = `${sessionToken}:${token}`;
  const next = pairAt < 0 ? [...pairs, pair] : pairs.map((each, index) => (index === pairAt ? pair : each));
  options[at] = `${option.slice(0, option.indexOf('='))}=${next.join(',')}`;
}

/**
 * Feature: connection.string-secrets — the secrets put back: the password after the user as `:password` (for Redis
 * with no user name, as `:password@` before the host); a secret option set to its value.
 */
export function withSecrets(connectionString: string, secrets: StringSecrets): string {
  const uri = uriParts(connectionString);
  if (uri === undefined) {
    return connectionString;
  }
  const { user } = splitCredentials(uri.credentials);
  const credentials = secrets.password === undefined ? uri.credentials : `${user ?? ''}:${secrets.password}`;
  const options = isMongo(uri) ? optionsWith(uri.options, secrets.options) : uri.options;
  return joinUri({ ...uri, options, ...(credentials === undefined ? {} : { credentials }) });
}
