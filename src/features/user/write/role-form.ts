/**
 * The dialog of a custom role, shared by `user.create-role` (**New role**) and `user.edit-role` (**Edit reader@shop**):
 * its name and its database, its privileges as a list in mongosh syntax, and the roles it inherits as rows. What the
 * privileges field holds is read with `query.parse`; an empty field is no privileges.
 */
import type { Json } from '../../../shared/engine-request';
import type { Field, Question } from '../../../shared/question';
import { formattedValue } from '../../aggregate/mongosh/format';
import { text } from '../text';
import type { Privilege } from '../types';
import { valueOfText } from './parsed';

/** The privileges typed, or why they cannot be sent: `/privileges` with the parser's error, or `/not-a-list`. */
export type TypedPrivileges =
  | { readonly kind: 'privileges'; readonly privileges: readonly Json[] }
  | { readonly kind: 'problem'; readonly reason: 'privileges' | 'not-a-list'; readonly message: string };

/** The privileges of the field: `[]` when it is empty. */
export function privilegesOf(typed: string, now: number): TypedPrivileges {
  if (typed.trim() === '') {
    return { kind: 'privileges', privileges: [] };
  }
  const parsed = valueOfText(typed, now);
  if (!parsed.ok) {
    return { kind: 'problem', reason: 'privileges', message: text.createRole.privilegesError(parsed.error.message) };
  }
  return Array.isArray(parsed.value)
    ? { kind: 'privileges', privileges: parsed.value as readonly Json[] }
    : { kind: 'problem', reason: 'not-a-list', message: text.createRole.notAList };
}

/**
 * The privileges as the field starts for a role read from the server: in mongosh syntax, one privilege per line, and
 * empty when it has none.
 */
export function privilegesText(privileges: readonly Privilege[]): string {
  if (privileges.length === 0) {
    return '';
  }
  const lines = privileges.map((privilege) => `  ${formattedValue(privilege.document, { kind: 'one-line' })}`);
  return `[\n${lines.join(',\n')}\n]`;
}

/** What the dialog starts with. */
export interface RoleFormStart {
  readonly title: string;
  readonly button: string;
  readonly name: string;
  readonly database: string;
  readonly privileges: string;
  readonly inherits: string;
}

/**
 * The dialog, its fields answering `name`, `database`, `privileges` and `inherits`; the editor of **Privileges** shows
 * the example while it is empty, and **Inherits** answers its rows as `user.create`'s **Roles** do.
 */
export function roleQuestion(start: RoleFormStart): Question {
  const fields: readonly Field[] = [
    {
      kind: 'text',
      key: 'name',
      label: text.createRole.name,
      default: start.name,
      placeholder: text.createRole.namePlaceholder,
      rules: [{ kind: 'not-empty', message: text.createRole.emptyName }],
    },
    { kind: 'text', key: 'database', label: text.createRole.database, default: start.database },
    {
      kind: 'text',
      key: 'privileges',
      label: text.createRole.privileges,
      default: start.privileges,
      placeholder: text.createRole.privilegesExample,
    },
    { kind: 'text', key: 'inherits', label: text.createRole.inherits, default: start.inherits },
  ];
  return { title: start.title, button: start.button, fields };
}
