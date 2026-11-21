/**
 * The action of the user area the runner carries out for **Save in the connection** of `user.change-password` (D49):
 * the new password of the user a connection signs in as goes into that connection's secrets, in the secret storage
 * only (R14.1), so that the next connect signs in with it. The client that is open stays as it is: the connection
 * stays connected. Nothing of the password goes back to the window: the state is told which secrets are saved.
 */
import type { AppAction } from '../../runner/ports';
import { connectionStringWithPassword } from '../../features/user/change-password';
import { jsonFields } from '../../features/connection/types';
import { connectionId } from '../../shared/ids';
import {
  dispatchConnections,
  findConnection,
  fullConnectionString,
  savedOptionSecrets,
  viewOf,
  writeGivenSecrets,
} from '../connections';
import type { AreaActions } from '.';

/** `connection.save-password` `{ connection, password }`: the connection's password replaced by the one given. */
const savePassword: AppAction = (args) => {
  const fields = jsonFields(args);
  const id = typeof fields['connection'] === 'string' ? connectionId(fields['connection']) : undefined;
  const password = fields['password'];
  const connection = id === undefined ? undefined : findConnection(id);
  if (id === undefined || connection === undefined || typeof password !== 'string' || password === '') {
    throw new Error('The action needs a saved connection and a password.');
  }
  const saved = fullConnectionString(id);
  if (saved === undefined) {
    throw new Error(`The connection ${connection.name} has no connection string saved.`);
  }
  writeGivenSecrets(id, connectionStringWithPassword(saved, password), savedOptionSecrets(id));
  dispatchConnections({ slice: 'connections', type: 'saved', connection: viewOf(connection) });
  return Promise.resolve();
};

/** The actions of this area, by name. */
export const actions: AreaActions = () => ({
  'connection.save-password': savePassword,
});
