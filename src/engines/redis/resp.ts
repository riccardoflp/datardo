/**
 * RESP2 and RESP3 as the console's own connection writes and reads them (`console.reply`): a command as an array of
 * bulk strings, and each reply with every type kept apart, which node-redis's decoder merges (a simple string and a
 * bulk one, a 64-bit integer and a double). The reader takes the bytes as they arrive and gives each whole reply once,
 * keeping at most 16 MB of the strings of one reply and counting what it received.
 */
import type { TypedReply } from '../../shared/typed-reply';

/** A reply as read, and how many bytes the server sent for it. */
export interface ReadReply {
  readonly reply: TypedReply;
  readonly bytes: number;
}

/** The strings of one reply are kept up to 16 MB (`console.output`, Datardo's choice). */
export const keptReplyBytes = 16 * 1024 * 1024;

const crlf = Buffer.from('\r\n');

/** A command as the server receives it: an array of bulk strings. */
export function encodeCommand(words: readonly Uint8Array[]): Buffer {
  const parts: Buffer[] = [Buffer.from(`*${String(words.length)}\r\n`)];
  for (const word of words) {
    parts.push(Buffer.from(`$${String(word.length)}\r\n`), Buffer.from(word), crlf);
  }
  return Buffer.concat(parts);
}

type ContainerKind = 'array' | 'set' | 'push' | 'map' | 'attribute';

/** An aggregate being read: how many items it needs, and those read. */
interface Frame {
  readonly kind: ContainerKind;
  readonly expected: number;
  readonly items: TypedReply[];
}

/** A string being read whose length is known: its kind, what is kept of it, and how many bytes are still to come. */
interface Bulk {
  readonly kind: 'bulk' | 'error' | 'verbatim';
  readonly kept: Buffer[];
  remaining: number;
}

const decoder = new TextDecoder();

function doubleOf(text: string): number {
  switch (text) {
    case 'inf':
    case '+inf':
      return Infinity;
    case '-inf':
      return -Infinity;
    case 'nan':
      return NaN;
    default:
      return Number(text);
  }
}

function containerReply(frame: Frame): TypedReply {
  switch (frame.kind) {
    case 'array':
    case 'set':
    case 'push':
      return { kind: frame.kind, items: frame.items };
    case 'map':
    case 'attribute': {
      const entries: (readonly [TypedReply, TypedReply])[] = [];
      for (let index = 0; index + 1 < frame.items.length; index += 2) {
        entries.push([frame.items[index] as TypedReply, frame.items[index + 1] as TypedReply]);
      }
      return { kind: 'map', entries };
    }
  }
}

function bulkReply(kind: Bulk['kind'], bytes: Buffer): TypedReply {
  switch (kind) {
    case 'bulk':
      return { kind: 'bulk', bytes: Uint8Array.from(bytes) };
    case 'error':
      return { kind: 'error', message: decoder.decode(bytes) };
    case 'verbatim': {
      const text = decoder.decode(bytes);
      return { kind: 'verbatim', format: text.slice(0, 3), text: text.slice(4) };
    }
  }
}

const containers: Readonly<Record<string, ContainerKind>> = {
  '*': 'array',
  '~': 'set',
  '>': 'push',
  '%': 'map',
  '|': 'attribute',
};

const bulks: Readonly<Record<string, Bulk['kind']>> = { $: 'bulk', '!': 'error', '=': 'verbatim' };

/** Reads replies from the bytes of a connection, as they arrive. */
export class RespReader {
  private buffer: Buffer = Buffer.alloc(0);
  private readonly stack: Frame[] = [];
  private bulk: Bulk | undefined;
  /** Bytes received for the reply being read, and bytes of its strings kept. */
  private received = 0;
  private kept = 0;
  private readonly done: ReadReply[] = [];

  /** Takes the bytes that arrived and gives the replies they complete, in order. */
  push(chunk: Uint8Array): readonly ReadReply[] {
    this.buffer = this.buffer.length === 0 ? Buffer.from(chunk) : Buffer.concat([this.buffer, chunk]);
    let offset = 0;
    for (;;) {
      const next = this.bulk === undefined ? this.readLine(offset) : this.readBulk(offset);
      if (next === undefined) {
        break;
      }
      offset = next;
    }
    this.received += offset;
    this.buffer = this.buffer.subarray(offset);
    return this.done.splice(0);
  }

  /** Reads what is left of the string being read; the offset after it, or undefined when more bytes are needed. */
  private readBulk(offset: number): number | undefined {
    const bulk = this.bulk as Bulk;
    if (bulk.remaining > 0) {
      const taken = Math.min(bulk.remaining, this.buffer.length - offset);
      if (taken === 0) {
        return undefined;
      }
      const room = Math.max(0, keptReplyBytes - this.kept);
      const keep = Math.min(room, taken);
      if (keep > 0) {
        bulk.kept.push(Buffer.from(this.buffer.subarray(offset, offset + keep)));
        this.kept += keep;
      }
      bulk.remaining -= taken;
      return offset + taken;
    }
    if (this.buffer.length - offset < 2) {
      return undefined;
    }
    this.bulk = undefined;
    this.deliver(bulkReply(bulk.kind, Buffer.concat(bulk.kept)), offset + 2);
    return offset + 2;
  }

  /** Reads one line of a type; the offset after it, or undefined when its end has not arrived. */
  private readLine(offset: number): number | undefined {
    const end = this.buffer.indexOf(crlf, offset);
    if (end < 0) {
      return undefined;
    }
    const type = String.fromCharCode(this.buffer[offset] ?? 0);
    const text = this.buffer.toString('utf8', offset + 1, end);
    const after = end + 2;
    this.readType(type, text, after);
    return after;
  }

  private readType(type: string, text: string, after: number): void {
    const container = containers[type];
    if (container !== undefined) {
      const count = Number(text);
      if (count < 0) {
        this.deliver({ kind: 'null' }, after);
        return;
      }
      const expected = container === 'map' || container === 'attribute' ? count * 2 : count;
      this.stack.push({ kind: container, expected, items: [] });
      this.completeFrames(after);
      return;
    }
    const bulk = bulks[type];
    if (bulk !== undefined) {
      const length = Number(text);
      if (length < 0) {
        this.deliver({ kind: 'null' }, after);
      } else {
        this.bulk = { kind: bulk, kept: [], remaining: length };
      }
      return;
    }
    this.deliver(this.scalar(type, text), after);
  }

  private scalar(type: string, text: string): TypedReply {
    switch (type) {
      case '+':
        return { kind: 'simple', text };
      case '-':
        return { kind: 'error', message: text };
      case ':':
        return { kind: 'integer', value: BigInt(text) };
      case '_':
        return { kind: 'null' };
      case '#':
        return { kind: 'boolean', value: text === 't' };
      case ',':
        return { kind: 'double', value: doubleOf(text) };
      case '(':
        return { kind: 'big-number', digits: text };
      default:
        throw new Error(`The server sent a reply of an unknown type: ${type}`);
    }
  }

  /** Adds a value to the aggregate being read, or gives it as a whole reply. */
  private deliver(value: TypedReply, after: number): void {
    const top = this.stack[this.stack.length - 1];
    if (top === undefined) {
      this.done.push({ reply: value, bytes: this.received + after });
      this.received = -after;
      this.kept = 0;
      return;
    }
    top.items.push(value);
    this.completeFrames(after);
  }

  /** Closes the aggregates that have all their items; an attribute is read and left out, as RESP3 allows. */
  private completeFrames(after: number): void {
    const top = this.stack[this.stack.length - 1];
    if (top === undefined || top.items.length < top.expected) {
      return;
    }
    this.stack.pop();
    if (top.kind !== 'attribute') {
      this.deliver(containerReply(top), after);
    }
  }
}
