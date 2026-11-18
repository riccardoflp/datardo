/**
 * Feature: connection.form — the app tab where a connection is written, with the fields of its engine, its TLS
 * settings, its SSH tunnel and, for MongoDB, its redis-oplog link, then tested and saved.
 *
 * No secret reaches it (R14.3): a saved connection comes as its settings, its connection string without secrets, and
 * which secrets are saved. An empty password field keeps the saved one (`connection.read-form`).
 */
import type { ConnectionForm, ConnectionView, FormField } from '../../shared/connection';
import { connectionColors } from '../../shared/connection';
import type { EngineName, Json } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import type { ConnectionId } from '../../shared/ids';
import { savedConnection, type ConnectionsState } from '../../shared/state/connections';
import type { TabShows } from '../../shared/state/tabs';
import { formPage, newForm } from './add';
import { byFolder, savedForm } from './edit';
import { connectionFromForm, identityOf } from './read-form';
import { isRedisStringProblem, redisFromString, redisStringOfFields, redisToString } from './redis-string';
import { decoded, withoutSecrets } from './string-secrets';
import { formText, formViewText as text, noKeychainText } from './text';
import { jsonFields, noFileMissing } from './types';

/** What a form tab is for: a saved connection, or a new one of an engine, in a folder. */
export interface FormOpened {
  readonly engine: EngineName;
  readonly edits?: ConnectionId;
  readonly folder?: string;
}

/** The form a tab shows, from what the tab shows; `undefined` for any other tab or a connection no longer saved. */
export function openedOf(shows: TabShows, connections: ConnectionsState): FormOpened | undefined {
  if (shows.kind !== 'app' || shows.page !== formPage) {
    return undefined;
  }
  if (shows.edits !== undefined) {
    const saved = savedConnection(connections, shows.edits);
    return saved === undefined ? undefined : { engine: saved.engine, edits: saved.id };
  }
  return shows.engine === undefined
    ? undefined
    : { engine: shows.engine, ...(shows.folder === undefined ? {} : { folder: shows.folder }) };
}

/** The form a tab opens with. */
export function initialForm(opened: FormOpened, connections: ConnectionsState): ConnectionForm {
  const saved = opened.edits === undefined ? undefined : savedConnection(connections, opened.edits);
  return saved === undefined ? newForm(opened.engine, opened.folder) : savedForm(saved);
}

/** A password typed inside the connection string moves to **Password** when the field loses the focus. */
export function withPasswordMoved(form: ConnectionForm): ConnectionForm {
  if (form.engine === 'redis') {
    const read = redisFromString(form.connectionString);
    if (form.redisMode !== 'connection-string' || isRedisStringProblem(read) || read.password === '') {
      return form;
    }
    return { ...form, password: read.password, connectionString: redisToString({ ...read, password: '' }) };
  }
  const { connectionString, secrets } = withoutSecrets(form.connectionString, 'shown');
  return secrets.password === undefined ? form : { ...form, password: decoded(secrets.password), connectionString };
}

/** The address the form says now, without secrets, for comparing who and where with the saved one. */
function addressOf(form: ConnectionForm): string {
  if (form.engine === 'mongodb') {
    return withoutSecrets(form.connectionString.trim(), 'shown').connectionString;
  }
  return form.redisMode === 'fields' ? redisStringOfFields(form) : form.connectionString.trim();
}

/** The field a refusal marks: the one `connection.read-form` names, or the file it says is missing. */
export function refusedField(
  form: ConnectionForm,
  saved: ConnectionView | undefined,
  message: string,
): FormField | undefined {
  const read = connectionFromForm(form, saved, noFileMissing);
  if (read.kind === 'refused' && read.message === message) {
    return read.field;
  }
  const files: readonly (readonly [(path: string) => string, FormField])[] = [
    [formText.caFileMissing, 'ca-file'],
    [formText.certificateMissing, 'certificate-key-file'],
    [formText.privateKeyMissing, 'ssh-private-key'],
    [formText.queriesFolderMissing, 'queries-folder'],
  ];
  return files.find(([said]) => message.includes(said('')))?.[1];
}

/** The button of the system's file dialog (connection.form, After). */
export const chooseButton = text.choose;

/** The filters of the dialog that chooses a certificate: the certificates, or all files. */
export const certificateFilters: { name: string; extensions: string[] }[] = [
  { name: text.certificates, extensions: ['pem', 'crt', 'cer', 'key'] },
  { name: text.allFiles, extensions: ['*'] },
];

/** Every field of the form, by the name the view and the window give it. */
export type FieldName =
  | FormField
  | 'name'
  | 'username'
  | 'folder'
  | 'color'
  | 'read-only'
  | 'tls'
  | 'key-password'
  | 'allow-invalid-certificates'
  | 'allow-invalid-hostnames'
  | 'ssh'
  | 'authentication'
  | 'ssh-password'
  | 'passphrase'
  | 'oplog';

/** **Browse…** beside a file: the title of the system's dialog, and what it chooses. */
export interface BrowseView {
  readonly label: string;
  readonly title: string;
  readonly kind: 'certificate' | 'file' | 'folder';
}

/** A field as the form shows it. */
export interface FieldView {
  readonly label: string;
  readonly placeholder?: string;
  /** A line under the field. */
  readonly hint?: string;
  readonly disabled: boolean;
  /** Marked by the refusal shown, until it is typed in. */
  readonly marked: boolean;
  readonly browse?: BrowseView;
  /** The element of the control, when it starts a feature of its own. */
  readonly element?: string;
}

/** A choice of a list of the form. */
export interface ChoiceView {
  readonly value: string;
  readonly label: string;
}

/** A button of the form. */
export interface ButtonView {
  readonly label: string;
  readonly element?: string;
  readonly disabled: boolean;
}

/** A section with its checkbox: its title and its hint. */
export interface SectionView {
  readonly label: string;
  readonly hint: string;
}

/** What the form shows (connection.form): the fields shown and the lists they offer. */
export interface FormView {
  readonly heading: string;
  readonly engine: string;
  /** The field that has the focus when the tab opens, or the field a refusal marks. */
  readonly focus: FieldName;
  readonly fields: Readonly<Partial<Record<FieldName, FieldView>>>;
  /** Redis: **Fields** or **Connection string**. */
  readonly redisModes?: { readonly label: string; readonly choices: readonly ChoiceView[] };
  readonly folders: readonly string[];
  readonly colors: readonly ChoiceView[];
  readonly authentications: readonly ChoiceView[];
  readonly redisConnections: readonly ChoiceView[];
  readonly sections: { readonly tls: SectionView; readonly ssh: SectionView; readonly oplog?: SectionView };
  readonly agentHint?: string;
  readonly addRedis?: { readonly label: string; readonly element: string };
  readonly message?: { readonly ok: boolean; readonly text: string };
  readonly noKeychain?: string;
  readonly buttons: Readonly<Record<'test' | 'cancel' | 'save' | 'saveAndConnect', ButtonView>>;
}

/** What the form is drawn from: what the tab is for, the connections, what is typed, and how the last try went. */
export interface FormState {
  readonly opened: FormOpened;
  readonly connections: ConnectionsState;
  readonly form: ConnectionForm;
  readonly busy?: 'testing' | 'saving';
  /** The result of the last test, or the refusal of the form, with the field it marks until it is typed in. */
  readonly result?: { readonly ok: boolean; readonly text: string; readonly field?: FormField };
}

type Fields = Partial<Record<FieldName, FieldView>>;

function field(label: string, more: Partial<FieldView> = {}): FieldView {
  return { label, disabled: false, marked: false, ...more };
}

function browse(title: string, kind: BrowseView['kind']): BrowseView {
  return { label: text.browse, title, kind };
}

/** A secret field: always empty, with **Saved — leave empty to keep it** when one is saved. */
function secret(label: string, saved: boolean, placeholder?: string): FieldView {
  const shown = saved ? text.savedPlaceholder : placeholder;
  return field(label, shown === undefined ? {} : { placeholder: shown });
}

function addressFields(form: ConnectionForm, saved: ConnectionView | undefined): Fields {
  const savedPassword = saved?.secrets.password === true;
  const changed =
    saved !== undefined && identityOf(form.engine, saved.address) !== identityOf(form.engine, addressOf(form));
  const password =
    savedPassword && changed ? field(text.password, { hint: text.enterAgain }) : secret(text.password, savedPassword);
  if (form.engine === 'redis' && form.redisMode === 'fields') {
    return {
      host: field(text.host),
      port: field(text.port),
      username: field(text.username, { placeholder: text.usernamePlaceholder }),
      password,
      database: field(text.database),
    };
  }
  const placeholder = form.engine === 'mongodb' ? text.mongoPlaceholder : text.redisPlaceholder;
  return { 'connection-string': field(text.connectionString, { placeholder }), password };
}

function tlsFields(form: ConnectionForm, saved: ConnectionView | undefined): Fields {
  const disabled = !form.tls.on;
  const keyPassword = secret(text.keyPassword, saved?.secrets.keyPassword === true, text.keyPasswordPlaceholder);
  return {
    tls: field(text.tls),
    'ca-file': field(text.caFile, {
      placeholder: text.caFilePlaceholder,
      disabled,
      browse: browse(text.chooseCaFile, 'certificate'),
    }),
    'certificate-key-file': field(text.certificateKeyFile, {
      placeholder: text.certificateKeyFilePlaceholder,
      disabled,
      browse: browse(text.chooseCertificate, 'certificate'),
    }),
    'key-password': { ...keyPassword, disabled },
    'allow-invalid-certificates': field(text.allowInvalidCertificates, { disabled }),
    'allow-invalid-hostnames': field(text.allowInvalidHostnames, { disabled }),
  };
}

function sshSecrets(form: ConnectionForm, saved: ConnectionView | undefined): Fields {
  const disabled = !form.ssh.on;
  switch (form.ssh.authentication) {
    case 'password':
      return { 'ssh-password': { ...secret(text.password, saved?.secrets.sshPassword === true), disabled } };
    case 'private-key': {
      const passphrase = secret(text.passphrase, saved?.secrets.passphrase === true, text.passphrasePlaceholder);
      return {
        'ssh-private-key': field(text.privateKey, {
          placeholder: text.privateKeyPlaceholder,
          disabled,
          browse: browse(text.choosePrivateKey, 'file'),
        }),
        passphrase: { ...passphrase, disabled },
      };
    }
    case 'agent':
      return {};
  }
}

function sshFields(form: ConnectionForm, saved: ConnectionView | undefined): Fields {
  const disabled = !form.ssh.on;
  return {
    ssh: field(text.ssh),
    'ssh-host': field(text.sshHost, { placeholder: text.sshHostPlaceholder, disabled }),
    'ssh-port': field(text.sshPort, { disabled }),
    'ssh-username': field(text.sshUsername, { disabled }),
    authentication: field(text.authentication, { disabled }),
    ...sshSecrets(form, saved),
  };
}

function settingFields(form: ConnectionForm, saved: ConnectionView | undefined): Fields {
  const allowsChanges = saved?.readOnly === true && !form.readOnly;
  return {
    folder: field(text.folder, { element: 'connection.move-to-folder@form' }),
    color: field(text.color, { element: 'connection.set-color@form' }),
    'read-only': field(text.readOnly, {
      hint: text.readOnlyHint,
      element: allowsChanges ? 'connection.allow-changes@form' : 'connection.read-only@form',
    }),
    ...(form.engine === 'mongodb'
      ? { 'queries-folder': field(text.queriesFolder, { browse: browse(text.chooseQueriesFolder, 'folder') }) }
      : {}),
  };
}

function oplogFields(form: ConnectionForm): Fields {
  if (form.engine !== 'mongodb') {
    return {};
  }
  return {
    oplog: field(text.oplog, { element: 'connection.unlink-redis@form' }),
    'linked-connection': field(text.redisConnection, {
      placeholder: text.noRedisConnection,
      disabled: !form.oplog.on,
      element: 'connection.link-redis@form',
    }),
  };
}

function marked(fields: Fields, name: FieldName | undefined): Fields {
  const shown = name === undefined ? undefined : fields[name];
  return name === undefined || shown === undefined ? fields : { ...fields, [name]: { ...shown, marked: true } };
}

function firstFocus(state: FormState): FieldName {
  const refused = state.result?.field;
  if (refused !== undefined) {
    return refused;
  }
  if (state.opened.edits !== undefined) {
    return 'name';
  }
  return state.form.engine === 'redis' && state.form.redisMode === 'fields' ? 'host' : 'connection-string';
}

function buttons(busy: FormState['busy']): FormView['buttons'] {
  const disabled = busy !== undefined;
  return {
    test: { label: busy === 'testing' ? text.testing : text.test, element: 'connection.test@form', disabled },
    cancel: { label: text.cancel, disabled },
    save: { label: busy === 'saving' ? text.saving : text.save, element: 'connection.save@form', disabled },
    saveAndConnect: { label: text.saveAndConnect, element: 'connection.save@form', disabled },
  };
}

type Lists = Pick<FormView, 'folders' | 'colors' | 'authentications' | 'redisConnections'>;

function lists(connections: ConnectionsState): Lists {
  const folders = new Set(connections.saved.flatMap((each) => (each.folder === undefined ? [] : [each.folder])));
  return {
    folders: [...folders].sort((a, b) => a.localeCompare(b)),
    colors: [
      { value: '', label: text.noColor },
      ...connectionColors.map((color) => ({ value: color, label: text.colors[color] })),
    ],
    authentications: (['password', 'private-key', 'agent'] as const).map((value) => ({
      value,
      label: text.authentications[value],
    })),
    redisConnections: byFolder(connections.saved)
      .filter((each) => each.engine === 'redis')
      .map((each) => ({
        value: each.id,
        label: each.folder === undefined ? each.name : `${each.folder} / ${each.name}`,
      })),
  };
}

const redisModes: NonNullable<FormView['redisModes']> = {
  label: text.redisMode,
  choices: [
    { value: 'fields', label: text.fields },
    { value: 'connection-string', label: text.connectionString },
  ],
};

/** Feature: connection.form — what the form shows, from what is typed and how the last test or save went. */
export function view(state: FormState): FormView {
  const { form, connections } = state;
  const saved = state.opened.edits === undefined ? undefined : savedConnection(connections, state.opened.edits);
  const mongo = form.engine === 'mongodb';
  const fields: Fields = {
    name: field(text.name, { placeholder: text.namePlaceholder }),
    ...addressFields(form, saved),
    ...settingFields(form, saved),
    ...tlsFields(form, saved),
    ...sshFields(form, saved),
    ...oplogFields(form),
  };
  return {
    heading: saved === undefined ? text.newConnection : text.heading(saved.name),
    engine: text.engines[form.engine],
    focus: firstFocus(state),
    fields: marked(fields, state.result?.field),
    ...(mongo ? {} : { redisModes }),
    ...lists(connections),
    sections: {
      tls: { label: text.tls, hint: mongo ? text.tlsHintMongo : text.tlsHintRedis },
      ssh: { label: text.ssh, hint: mongo ? text.sshHintMongo : text.sshHintRedis },
      ...(mongo ? { oplog: { label: text.oplog, hint: text.oplogHint } } : {}),
    },
    ...(form.ssh.authentication === 'agent' ? { agentHint: text.agentHint } : {}),
    ...(mongo ? { addRedis: { label: text.addRedisConnection, element: 'connection.add@form' } } : {}),
    ...(state.result === undefined ? {} : { message: { ok: state.result.ok, text: state.result.text } }),
    ...(connections.keychain ? {} : { noKeychain: noKeychainText }),
    buttons: buttons(state.busy),
  };
}

/**
 * Feature: connection.form — **Browse…** beside a file: `args` is `{ title, kind }`; the main process opens the
 * system's file dialog and answers the path chosen, or null.
 */
export function request(_context: Context, args: Json): ReadRequest {
  const fields = jsonFields(args);
  return {
    kind: 'app',
    action: 'connection.choose-file',
    args: { title: fields['title'] ?? '', kind: fields['kind'] ?? 'file' },
  };
}

/** Feature: connection.form — the path chosen, or null when the dialog was dismissed. */
export function parse(replies: readonly unknown[]): string | null {
  const chosen = replies[0];
  return typeof chosen === 'string' ? chosen : null;
}
