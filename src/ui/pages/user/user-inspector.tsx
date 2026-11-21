/**
 * `user.inspect` (`@inspector`): the selected user or role in the inspector island. For a user, its roles as chips with
 * `✕` (`user.revoke-role`), **Grant** with its field that suggests the roles (`user.grant-role`, `Enter` too), its
 * custom data and **Raw**; for a role, its privileges, the roles it inherits, the users listed that have it and
 * **Raw**. The buttons of the heading start what the row's menu starts.
 */
import { useId } from 'react';
import {
  grantDatabaseAfterTyping,
  view,
  type Chip,
  type GrantView,
  type InspectView,
  type Raw,
} from '../../../features/user/inspect';
import { text } from '../../../features/user/text';
import { userKey, type UserControl } from '../../../features/user/types';
import { featureId } from '../../../shared/ids';
import { useAppState } from '../../state/store';
import { ControlButton } from './user-parts';
import { inspectStateOf, selectedUser } from './user-state';
import { changeUsersTab, useUsersTab } from './user-store';
import styles from '../server/server-page.module.css';
import own from './user.module.css';

function Chips(props: { readonly label: string; readonly chips: readonly Chip[]; readonly none?: string }) {
  return (
    <section className={styles['part']} aria-label={props.label}>
      <h3 className={styles['title']}>{props.label}</h3>
      {props.chips.length === 0 ? (
        <p className={styles['note']}>{props.none}</p>
      ) : (
        <ul className={own['chips']}>
          {props.chips.map((chip) => (
            <li key={chip.label} className={own['chip']} title={chip.tooltip}>
              <span>{chip.label}</span>
              {chip.revoke === undefined ? null : (
                <ControlButton
                  control={chip.revoke}
                  place="inspector"
                  className={own['chip-remove']}
                  label={chip.revoke.kind === 'start' ? chip.revoke.tooltip : undefined}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Grants what **Grant** holds, and empties it once the role is granted. */
function grant(tabId: string, control: UserControl | undefined): void {
  if (control?.kind !== 'start') {
    return;
  }
  void window.datardo
    .start({ feature: featureId(control.feature), target: control.target, place: 'inspector', args: control.args })
    .then((result) => {
      if (result.kind === 'done') {
        changeUsersTab(tabId, ({ grant: _granted, ...rest }) => rest);
      }
    });
}

function GrantPart(props: { readonly tabId: string; readonly user: string; readonly grant: GrantView }) {
  const { tabId, user, grant: shown } = props;
  const list = useId();
  const change = (role: string, database: string): void => {
    changeUsersTab(tabId, (state) => ({ ...state, grant: { user, role, database } }));
  };
  return (
    <div className={own['grant']}>
      <input
        className={styles['input']}
        aria-label={shown.label}
        placeholder={shown.placeholder}
        list={list}
        value={shown.role}
        onChange={(event) => {
          const role = event.target.value;
          change(role, grantDatabaseAfterTyping(role, shown.database));
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            grant(tabId, shown.control);
          }
        }}
      />
      <datalist id={list}>
        {shown.suggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <span>{shown.in}</span>
      <input
        className={`${styles['input']} ${own['database']}`}
        aria-label={text.window.grantDatabase}
        value={shown.database}
        onChange={(event) => {
          change(shown.role, event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            grant(tabId, shown.control);
          }
        }}
      />
      <button
        type="button"
        className={styles['button']}
        data-feature="user.grant-role@inspector"
        aria-disabled={shown.control === undefined}
        onClick={() => {
          grant(tabId, shown.control);
        }}
      >
        {shown.label}
      </button>
    </div>
  );
}

function RawPart(props: { readonly raw: Raw }) {
  const { raw } = props;
  return (
    <section className={styles['part']} aria-label={raw.label}>
      <div className={styles['buttons']}>
        <h3 className={styles['title']}>{raw.label}</h3>
        <ControlButton control={raw.copy} place="inspector" />
      </div>
      <pre className={styles['advice']}>{raw.text}</pre>
    </section>
  );
}

function Heading(props: { readonly shown: InspectView }) {
  const { shown } = props;
  const tag = shown.kind === 'user' ? shown.you : shown.builtIn;
  return (
    <>
      <h2 className={styles['title']}>
        {shown.heading}
        {tag === undefined ? null : <span className={styles['mark']}>{tag}</span>}
      </h2>
      {shown.buttons.length === 0 ? null : (
        <div className={styles['buttons']}>
          {shown.buttons.map((control) => (
            <ControlButton key={control.label} control={control} place="inspector" />
          ))}
        </div>
      )}
    </>
  );
}

/** The inspector island of a Users and roles tab with a user or a role selected. */
export function UsersInspector({ tabId }: { readonly tabId: string }): React.JSX.Element | null {
  const app = useAppState();
  const tab = useUsersTab(tabId);
  const state = tab === undefined ? undefined : inspectStateOf(app, tab);
  if (tab === undefined || state === undefined) {
    return null;
  }
  const shown = view(state);
  const user = selectedUser(tab);
  return (
    <div className={styles['inspected']} data-feature="user.inspect@inspector">
      <Heading shown={shown} />
      {shown.kind === 'user' ? (
        <>
          <Chips
            label={shown.roles.label}
            chips={shown.roles.chips}
            {...(shown.roles.none === undefined ? {} : { none: shown.roles.none })}
          />
          {shown.grant === undefined || user === undefined ? null : (
            <GrantPart tabId={tabId} user={userKey(user)} grant={shown.grant} />
          )}
          {shown.customData === undefined ? null : (
            <section className={styles['part']} aria-label={shown.customData.label}>
              <h3 className={styles['title']}>{shown.customData.label}</h3>
              <pre className={styles['advice']}>{shown.customData.text}</pre>
            </section>
          )}
        </>
      ) : (
        <>
          {shown.privileges === undefined ? null : (
            <section className={styles['part']} aria-label={shown.privileges.label}>
              <h3 className={styles['title']}>{shown.privileges.label}</h3>
              <table className={styles['plain']}>
                <thead>
                  <tr>
                    <th scope="col">{shown.privileges.columns[0]}</th>
                    <th scope="col">{shown.privileges.columns[1]}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.privileges.rows.map((row, index) => (
                    <tr key={`${row.resource} ${String(index)}`}>
                      <td>{row.resource}</td>
                      <td>{row.actions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          {shown.inherits === undefined ? null : <Chips label={shown.inherits.label} chips={shown.inherits.chips} />}
          {shown.users === undefined ? null : <Chips label={shown.users.label} chips={shown.users.chips} />}
        </>
      )}
      <RawPart raw={shown.raw} />
    </div>
  );
}
