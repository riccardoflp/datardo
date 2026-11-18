/**
 * Errors of the drivers without secrets (R14.1; connection.secrets): a driver may quote the connection string, the
 * password or a key password in its message, which then reaches the Log and the window.
 */
import { EngineError, type ClientSettings } from '../engine';

/** What replaces a secret in a message. */
export const masked = '***';

function decoded(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    // Not percent-encoded: the text itself is the secret.
    return text;
  }
}

/** The secrets of the settings, as written and decoded, longest first so that a longer one is masked whole. */
export function secretsOf(settings: ClientSettings): readonly string[] {
  const password = /^[a-z][a-z0-9+.-]*:\/\/[^:@/?#]*:([^@/?#]*)@/i.exec(settings.connectionString)?.[1];
  const options = [...settings.connectionString.matchAll(/(?:proxyPassword|tlsCertificateKeyFilePassword)=([^&#]*)/gi)];
  const token = /AWS_SESSION_TOKEN(?::|%3A)([^&,#]*)/i.exec(settings.connectionString)?.[1];
  const found = [
    password,
    ...options.map((match) => match[1]),
    token,
    settings.tls?.certificateKeyFilePassword,
    settings.ssh?.password,
    settings.ssh?.passphrase,
  ].flatMap((each) => (each === undefined || each === '' ? [] : [each, decoded(each)]));
  return [...new Set(found)].sort((a, b) => b.length - a.length);
}

/** A message with every secret replaced by `***`, and any `user:password@` of a URI too. */
export function maskText(text: string, secrets: readonly string[]): string {
  let result = text.replace(/(\/\/[^:/@\s]*):[^@\s/]*@/g, `$1:${masked}@`);
  for (const secret of secrets) {
    result = result.split(secret).join(masked);
  }
  return result;
}

function codeOf(error: unknown): string | number | undefined {
  const code = (error as { code?: unknown; codeName?: unknown }).code;
  return typeof code === 'string' || typeof code === 'number' ? code : undefined;
}

/** An error of a driver as an {@link EngineError} whose message holds no secret. */
export function maskedError(error: unknown, secrets: readonly string[]): EngineError {
  if (error instanceof EngineError) {
    return new EngineError(maskText(error.message, secrets), error.code);
  }
  const message = error instanceof Error ? error.message : String(error);
  return new EngineError(maskText(message, secrets), codeOf(error));
}
