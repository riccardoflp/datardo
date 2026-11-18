/**
 * The cipher of the secret storage: Electron's `safeStorage`, whose key the system's keychain holds (D26;
 * connection.secrets). On Linux the `basic_text` backend encrypts with a key written in the program, which is no
 * keychain: Datardo then keeps the secrets in memory and writes none.
 */
import { safeStorage } from 'electron';
import type { SecretCipher } from '../storage/secrets';

/** Whether the system offers a keychain to encrypt with; asked once the app is ready. */
function keychainAvailable(): boolean {
  if (!safeStorage.isEncryptionAvailable()) {
    return false;
  }
  return process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text';
}

/** The secret storage's cipher in the main process. */
export const safeStorageCipher: SecretCipher = {
  isAvailable: keychainAvailable,
  encrypt: (text) => safeStorage.encryptString(text),
  decrypt: (bytes) => safeStorage.decryptString(Buffer.from(bytes)),
};
