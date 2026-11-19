/**
 * Feature: user.privilege-summary
 *
 * The text of a resource (`shop.orders`, `shop.*`, `cluster`, `any resource`), and the one line that says what a role
 * grants: `shop.orders: find, insert · shop.*: find, insert, update, remove +3`. Ported from Mongoster's
 * `resourceText` and `privilegeSummary`.
 */
import type { Json } from '../../shared/engine-request';
import { isRecord, type Role } from './types';

/** A privilege shows its first 4 actions in the summary, then `+N`. */
export const summaryActions = 4;

/** A part of a resource, `*` when it is empty or missing (rule 3). */
function part(value: Json | undefined): string {
  return typeof value === 'string' && value !== '' ? value : '*';
}

/** Feature: user.privilege-summary — the text of a resource, by the first rule that applies. */
export function resourceText(resource: Json): string {
  if (isRecord(resource)) {
    if (resource['cluster'] === true) {
      return 'cluster';
    }
    if (resource['anyResource'] === true) {
      return 'any resource';
    }
    if ('db' in resource || 'collection' in resource) {
      return `${part(resource['db'])}.${part(resource['collection'])}`;
    }
  }
  return JSON.stringify(resource);
}

/** One privilege in the summary: `shop.*: find, insert, update, remove +3`. */
function privilegeText(resource: string, actions: readonly string[]): string {
  const shown = actions.slice(0, summaryActions).join(', ');
  const more = actions.length - summaryActions;
  return more > 0 ? `${resource}: ${shown} +${String(more)}` : `${resource}: ${shown}`;
}

/**
 * Feature: user.privilege-summary — what a role grants on one line, its privileges in the order the server reports
 * them; `(inherited only)` or `(none)` for a role with no privileges of its own.
 */
export function privilegeSummary(role: Pick<Role, 'privileges' | 'roles'>): string {
  if (role.privileges.length === 0) {
    return role.roles.length > 0 ? '(inherited only)' : '(none)';
  }
  return role.privileges.map((privilege) => privilegeText(privilege.resource, privilege.actions)).join(' · ');
}
