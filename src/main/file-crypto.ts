/**
 * The primitives of `connection.encryption`, from Node's crypto: PBKDF2-SHA512, AES-256-GCM with a 16-byte tag, and
 * random bytes. The format of the files is the feature's; this module only gives it the system's cryptography.
 */
import { createCipheriv, createDecipheriv, pbkdf2, randomBytes } from 'node:crypto';
import type { FileCrypto } from '../features/connection/encryption';

const tagLength = 16;

/** Node's cryptography, as `connection.encryption` takes it. */
export const nodeFileCrypto: FileCrypto = {
  pbkdf2: (passphrase, salt, iterations, length) =>
    new Promise((resolve, reject) => {
      pbkdf2(passphrase, salt, iterations, length, 'sha512', (error, key) => {
        if (error === null) {
          resolve(new Uint8Array(key));
        } else {
          reject(error);
        }
      });
    }),
  seal: (key, iv, plaintext) => {
    const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: tagLength });
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { ciphertext: new Uint8Array(ciphertext), tag: new Uint8Array(cipher.getAuthTag()) };
  },
  open: (key, iv, tag, ciphertext) => {
    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: tagLength });
    decipher.setAuthTag(tag);
    try {
      return new Uint8Array(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
    } catch {
      // The tag does not match: a wrong passphrase or damaged data, which the feature says.
      return undefined;
    }
  },
  random: (size) => new Uint8Array(randomBytes(size)),
};
