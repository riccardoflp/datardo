/**
 * The secret storage (connection.secrets; security, "Secrets"): `secrets.json`, each value encrypted with a key the
 * system's keychain holds and written in base64. With no keychain nothing is written: the secrets stay in memory until
 * Datardo quits (D26, Q16). A value that cannot be decrypted reads as missing.
 */
import type { Found, JsonObject, StoredFile } from './store';
import { Store } from './store';

/** What encrypts the secrets: Electron's `safeStorage` in the main process, a fake in tests. */
export interface SecretCipher {
  /** Whether a keychain encrypts: false with no keychain, or with Linux's `basic_text`. */
  readonly isAvailable: () => boolean;
  readonly encrypt: (text: string) => Uint8Array;
  /** Throws when the value cannot be decrypted. */
  readonly decrypt: (bytes: Uint8Array) => string;
}

/** What `secrets.json` holds: each key's encrypted value in base64. */
export interface SecretsFile {
  readonly values: Readonly<Record<string, string>>;
}

/** The kind of file `secrets.json` is. */
export const secretsFile: StoredFile<SecretsFile> = {
  path: 'secrets.json',
  holds: 'The passwords',
  version: 1,
  migrations: {},
  empty: () => ({ values: {} }),
  read: (object) => {
    const values = object['values'] ?? {};
    if (typeof values !== 'object' || Array.isArray(values)) {
      throw new Error('values is not an object.');
    }
    const entries = Object.entries(values as JsonObject).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    );
    return { values: Object.fromEntries(entries) };
  },
  write: (value) => ({ values: { ...value.values } }),
};

/** The secrets of Datardo, by key: `connection/<id>/string`, `connection/<id>/options`, `mcp/token`. */
export class SecretStorage {
  private readonly store: Store<SecretsFile>;
  private readonly memory = new Map<string, string>();
  private readonly keychain: boolean;

  /** Opens nothing yet: {@link load} reads the file when a keychain encrypts. */
  constructor(
    folder: string,
    private readonly cipher: SecretCipher,
    onWriteError?: (error: unknown) => void,
  ) {
    this.store = new Store(folder, secretsFile, onWriteError);
    this.keychain = cipher.isAvailable();
  }

  /** Whether the secrets are saved: false when no keychain is available, and they live in memory. */
  isSaved(): boolean {
    return this.keychain;
  }

  /** Reads the file; with no keychain, reads nothing and says the file is missing. */
  async load(now?: Date): Promise<Found> {
    return this.keychain ? this.store.load(now) : { kind: 'missing' };
  }

  /** A secret, or `undefined` when there is none or it cannot be decrypted. */
  get(key: string): string | undefined {
    if (!this.keychain) {
      return this.memory.get(key);
    }
    const value = this.store.get().values[key];
    if (value === undefined) {
      return undefined;
    }
    try {
      return this.cipher.decrypt(Buffer.from(value, 'base64'));
    } catch {
      // The keychain's key changed: the value is lost, and the connection asks for it again.
      return undefined;
    }
  }

  /** Whether a secret is kept under the key, even one that cannot be decrypted. */
  has(key: string): boolean {
    return this.keychain ? this.store.get().values[key] !== undefined : this.memory.has(key);
  }

  /** Keeps a secret; false when the file is of a newer version and cannot be written. */
  set(key: string, secret: string): boolean {
    if (!this.keychain) {
      this.memory.set(key, secret);
      return true;
    }
    const encrypted = Buffer.from(this.cipher.encrypt(secret)).toString('base64');
    return this.store.set({ values: { ...this.store.get().values, [key]: encrypted } });
  }

  /** Deletes the secrets whose keys are given. */
  delete(...keys: readonly string[]): boolean {
    if (!this.keychain) {
      for (const key of keys) {
        this.memory.delete(key);
      }
      return true;
    }
    const values = this.store.get().values;
    if (!keys.some((key) => values[key] !== undefined)) {
      return true;
    }
    return this.store.set({
      values: Object.fromEntries(Object.entries(values).filter(([key]) => !keys.includes(key))),
    });
  }

  /** Writes what is waiting to be written: at quit. */
  flush(): Promise<void> {
    return this.keychain ? this.store.flush() : Promise.resolve();
  }
}
