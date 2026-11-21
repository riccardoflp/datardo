/**
 * The two sections of the Users and roles page (`user.show`): **Users** and **Roles**, each with its button that
 * creates, its count and its table, or what takes the table's place (the server's message, the empty state). A click
 * on a row shows it in the inspector island (`user.inspect`); the context menu and the row's `…` button open its menu
 * (`@row-menu`); `Delete` deletes the selected user or custom role, and `Enter` edits the selected custom role
 * (`@table`).
 */
import { useState } from 'react';
import { isRoleShown, isUserShown, type RoleRow, type SectionView, type UserRow } from '../../../features/user/show';
import { text } from '../../../features/user/text';
import { roleKey, userKey, type UserControl } from '../../../features/user/types';
import { ServerGrid, type GridCell } from '../server/server-grid';
import { act } from './user-actions';
import { ControlButton, RowMenu, type OpenMenu } from './user-parts';
import { changeUsersTab, type UsersSelection, type UsersTab } from './user-store';
import styles from '../server/server-page.module.css';
import own from './user.module.css';

/** What the tables start from their keys besides the selection, carried by the table: deleting, editing. */
const tableElements = ['user.delete@table', 'user.edit-role@table', 'user.delete-role@table'].join(' ');

const usersTemplate = 'minmax(120px, 1fr) minmax(90px, 0.7fr) minmax(160px, 2fr) minmax(120px, 1fr) 36px';
const rolesTemplate =
  'minmax(120px, 1fr) minmax(90px, 0.7fr) minmax(180px, 2fr) minmax(120px, 1fr) minmax(60px, 0.4fr) 36px';

function userCells(row: UserRow): readonly GridCell[] {
  return [
    { text: row.user, ...(row.you === undefined ? {} : { marks: [row.you] }) },
    { text: row.database },
    { text: row.roles, title: row.rolesTooltip === '' ? row.roles : row.rolesTooltip },
    { text: row.mechanisms },
  ];
}

function roleCells(row: RoleRow): readonly GridCell[] {
  return [
    { text: row.role, ...(row.builtIn === undefined ? {} : { marks: [row.builtIn] }) },
    { text: row.database },
    { text: row.privileges, title: row.privilegesTooltip },
    { text: row.inherits, title: row.inheritsTooltip === '' ? row.inherits : row.inheritsTooltip },
    { text: row.users },
  ];
}

/** The control of a row's menu that starts a feature, by the feature, to start it from a key of the table. */
function controlOf(menu: readonly UserControl[], feature: string): UserControl | undefined {
  return menu.find((control) => control.kind === 'start' && control.feature === feature);
}

/** A key on the table: `Delete` and `Enter` start the control of the row's menu that the key stands for. */
function onTableKey(event: React.KeyboardEvent, menu: readonly UserControl[] | undefined, kind: 'user' | 'role') {
  const feature =
    event.key === 'Delete'
      ? kind === 'user'
        ? 'user.delete'
        : 'user.delete-role'
      : event.key === 'Enter' && kind === 'role'
        ? 'user.edit-role'
        : undefined;
  const control = feature === undefined || menu === undefined ? undefined : controlOf(menu, feature);
  if (control !== undefined) {
    event.preventDefault();
    act(control, 'table');
  }
}

interface TableProps<Row> {
  readonly tabId: string;
  readonly kind: 'user' | 'role';
  readonly section: SectionView<Row>;
  readonly keys: readonly string[];
  readonly selected: UsersSelection | undefined;
  readonly columns: readonly string[];
  readonly template: string;
  readonly cells: (row: Row) => readonly GridCell[];
  readonly menuOf: (row: Row) => readonly UserControl[];
}

function SectionTable<Row>(props: TableProps<Row>): React.JSX.Element {
  const { tabId, kind, section, keys } = props;
  const [menu, setMenu] = useState<OpenMenu | undefined>(undefined);
  const rowOf = (id: string): Row | undefined => section.rows[keys.indexOf(id)];
  const selectedRow = props.selected?.kind === kind ? rowOf(props.selected.key) : undefined;
  const select = (id: string | undefined): void => {
    changeUsersTab(tabId, ({ selected: _was, ...rest }) =>
      id === undefined ? rest : { ...rest, selected: { kind, key: id } },
    );
  };
  return (
    <div
      className={section.dimmed ? `${own['table']} ${own['dimmed']}` : own['table']}
      aria-busy={section.dimmed}
      data-key-features={tableElements}
      onKeyDown={(event) => {
        onTableKey(event, selectedRow === undefined ? undefined : props.menuOf(selectedRow), kind);
      }}
    >
      <ServerGrid
        label={kind === 'user' ? text.sections.users : text.sections.roles}
        element="user.inspect@table"
        fill
        columns={props.columns.map((label) => ({ label }))}
        template={props.template}
        rows={section.rows.map((row, index) => ({
          id: keys[index] ?? String(index),
          selected: props.selected?.kind === kind && props.selected.key === keys[index],
          cells: props.cells(row),
        }))}
        menuButton={text.window.rowMenu}
        onSelect={select}
        onMenu={(id, x, y) => {
          const row = rowOf(id);
          const controls = row === undefined ? [] : props.menuOf(row);
          if (controls.length > 0) {
            setMenu({ label: id, x, y, controls });
          }
        }}
      />
      <RowMenu
        menu={menu}
        onClose={() => {
          setMenu(undefined);
        }}
      />
    </div>
  );
}

/** What takes the place of a table: the server's message, or the empty state. */
function InPlace(props: { readonly section: SectionView<unknown> }): React.JSX.Element | null {
  const { error, empty } = props.section;
  if (error !== undefined) {
    return (
      <p className={styles['error']} role="alert">
        {error}
      </p>
    );
  }
  return empty === undefined ? null : <p className={styles['notice']}>{empty}</p>;
}

/** The **Users** section. */
export function UsersSection(props: {
  readonly tabId: string;
  readonly tab: UsersTab;
  readonly section: SectionView<UserRow>;
}): React.JSX.Element {
  const { tabId, tab, section } = props;
  const keys = tab.users.items.filter((user) => isUserShown(user, tab.filter)).map(userKey);
  const columns = text.users.columns;
  return (
    <div className={`${styles['section']} ${styles['filled']}`}>
      <div className={styles['toolbar']} role="toolbar" aria-label={text.sections.users}>
        {section.create === undefined ? null : <ControlButton control={section.create} place="toolbar" />}
        <span className={styles['count']} role="status">
          {section.count}
        </span>
      </div>
      <InPlace section={section} />
      {section.error !== undefined || section.rows.length === 0 ? null : (
        <SectionTable
          {...{ tabId, section, keys }}
          kind="user"
          selected={tab.selected}
          columns={[columns.user, columns.database, columns.roles, columns.mechanisms]}
          template={usersTemplate}
          cells={userCells}
          menuOf={(row) => row.menu}
        />
      )}
    </div>
  );
}

/** The **Roles** section, with **Built-in roles**. */
export function RolesSection(props: {
  readonly tabId: string;
  readonly tab: UsersTab;
  readonly section: SectionView<RoleRow> & {
    readonly builtIn: { readonly label: string; readonly tooltip: string; readonly checked: boolean };
  };
  readonly onBuiltIn: (checked: boolean) => void;
}): React.JSX.Element {
  const { tabId, tab, section } = props;
  const keys = tab.roles.items.filter((role) => isRoleShown(role, tab.filter)).map(roleKey);
  const columns = text.roles.columns;
  return (
    <div className={`${styles['section']} ${styles['filled']}`}>
      <div className={styles['toolbar']} role="toolbar" aria-label={text.sections.roles}>
        {section.create === undefined ? null : <ControlButton control={section.create} place="toolbar" />}
        <label className={styles['field']} title={section.builtIn.tooltip}>
          <input
            type="checkbox"
            checked={section.builtIn.checked}
            onChange={(event) => {
              props.onBuiltIn(event.target.checked);
            }}
          />
          <span>{section.builtIn.label}</span>
        </label>
        <span className={styles['count']} role="status">
          {section.count}
        </span>
      </div>
      <InPlace section={section} />
      {section.error !== undefined || section.rows.length === 0 ? null : (
        <SectionTable
          {...{ tabId, section, keys }}
          kind="role"
          selected={tab.selected}
          columns={[columns.role, columns.database, columns.privileges, columns.inherits, columns.users]}
          template={rolesTemplate}
          cells={roleCells}
          menuOf={(row) => row.menu}
        />
      )}
    </div>
  );
}
