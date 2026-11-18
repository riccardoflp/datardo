/**
 * The text of the interface of the connection area, word for word as the cards write it (R10.1).
 */

/** The refusals of a Redis connection string (connection.redis-string). */
export const redisText = {
  scheme: 'The connection string must start with redis:// or rediss://',
  invalid: 'Invalid Redis connection string',
  noHost: 'The connection string has no host',
  port: 'The port must be a number from 1 to 65535',
  database: (text: string): string => `The database must be a number from 0: ${text}`,
} as const;

/** The refusals of the connection form (connection.read-form). */
export const formText = {
  mongoScheme: 'The connection string must start with mongodb:// or mongodb+srv://',
  noHost: 'The connection string has no host',
  hostMissing: 'The host is missing',
  port: 'The port must be a number from 1 to 65535',
  noUser: 'Write the user in the connection string: mongodb://user@host',
  caFileMissing: (path: string): string => `The CA certificate file does not exist: ${path}`,
  certificateMissing: (path: string): string => `The client certificate file does not exist: ${path}`,
  sshHost: 'The SSH host is missing',
  sshPort: 'The SSH port must be a number from 1 to 65535',
  sshUsername: 'The SSH username is missing',
  sshKey: 'Choose the private key file',
  privateKeyMissing: (path: string): string => `The private key file does not exist: ${path}`,
  srvThroughSsh:
    'A mongodb+srv:// connection string can not go through an SSH tunnel: use the mongodb://host:port form of one of the servers.',
  noLinkedConnection: 'Choose the Redis connection',
  queriesFolderMissing: (path: string): string => `The queries folder does not exist: ${path}`,
} as const;

/** What connecting says (connection.connect, connection.test). */
export const connectText = {
  noConnectionString: 'Connection string not found. Remove and re-add this connection.',
  redisCluster: 'Redis Cluster is not supported yet.',
  redisSentinel: 'Redis Sentinel is not supported yet.',
  tooOld: (version: string): string => `Redis ${version} is too old: Datardo needs Redis 6.2 or later.`,
  noSecrets: (name: string): string => `The secrets of ${name} were not saved: open its form and enter them again.`,
  couldNotConnect: (name: string, reason: string): string => `Could not connect to ${name}: ${reason}`,
  notConnected: (name: string, reason: string): string => `${name} is not connected: ${reason}`,
  lost: (name: string, reason: string): string => `Lost the connection to ${name}: ${reason}`,
} as const;

/** What a test of the form says (connection.test). */
export const testText = {
  mongoConnected: (host: string, through: string, version: string): string =>
    `Connected to ${host}${through}: MongoDB ${version}.`,
  redisConnected: (host: string, through: string, version: string): string =>
    `Connected to ${host}${through}: ${version}.`,
  through: (via: string | undefined): string => (via === undefined ? '' : ` through ${via}`),
  redisAnswers: (host: string): string => `Redis ${host} answers.`,
  redisFailed: (reason: string): string => `Could not connect to Redis: ${reason}`,
  failed: (reason: string): string => `Could not connect: ${reason}`,
} as const;

/** The questions, the steps and the confirmations of the operations of the area. */
export const planText = {
  addTitle: 'Add connection',
  whichEngine: 'Which engine?',
  mongoChoice: 'MongoDB',
  mongoDescription: '4.2 or later: standalone, replica set, sharded cluster, Atlas',
  redisChoice: 'Redis',
  redisDescription: '6.2 or later: standalone or one replica',
  open: 'Open',
  editTitle: 'Edit connection…',
  whichConnection: 'Which connection?',
  saveConnection: (name: string): string => `save the connection ${name}`,
  saved: (name: string): string => `Connection ${name} saved`,
  connect: (name: string): string => `connect ${name}`,
  connecting: (host: string): string => `Connecting to ${host}…`,
  makeCurrent: (name: string): string => `make ${name} the current connection`,
  openOverview: (name: string): string => `open Overview of ${name}`,
  disconnect: (name: string): string => `disconnect ${name}`,
  saveSecrets: (name: string): string => `save the secrets of ${name}`,
  deleteSecrets: (name: string): string => `delete the secrets of ${name}`,
  makeReadOnly: (name: string): string => `make ${name} read-only`,
  allowChanges: (name: string): string => `allow changes through ${name}`,
  allowChangesQuestion: (name: string): string => `Allow changes through ${name}?`,
  allowChangesMongo: 'Documents, indexes, collections and databases can then be modified from Datardo.',
  allowChangesRedis: 'Keys and their values can then be modified from Datardo.',
  allowChangesButton: 'Allow changes',
  unlink: (from: string, to: string): string => `unlink ${from} from ${to}`,
  removeConnection: (name: string): string => `remove the connection ${name}`,
  removeQuestion: (name: string): string => `Remove connection "${name}"?`,
  removeButton: 'Remove',
  deletedWithIt: 'Deleted with it:',
  itsSecrets: 'its connection string and passwords',
  savedQueries: (count: number): string => `${String(count)} queries saved for me`,
  pins: (count: number): string => `${String(count)} pins`,
  undoOperations: (count: number): string => `${String(count)} operations of the undo history`,
  remembers: 'what Datardo remembers of it (recent queries, the layout of the columns, the history of the console)',
  removeCannotUndo:
    'This cannot be undone. The files of its queries folder, its backups, its exports and its scheduled tasks are kept.',
  noLongerPublish: (names: string): string => `${names} will no longer publish their writes for redis-oplog.`,
  deleteUndo: (count: number, name: string): string =>
    `delete the ${String(count)} operations of ${name} from the undo history`,
  deleteSavedQueries: (count: number, name: string): string =>
    `delete the ${String(count)} queries saved for me on ${name}`,
  deletePins: (count: number, name: string): string => `delete the ${String(count)} pins of ${name}`,
  deleteRemembered: (name: string): string => `delete what Datardo remembers of ${name}`,
  nothingToUndo: 'Nothing to undo.',
  cannotUndoSave: 'The previous settings and secrets are not kept.',
  cannotUndoSecrets: 'A replaced or deleted secret is not kept anywhere.',
  cannotUndoRemove: 'The secrets and Datardo’s data of the connection are deleted.',
  cannotUndoReadOnly: 'Allow changes turns it off.',
  cannotUndoAllowChanges: 'Make read-only turns it on again.',
} as const;

/** The states of a connection as they are written (connection.state). */
export const stateText = {
  'not-connected': 'not connected',
  connecting: 'connecting…',
  connected: 'connected',
  reconnecting: 'reconnecting…',
  failed: 'failed',
} as const;

/** What the form says when the system has no keychain (connection.secrets). */
export const noKeychainText = 'Passwords are not saved on this computer: no keychain is available.';

/** The text of the connection form (connection.form). */
export const formViewText = {
  newConnection: 'New connection',
  heading: (name: string): string => `Connection ${name}`,
  engines: { mongodb: 'MongoDB', redis: 'Redis' },
  name: 'Name',
  namePlaceholder: 'Shown on Home and in the connection island (default: the host)',
  connectionString: 'Connection string',
  mongoPlaceholder: 'mongodb://user@host:27017/?authSource=admin',
  redisPlaceholder: 'redis://user@host:6379/0 (rediss:// for TLS)',
  password: 'Password',
  savedPlaceholder: 'Saved — leave empty to keep it',
  enterAgain: 'The user or the host changed: enter the password again.',
  redisMode: 'Address',
  fields: 'Fields',
  host: 'Host',
  port: 'Port',
  username: 'Username',
  usernamePlaceholder: 'Empty for the default user',
  database: 'Database opened first',
  folder: 'Folder',
  color: 'Color',
  noColor: 'None',
  colors: { red: 'Red', orange: 'Orange', yellow: 'Yellow', green: 'Green', blue: 'Blue', purple: 'Purple' },
  readOnly: 'Read-only',
  readOnlyHint: 'Datardo refuses every write through this connection.',
  queriesFolder: 'Queries folder',
  browse: 'Browse…',
  tls: 'TLS / SSL',
  tlsHintMongo:
    'Encrypts the connection. Without certificates the system’s trusted authorities are used (as with tls=true in the connection string).',
  tlsHintRedis:
    'Encrypts the connection. Without certificates the system’s trusted authorities are used (as with rediss://).',
  caFile: 'CA certificate',
  caFilePlaceholder: 'ca.pem — to trust a private certificate authority',
  certificateKeyFile: 'Client certificate',
  certificateKeyFilePlaceholder: 'client.pem — certificate and private key, when the server requires one',
  keyPassword: 'Key password',
  keyPasswordPlaceholder: 'If the client key is encrypted',
  allowInvalidCertificates: 'Allow invalid certificates (insecure)',
  allowInvalidHostnames: 'Allow invalid host names (insecure)',
  ssh: 'SSH tunnel',
  sshHintMongo:
    'Connects through an SSH server (a bastion) that can reach the database. The tunnel goes to the first host of the connection string, as a direct connection to that server.',
  sshHintRedis:
    'Connects through an SSH server (a bastion) that can reach the database. The tunnel goes to the host and port above.',
  sshHost: 'SSH server',
  sshHostPlaceholder: 'bastion.example.com',
  sshPort: 'Port',
  sshUsername: 'Username',
  authentication: 'Authentication',
  authentications: { password: 'Password', 'private-key': 'Private key', agent: 'SSH agent' },
  privateKey: 'Private key',
  privateKeyPlaceholder: '~/.ssh/id_ed25519',
  passphrase: 'Passphrase',
  passphrasePlaceholder: 'If the key is encrypted',
  agentHint: 'Uses the keys loaded in the running agent (SSH_AUTH_SOCK, or the Windows OpenSSH agent).',
  oplog: 'redis-oplog',
  oplogHint:
    'Publishes the writes made in Datardo to Redis as the Meteor package cultofcoders:redis-oplog does, so that the publications of the apps using it see them. Only Datardo’s own writes: edits, inserts, deletes, the playground and undo.',
  redisConnection: 'Redis connection',
  noRedisConnection: 'None chosen',
  addRedisConnection: 'Add Redis connection…',
  test: 'Test connection',
  testing: 'Testing…',
  cancel: 'Cancel',
  save: 'Save',
  saving: 'Saving…',
  saveAndConnect: 'Save and connect',
  chooseCaFile: 'Choose the CA certificate',
  chooseCertificate: 'Choose the client certificate and key (PEM)',
  choosePrivateKey: 'Choose the SSH private key',
  chooseQueriesFolder: 'Choose the queries folder',
  choose: 'Choose',
  certificates: 'Certificates',
  allFiles: 'All files',
} as const;

/** The text of the Overview page (connection.overview). */
export const overviewText = {
  title: 'Overview',
  refresh: 'Refresh',
  edit: 'Edit connection…',
  connect: 'Connect',
  disconnect: 'Disconnect',
  readOnly: 'Read-only',
  connection: 'Connection',
  address: 'Address',
  folder: 'Folder',
  noFolder: 'None',
  throughSsh: (where: string): string => `Through the SSH tunnel ${where}`,
  tlsSet: 'TLS certificates or options set',
  readOnlyLine: 'Read-only: Datardo refuses writes through this connection',
  noUndo: 'Changes aren’t kept in the undo history',
  publishes: (name: string): string => `Publishes its writes to Redis for redis-oplog through ${name}`,
  receives: (names: string): string => `Receives the writes of ${names} for redis-oplog`,
  server: 'Server',
  loading: 'Loading…',
  retry: 'Retry',
  version: 'Version',
  topology: 'Topology',
  standalone: 'Standalone',
  replicaSet: (name: string): string => `Replica set ${name}`,
  sharded: 'Sharded cluster',
  hosts: 'Hosts',
  host: 'Host',
  role: 'Role',
  mode: 'Mode',
  master: 'master',
  replicaOf: (where: string): string => `replica of ${where}`,
  uptime: 'Uptime',
  memory: 'Memory',
  used: 'Used',
  peak: 'Peak',
  limit: 'Limit',
  noLimit: 'no limit',
  policy: 'Eviction policy',
  clients: 'Clients',
  connected: 'Connected',
  blocked: 'Blocked',
} as const;

/** The entries of the menu of a connection (connection.menu). */
export const menuText = {
  label: (name: string): string => `Menu of ${name}`,
  button: 'Connection menu',
  connect: 'Connect',
  disconnect: 'Disconnect',
  reconnect: 'Reconnect',
  overview: 'Open overview',
  edit: 'Edit connection…',
  readOnly: 'Make read-only',
  allowChanges: 'Allow changes',
  remove: 'Remove connection',
} as const;
