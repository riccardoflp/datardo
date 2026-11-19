/**
 * The Engine interface (D8): what each engine of `src/engines/<engine>/` does for one kind of database. An engine opens
 * a client from the settings of a connection, carries out requests through it, says when the client is lost, and
 * closes it. Everything that is not about one engine is written once, outside the engines.
 */
import type { SshSettings, TlsSettings } from '../shared/connection';
import type { EngineName, EngineRequest } from '../shared/engine-request';

/** The TLS settings with the key password: what the client is opened with. */
export type ClientTls = TlsSettings & { readonly certificateKeyFilePassword?: string };

/** The SSH tunnel with its password and passphrase: what the tunnel is opened with. */
export type ClientSsh = SshSettings & { readonly password?: string; readonly passphrase?: string };

/** Where an SSH tunnel leads (connection.ssh-tunnel-target). */
export interface TunnelTarget {
  readonly host: string;
  readonly port: number;
}

/** Where the tunnel leads, and the connection string the client uses on its local end. */
export interface ClientThrough {
  readonly target: TunnelTarget;
  readonly connectionString: (localPort: number) => string;
  /** Why the connection string cannot go through a tunnel: the tunnel is then not opened. */
  readonly problem?: string;
}

/**
 * Whether the host key of an SSH server is trusted (connection.trust-host-key): given the server and the fingerprint
 * of its key, answers once the known hosts, or the user, have said.
 */
export type HostKeyCheck = (server: TunnelTarget, fingerprint: string) => Promise<boolean>;

/** Everything a client is opened with, secrets included: built in the main process, never sent to the window. */
export interface ClientSettings {
  readonly engine: EngineName;
  /** The connection string with its secrets. */
  readonly connectionString: string;
  readonly tls?: ClientTls;
  readonly ssh?: ClientSsh;
  /** With `ssh`: where the tunnel leads and the connection string through it. */
  readonly through?: ClientThrough;
  /** With `ssh`: the check of the SSH server's host key; a key is refused without one. */
  readonly hostKey?: HostKeyCheck;
  /** How long to find the server: 10 seconds to connect, 5 for a test of the form. */
  readonly connectTimeoutMs: number;
}

/** An open client of one engine. */
export interface EngineClient {
  /** Carries out one request and returns its reply: canonical Extended JSON for MongoDB, `RedisReply` for Redis. */
  readonly send: (request: EngineRequest, signal: AbortSignal) => Promise<unknown>;
  /** Closes the client, and its tunnel. */
  readonly close: () => Promise<void>;
  /** Calls `listener` once when the client is lost by itself: a socket closed, no server found, the tunnel ended. */
  readonly onDrop: (listener: (reason: string) => void) => void;
}

/** One engine: opens clients. */
export interface Engine {
  readonly name: EngineName;
  /** Opens a client; rejects with an error whose message holds no secret. */
  readonly open: (settings: ClientSettings, signal: AbortSignal) => Promise<EngineClient>;
}

/** An error of an engine, its message already without secrets, with the code the server gave when it gave one. */
export class EngineError extends Error {
  /** The error's code, from the server or the driver. */
  readonly code: string | number | undefined;

  /** An error with a message that holds no secret. */
  constructor(message: string, code?: string | number) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
  }
}
