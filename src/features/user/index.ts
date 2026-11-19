/**
 * The Operations and the Reads of the user area, as the runner starts them. Derivations and the inspector are not
 * listed; `user.show` is, for the tree's database menu and Go to, which open the page.
 */
import type { RunnableFeature } from '../../shared/feature';
import { feature as changePassword } from './change-password';
import { feature as create } from './create';
import { feature as createRole } from './create-role';
import { feature as deleteUser } from './delete';
import { feature as deleteRole } from './delete-role';
import { feature as editRole } from './edit-role';
import { feature as grantRole } from './grant-role';
import { feature as list } from './list';
import { feature as listRoles } from './list-roles';
import { databasesRead } from './page/reads';
import { feature as revokeRole } from './revoke-role';
import { feature as show } from './show';
import { feature as signedIn } from './signed-in';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  show,
  databasesRead,
  list,
  listRoles,
  signedIn,
  create,
  changePassword,
  grantRole,
  revokeRole,
  deleteUser,
  createRole,
  editRole,
  deleteRole,
];
