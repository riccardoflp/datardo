/**
 * The parts of the connection form (`connection.form`), in its order: the address, the settings, **TLS / SSL**,
 * **SSH tunnel** and, for MongoDB, **redis-oplog**. Each draws the fields its View shows.
 */
import { useId } from 'react';
import type { FormView } from '../../../features/connection/form';
import type { ConnectionColor, ConnectionForm, FormField, SshAuthentication } from '../../../shared/connection';
import { startFeature } from '../../shell/intent';
import { CheckField, ChoiceField, TextField } from './form-fields';
import styles from './connection-pages.module.css';

/** What every part is given: the view, what is typed, how to change it, `Enter`, and **Browse…**. */
export interface PartProps {
  readonly view: FormView;
  readonly form: ConnectionForm;
  readonly set: (form: ConnectionForm, field?: FormField) => void;
  readonly enter: () => void;
  readonly browse: (title: string, kind: string, chosen: (path: string) => void) => void;
  readonly leaveString: () => void;
  readonly redisMode: (mode: ConnectionForm['redisMode']) => void;
}

/** **Name**, then the address: the connection string and its password, or the fields of Redis. */
export function AddressPart({ view, form, set, enter, leaveString, redisMode }: PartProps): React.JSX.Element {
  const fields = view.fields;
  const text = (name: 'host' | 'port' | 'username' | 'database', field?: FormField) => (
    <TextField
      name={name}
      field={fields[name]}
      value={form[name]}
      onChange={(value) => {
        set({ ...form, [name]: value }, field);
      }}
      onEnter={enter}
    />
  );
  return (
    <>
      <TextField
        name="name"
        field={fields.name}
        value={form.name}
        onChange={(name) => {
          set({ ...form, name });
        }}
        onEnter={enter}
      />
      {view.redisModes === undefined ? null : (
        <fieldset className={styles['choices']}>
          <legend className={styles['label']}>{view.redisModes.label}</legend>
          {view.redisModes.choices.map((choice) => (
            <label key={choice.value} className={styles['check']}>
              <input
                type="radio"
                name="redis-mode"
                checked={form.redisMode === choice.value}
                onChange={() => {
                  redisMode(choice.value === 'fields' ? 'fields' : 'connection-string');
                }}
              />
              <span>{choice.label}</span>
            </label>
          ))}
        </fieldset>
      )}
      <TextField
        name="connection-string"
        field={fields['connection-string']}
        value={form.connectionString}
        onChange={(value) => {
          set({ ...form, connectionString: value }, 'connection-string');
        }}
        onBlur={leaveString}
        onEnter={enter}
      />
      {text('host', 'host')}
      {text('port', 'port')}
      {text('username')}
      <TextField
        name="password"
        field={fields.password}
        value={form.password}
        secret
        onChange={(value) => {
          set({ ...form, password: value }, 'password');
        }}
        onEnter={enter}
      />
      {text('database', 'database')}
    </>
  );
}

/** **Folder**, **Color**, **Read-only** and, for MongoDB, **Queries folder**. */
export function SettingsPart({ view, form, set, enter, browse }: PartProps): React.JSX.Element {
  const folders = useId();
  const fields = view.fields;
  const queries = fields['queries-folder'];
  return (
    <>
      <TextField
        name="folder"
        field={fields.folder}
        value={form.folder}
        list={folders}
        onChange={(value) => {
          set({ ...form, folder: value });
        }}
        onEnter={enter}
      />
      <datalist id={folders}>
        {view.folders.map((folder) => (
          <option key={folder} value={folder} />
        ))}
      </datalist>
      <ChoiceField
        name="color"
        field={fields.color}
        value={form.color}
        choices={view.colors}
        onChange={(value) => {
          set({ ...form, color: value as ConnectionColor | '' });
        }}
      />
      <CheckField
        name="read-only"
        field={fields['read-only']}
        checked={form.readOnly}
        onChange={(readOnly) => {
          set({ ...form, readOnly });
        }}
      />
      <TextField
        name="queries-folder"
        field={queries}
        value={form.queriesFolder}
        onChange={(value) => {
          set({ ...form, queriesFolder: value }, 'queries-folder');
        }}
        onEnter={enter}
        onBrowse={() => {
          browse(queries?.browse?.title ?? '', 'folder', (path) => {
            set({ ...form, queriesFolder: path }, 'queries-folder');
          });
        }}
      />
    </>
  );
}

/** A section with its checkbox, its hint and its fields. */
export function Section(props: {
  readonly name: 'tls' | 'ssh' | 'oplog';
  readonly title: { readonly label: string; readonly hint: string };
  readonly on: boolean;
  readonly element?: string | undefined;
  readonly turn: (on: boolean) => void;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const hint = useId();
  return (
    <fieldset className={styles['section']}>
      <legend className={styles['legend']}>
        <label className={styles['check']}>
          <input
            type="checkbox"
            checked={props.on}
            data-field={props.name}
            data-feature={props.element}
            aria-describedby={hint}
            onChange={(event) => {
              props.turn(event.target.checked);
            }}
          />
          <span>{props.title.label}</span>
        </label>
      </legend>
      <p id={hint} className={styles['hint']}>
        {props.title.hint}
      </p>
      {props.children}
    </fieldset>
  );
}

/** **redis-oplog** of a MongoDB connection: the Redis connection, and **Add Redis connection…**. */
export function OplogPart({ view, form, set }: PartProps): React.JSX.Element | null {
  const section = view.sections.oplog;
  if (section === undefined) {
    return null;
  }
  const oplog = form.oplog;
  return (
    <Section
      name="oplog"
      title={section}
      on={oplog.on}
      element={view.fields.oplog?.element}
      turn={(on) => {
        set({ ...form, oplog: { ...oplog, on } });
      }}
    >
      <div className={styles['row']}>
        <ChoiceField
          name="linked-connection"
          field={view.fields['linked-connection']}
          value={oplog.connection}
          choices={view.redisConnections}
          onChange={(connection) => {
            set({ ...form, oplog: { ...oplog, connection } }, 'linked-connection');
          }}
        />
        {view.addRedis === undefined ? null : (
          <button
            type="button"
            className={styles['button']}
            data-feature={view.addRedis.element}
            onClick={() => {
              startFeature('connection.add', { place: 'form', args: 'redis' });
            }}
          >
            {view.addRedis.label}
          </button>
        )}
      </div>
    </Section>
  );
}

/** The authentications of the SSH tunnel, as the list gives them. */
export function authenticationOf(value: string): SshAuthentication {
  return value === 'private-key' || value === 'agent' ? value : 'password';
}
