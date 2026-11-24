/**
 * A saved connection, as the parts of Datardo share it: what `connections.json` keeps, what the app's state shows, what
 * the connection form sends, and what the server says it is. Nothing here holds a secret except what the form sends
 * to the main process (a typed password goes from the window to the main process, never back: R14.3).
 */
import type { ColorMap, ConnectionColor } from './color';
import type { EngineName, Json } from './engine-request';
import type { Exclusions } from './exclusion';
import type { ConnectionId } from './ids';

export type { ConnectionColor } from './color';

/** The TLS settings of a connection that are not secret: the files and the two exceptions (connection.secrets). */
export type TlsSettings = {
  readonly caFile?: string;
  readonly certificateKeyFile?: string;
  readonly allowInvalidCertificates?: boolean;
  readonly allowInvalidHostnames?: boolean;
};

/** How the SSH tunnel authenticates. */
export type SshAuthentication = 'password' | 'private-key' | 'agent';

/** The SSH tunnel of a connection, without its password or passphrase. */
export type SshSettings = {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly authentication: SshAuthentication;
  readonly privateKeyFile?: string;
};

/** A saved connection as `connections.json` keeps it: nothing secret (data.md; connection.secrets). */
export type SavedConnection = {
  readonly id: ConnectionId;
  readonly name: string;
  readonly engine: EngineName;
  /** The hosts as shown, without credentials: `db1:27017,db2:27017`, `cache:6379`. */
  readonly hosts: string;
  readonly folder?: string;
  readonly color?: ConnectionColor;
  /** The own colors of its databases, a MongoDB database by its name, a Redis one by its number (`tree.color-of`). */
  readonly databaseColors?: ColorMap;
  /** The own colors of its collections, views and buckets, by `<database>.<collection>`; MongoDB only. */
  readonly collectionColors?: ColorMap;
  /** Whether the whole connection is excluded from searches (`tree.excluded`); absent when it is not. */
  readonly excluded?: true;
  /** Its databases and collections excluded from searches, by their keys; MongoDB only (`tree.excluded`). */
  readonly exclusions?: Exclusions;
  readonly readOnly: boolean;
  /** Whether the undo history is kept for writes through it (`undo.record`). */
  readonly keepsUndo: boolean;
  readonly tls?: TlsSettings;
  readonly ssh?: SshSettings;
  readonly queriesFolder?: string;
  /** The linked connection, for redis-oplog. */
  readonly publishesTo?: ConnectionId;
  /** What `oplog.publish` keeps about what is published, kept even while no connection is linked. */
  readonly oplog?: Json;
};

/** Which secrets of a connection are saved, never their values: what the form and the plans may know (R14.3). */
export type SecretsSaved = {
  readonly connectionString: boolean;
  /** The password of the connection string. */
  readonly password: boolean;
  /** The secret options of the connection string that have a saved value: `proxyPassword`, `AWS_SESSION_TOKEN`. */
  readonly secretOptions: readonly string[];
  readonly keyPassword: boolean;
  readonly sshPassword: boolean;
  readonly passphrase: boolean;
};

/** No secret saved. */
export const noSecretsSaved: SecretsSaved = {
  connectionString: false,
  password: false,
  secretOptions: [],
  keyPassword: false,
  sshPassword: false,
  passphrase: false,
};

/** A saved connection as the app's state shows it: its settings, its address without secrets, which secrets it has. */
export type ConnectionView = SavedConnection & {
  /** The connection string without its secrets, as the form shows it; unknown while its secret cannot be read. */
  readonly address?: string;
  readonly secrets: SecretsSaved;
};

/** The state of a connection (connection.state). */
export type ConnectionStateName = 'not-connected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

/** The topology of a MongoDB deployment. */
export type MongoTopology =
  | { readonly kind: 'standalone' }
  | { readonly kind: 'replica-set'; readonly name: string }
  | { readonly kind: 'sharded' };

/** A host of a MongoDB deployment and its role. */
export type MongoHost = {
  readonly host: string;
  readonly role: 'primary' | 'secondary' | 'arbiter' | 'mongos' | 'standalone';
};

/** What a MongoDB server is (connection.server-info). */
export type MongoServerInfo = {
  readonly engine: 'mongodb';
  readonly version: string;
  readonly topology: MongoTopology;
  readonly hosts: readonly MongoHost[];
};

/** The replication role of a Redis server. */
export type RedisRole =
  { readonly kind: 'master' } | { readonly kind: 'replica'; readonly masterHost: string; readonly masterPort: string };

/** What a Redis server is (connection.server-info); the numbers of the Overview page when they were read. */
export type RedisServerInfo = {
  readonly engine: 'redis';
  /** **Redis** or **Valkey**, as the server is shown. */
  readonly product: 'Redis' | 'Valkey';
  /** The version as shown: `valkey_version` for Valkey, `redis_version` otherwise. */
  readonly version: string;
  /** `redis_version`, which decides what is accepted. */
  readonly redisVersion: string;
  /** `redis_mode`: `standalone`, `cluster`, `sentinel`; absent when the server does not say. */
  readonly mode?: string;
  readonly role?: RedisRole;
  readonly uptimeSeconds?: number;
  readonly memory?: {
    readonly used?: number;
    readonly peak?: number;
    readonly limit?: number;
    readonly policy?: string;
  };
  readonly clients?: { readonly connected?: number; readonly blocked?: number; readonly limit?: number };
};

/** What a server is. */
export type ServerInfo = MongoServerInfo | RedisServerInfo;

/** The fields of the connection form that can be marked by a refusal (connection.read-form). */
export type FormField =
  | 'connection-string'
  | 'password'
  | 'host'
  | 'port'
  | 'database'
  | 'ca-file'
  | 'certificate-key-file'
  | 'ssh-host'
  | 'ssh-port'
  | 'ssh-username'
  | 'ssh-private-key'
  | 'queries-folder'
  | 'linked-connection';

/** What the connection form says, as the window sends it to the main process (connection.form). */
export type ConnectionForm = {
  readonly engine: EngineName;
  readonly name: string;
  /** MongoDB: the connection string. Redis: the one of **Connection string**. */
  readonly connectionString: string;
  readonly password: string;
  /** Redis: **Fields** or **Connection string**. */
  readonly redisMode: 'fields' | 'connection-string';
  readonly host: string;
  readonly port: string;
  readonly username: string;
  readonly database: string;
  readonly folder: string;
  readonly color: ConnectionColor | '';
  readonly readOnly: boolean;
  readonly queriesFolder: string;
  readonly tls: {
    readonly on: boolean;
    readonly caFile: string;
    readonly certificateKeyFile: string;
    readonly keyPassword: string;
    readonly allowInvalidCertificates: boolean;
    readonly allowInvalidHostnames: boolean;
  };
  readonly ssh: {
    readonly on: boolean;
    readonly host: string;
    readonly port: string;
    readonly username: string;
    readonly authentication: SshAuthentication;
    readonly password: string;
    readonly privateKeyFile: string;
    readonly passphrase: string;
  };
  readonly oplog: { readonly on: boolean; readonly connection: string; readonly settings?: Json };
};

/** What happens to one secret when the form is saved: kept as saved, replaced, or dropped. */
export type SecretChange =
  { readonly kind: 'keep' } | { readonly kind: 'replace'; readonly value: string } | { readonly kind: 'drop' };

/** The settings of a connection read from the form, with what to do with each secret (connection.read-form). */
export type ConnectionDraft = {
  readonly name: string;
  readonly engine: EngineName;
  /** The connection string without its secrets, secret options left with an empty value. */
  readonly address: string;
  readonly hosts: string;
  readonly password: SecretChange;
  /** By the name of the secret option: `proxyPassword`, `tlsCertificateKeyFilePassword`, `AWS_SESSION_TOKEN`. */
  readonly secretOptions: { readonly [name: string]: SecretChange };
  readonly keyPassword: SecretChange;
  readonly sshPassword: SecretChange;
  readonly passphrase: SecretChange;
  readonly tls?: TlsSettings;
  readonly ssh?: SshSettings;
  readonly folder?: string;
  readonly color?: ConnectionColor;
  readonly readOnly: boolean;
  readonly queriesFolder?: string;
  readonly publishesTo?: ConnectionId;
  readonly oplog?: Json;
};

/** What the main process answers when the form is tried (`connection.test`): the replies, or why there are none. */
export type TryReply =
  | { readonly kind: 'refused'; readonly code: string; readonly message: string; readonly field: FormField }
  | { readonly kind: 'failed'; readonly reason: string }
  | {
      readonly kind: 'answered';
      readonly engine: EngineName;
      /** `<host>` of the connection string for MongoDB, `<host>:<port>` for Redis. */
      readonly host: string;
      /** `<user>@<SSH server>` when the tunnel is on. */
      readonly through?: string;
      /** The replies to the requests of `connection.server-info`, in order. */
      readonly replies: readonly unknown[];
      /** For MongoDB with redis-oplog on: the linked connection, and why it did not answer when it did not. */
      readonly linked?: { readonly host: string; readonly reason?: string };
    };
