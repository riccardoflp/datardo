/**
 * Feature: user.generate-password
 *
 * The password **Generate** proposes: 24 characters of an alphabet of 57 letters and digits, none of which needs
 * escaping in a connection string or is mistaken for another, about 140 bits. The bytes come from the system's
 * cryptographic generator, which the caller gives: this module reads no randomness itself (R3.1). The password is made
 * where it is typed and goes nowhere but the field: it is not stored, not logged, and not remembered (T21, D41).
 * Ported from Mongoster's `generatePassword`.
 */
import { text } from './text';

/** The 57 characters: no `I`, `O`, `l`, `0` or `1`, and no punctuation (rule 1). */
export const passwordAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** How long a password is. */
export const passwordLength = 24;

/** A byte of this or more is thrown away: 228 is four times 57, so every character is equally likely (rule 2). */
export const firstRejectedByte = 228;

/** How many bytes are asked for at a time: more than 24, since some are thrown away. */
const bytesAsked = 32;

/** The character a byte gives, or `undefined` for a byte that is thrown away (rule 2). */
export function characterOfByte(byte: number): string | undefined {
  return byte < firstRejectedByte ? passwordAlphabet[byte % passwordAlphabet.length] : undefined;
}

/**
 * Feature: user.generate-password — a password of 24 characters from the bytes `randomBytes` gives, asked for as many
 * times as it takes (rule 3).
 */
export function generatePassword(randomBytes: (count: number) => Uint8Array): string {
  const characters: string[] = [];
  while (characters.length < passwordLength) {
    const bytes = randomBytes(bytesAsked);
    if (bytes.length === 0) {
      throw new Error('user.generate-password needs bytes from the random generator.');
    }
    for (const byte of bytes) {
      const character = characterOfByte(byte);
      if (character !== undefined && characters.length < passwordLength) {
        characters.push(character);
      }
    }
  }
  return characters.join('');
}

/** The password field of a dialog: whether the password is shown, and the button that shows or hides it. */
export interface PasswordField {
  readonly visible: boolean;
  /** **Show** while it is hidden, **Hide** while it is shown. */
  readonly toggle: string;
}

/** The password field, hidden or shown. */
export function passwordField(visible: boolean): PasswordField {
  return { visible, toggle: visible ? text.password.hide : text.password.show };
}

/** The field once **Generate** filled it: the password is shown, and its button says **Hide**. */
export const generatedField: PasswordField = passwordField(true);
