/**
 * Feature: connection.encryption — the passwords of an exported file encrypted as Compass's `encrypt.ts` does, so that
 * each reads the other's files: PBKDF2-SHA512 and AES-256-GCM, `base64(version ‖ salt ‖ IV ‖ tag ‖ ciphertext)`. The
 * primitives and the randomness are given: this module reads no source of randomness and calls no system.
 */
import { fileText } from './text';
import { fileProblem, type FileProblem } from './types';

/** The primitives the main process gives: Node's crypto, or a fake in tests. */
export interface FileCrypto {
  /** PBKDF2 with SHA-512 of the passphrase and the salt, `length` bytes. */
  readonly pbkdf2: (
    passphrase: Uint8Array,
    salt: Uint8Array,
    iterations: number,
    length: number,
  ) => Promise<Uint8Array>;
  /** AES-256-GCM with a 16-byte tag. */
  readonly seal: (
    key: Uint8Array,
    iv: Uint8Array,
    plaintext: Uint8Array,
  ) => { ciphertext: Uint8Array; tag: Uint8Array };
  /** The plaintext, or undefined when the tag does not match. */
  readonly open: (key: Uint8Array, iv: Uint8Array, tag: Uint8Array, ciphertext: Uint8Array) => Uint8Array | undefined;
  /** Random bytes: the salt and the IVs. */
  readonly random: (size: number) => Uint8Array;
}

const version = 0x0001;
const saltSize = 16;
const ivSize = 16;
const tagSize = 16;
const iterations = 100_000;
const keySize = 32;
const headerSize = 2 + saltSize + ivSize + tagSize;

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** Base64 of bytes. */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** Bytes of base64; undefined when it is not base64. */
export function fromBase64(text: string): Uint8Array | undefined {
  try {
    return Uint8Array.from(atob(text.replace(/\s/g, '')), (char) => char.charCodeAt(0));
  } catch {
    // Not base64: the caller says the data is damaged.
    return undefined;
  }
}

/**
 * Feature: connection.encryption — the values of one file encrypted with one salt, and so one key derivation, and a
 * new IV for each value, as Compass does.
 */
export async function encryptSecrets(
  texts: readonly string[],
  passphrase: string,
  crypto: FileCrypto,
): Promise<readonly string[]> {
  const salt = crypto.random(saltSize);
  const key = await crypto.pbkdf2(utf8(passphrase), salt, iterations, keySize);
  return texts.map((text) => {
    const iv = crypto.random(ivSize);
    const { ciphertext, tag } = crypto.seal(key, iv, utf8(text));
    const data = new Uint8Array(headerSize + ciphertext.length);
    data.set([version >> 8, version & 0xff], 0);
    data.set(salt, 2);
    data.set(iv, 2 + saltSize);
    data.set(tag, 2 + saltSize + ivSize);
    data.set(ciphertext, headerSize);
    return toBase64(data);
  });
}

/** Decrypts the values of one file, deriving the key once per salt. */
export type Decrypter = (data: string) => Promise<string | FileProblem>;

/** Feature: connection.encryption — a decrypter of the values of a file, for a passphrase. */
export function decrypter(passphrase: string, crypto: FileCrypto): Decrypter {
  const keys = new Map<string, Promise<Uint8Array>>();
  return async (text) => {
    const data = fromBase64(text) ?? new Uint8Array(0);
    if (data.length < headerSize) {
      return fileProblem(fileText.tooShort);
    }
    const found = ((data[0] ?? 0) << 8) | (data[1] ?? 0);
    if (found !== version) {
      return fileProblem(fileText.unknownVersion(found));
    }
    const salt = data.subarray(2, 2 + saltSize);
    const cached = toBase64(salt);
    const key = keys.get(cached) ?? crypto.pbkdf2(utf8(passphrase), salt.slice(), iterations, keySize);
    keys.set(cached, key);
    const iv = data.subarray(2 + saltSize, 2 + saltSize + ivSize);
    const tag = data.subarray(2 + saltSize + ivSize, headerSize);
    const plaintext = crypto.open(await key, iv, tag, data.subarray(headerSize));
    return plaintext === undefined ? fileProblem(fileText.wrongPassphrase, true) : new TextDecoder().decode(plaintext);
  };
}

/** Feature: connection.encryption — one value decrypted, or why it cannot be. */
export function decryptSecrets(data: string, passphrase: string, crypto: FileCrypto): Promise<string | FileProblem> {
  return decrypter(passphrase, crypto)(data);
}
