/**
 * One file of the data folder (data.md): JSON whose first field is `"version"`, read with its migrations, written
 * atomically by one writer a moment after its last change. What happens with a file that is missing, older, newer or
 * damaged is the table of data.md, "Versions" (R15.1 to R15.4).
 */
import { mkdir, readFile, rename, writeFile, open, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Json } from '../shared/engine-request';

/** A JSON object, as a stored file holds it. */
export type JsonObject = { readonly [key: string]: Json };

/** A migration from one version to the next: pure, from the old object to the new one (R15.2). */
export type Migration = (old: JsonObject) => JsonObject;

/** What a kind of stored file is: its name, its current version, how to read and write its content. */
export interface StoredFile<T> {
  /** The path in the data folder, with `/`: `settings.json`, `state/<id>.json`. */
  readonly path: string;
  /** What the file holds, in words, for the messages: `The settings`. */
  readonly holds: string;
  readonly version: number;
  /** `migrations[n]` turns version n into n + 1. */
  readonly migrations: Readonly<Record<number, Migration>>;
  /** The content when the file is missing or set aside. */
  readonly empty: () => T;
  /** The content from the object of the current version; throws when it cannot be read. */
  readonly read: (object: JsonObject) => T;
  /** The object to write, without `version`. */
  readonly write: (value: T) => JsonObject;
}

/** How a file was found when it was opened. */
export type Found =
  | { readonly kind: 'missing' }
  | { readonly kind: 'current' }
  | { readonly kind: 'older'; readonly version: number }
  | { readonly kind: 'newer'; readonly version: number }
  | { readonly kind: 'damaged'; readonly setAsideAs: string };

/** How long a store waits after its last change before it writes (data.md, "How it is written"). */
export const writeDelayMs = 300;

/** How long a rename is tried again when another program holds the file on Windows. */
const renameRetryMs = 1000;

/** A stored file opened from a data folder: its content, kept in memory, and written back when it changes. */
export class Store<T> {
  private value: T;
  private found: Found = { kind: 'missing' };
  private timer: ReturnType<typeof setTimeout> | undefined;
  private writing: Promise<void> = Promise.resolve();
  private readonly fullPath: string;

  /** Opens nothing yet: {@link load} reads the file. */
  constructor(
    private readonly folder: string,
    private readonly kind: StoredFile<T>,
    private readonly onWriteError: (error: unknown) => void = () => undefined,
  ) {
    this.value = kind.empty();
    this.fullPath = join(folder, ...kind.path.split('/'));
  }

  /** Reads the file, migrating or setting it aside as data.md says, and tells how it was found. */
  async load(now: Date = new Date()): Promise<Found> {
    let text: string;
    try {
      text = await readFile(this.fullPath, 'utf8');
    } catch (error: unknown) {
      if (isMissing(error)) {
        this.found = { kind: 'missing' };
        this.value = this.kind.empty();
        return this.found;
      }
      throw error;
    }
    this.found = await this.understand(text, now);
    return this.found;
  }

  /** The content in memory. */
  get(): T {
    return this.value;
  }

  /** How the file was found, which decides whether it may be written. */
  status(): Found {
    return this.found;
  }

  /** Whether changes can be saved: never to a file of a newer version (R15.3). */
  isWritable(): boolean {
    return this.found.kind !== 'newer';
  }

  /** Changes the content and writes it a moment later. Refused for a file of a newer version. */
  set(value: T): boolean {
    if (!this.isWritable()) {
      return false;
    }
    this.value = value;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.queueWrite();
    }, writeDelayMs);
    return true;
  }

  /** Writes now what is waiting to be written, and waits for every write in progress: at quit. */
  async flush(): Promise<void> {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
      await this.queueWrite();
    }
    await this.writing;
  }

  private async understand(text: string, now: Date): Promise<Found> {
    const object = parseObject(text);
    const version = object?.['version'];
    if (object === undefined || typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
      return this.setAside(now);
    }
    if (version > this.kind.version) {
      this.value = this.readOrEmpty(object);
      return { kind: 'newer', version };
    }
    try {
      this.value = this.kind.read(this.migrate(object, version));
    } catch {
      return this.setAside(now);
    }
    if (version < this.kind.version) {
      await copyFile(this.fullPath, `${this.fullPath.replace(/\.json$/, '')}.v${String(version)}.bak`);
      return { kind: 'older', version };
    }
    return { kind: 'current' };
  }

  private migrate(object: JsonObject, from: number): JsonObject {
    let current = object;
    for (let version = from; version < this.kind.version; version += 1) {
      const migration = this.kind.migrations[version];
      if (migration === undefined) {
        throw new Error(`${this.kind.path} has no migration from version ${String(version)}.`);
      }
      current = migration(current);
    }
    return current;
  }

  private readOrEmpty(object: JsonObject): T {
    try {
      return this.kind.read(object);
    } catch {
      return this.kind.empty();
    }
  }

  private async setAside(now: Date): Promise<Found> {
    const stamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
    const setAsideAs = `${this.fullPath.replace(/\.json$/, '')}.damaged-${stamp}.json`;
    await rename(this.fullPath, setAsideAs);
    this.value = this.kind.empty();
    return { kind: 'damaged', setAsideAs };
  }

  private queueWrite(): Promise<void> {
    const content = `${JSON.stringify({ version: this.kind.version, ...this.kind.write(this.value) }, null, 2)}\n`;
    this.writing = this.writing
      .then(() => writeAtomically(this.fullPath, content))
      .then(() => {
        if (this.found.kind !== 'newer') {
          this.found = { kind: 'current' };
        }
      })
      .catch(this.onWriteError);
    return this.writing;
  }
}

function parseObject(text: string): JsonObject | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JsonObject) : undefined;
  } catch {
    return undefined;
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT';
}

/** Writes beside, flushes, then renames over the old file (R15.4). */
export async function writeAtomically(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  const handle = await open(temporary, 'w');
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await renameWithRetry(temporary, path);
}

async function renameWithRetry(from: string, to: string): Promise<void> {
  const until = Date.now() + renameRetryMs;
  for (;;) {
    try {
      await rename(from, to);
      return;
    } catch (error: unknown) {
      const code = (error as { code?: unknown }).code;
      if (Date.now() >= until || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

/** Writes a file of the data folder at once, for a file written once (an operation of the undo history). */
export async function writeOnce(folder: string, path: string, content: string | Uint8Array): Promise<void> {
  const fullPath = join(folder, ...path.split('/'));
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(`${fullPath}.tmp`, content);
  await renameWithRetry(`${fullPath}.tmp`, fullPath);
}
