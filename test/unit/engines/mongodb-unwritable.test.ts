/**
 * The two values the driver would change on a write, a BSON undefined and a date beyond the range of JavaScript: a
 * write carrying one fails before anything is sent, and a read is never stopped.
 */
import { describe, expect, it } from 'vitest';
import { EngineError } from '../../../src/engines/engine';
import { checkWritable } from '../../../src/engines/mongodb/unwritable';

describe('the values the driver cannot write', () => {
  it('stops a write of a BSON undefined, and says where it is', () => {
    expect(() => {
      checkWritable('replaceOne', [{ _id: 1 }, { _id: 1, a: { b: [1, { $undefined: true }] } }]);
    }).toThrow(
      new EngineError(
        'Datardo cannot write a BSON undefined at a.b.1: the driver would change its type, so nothing was sent.',
      ),
    );
  });

  it('stops a write of a date beyond the range of JavaScript, and lets the dates within it pass', () => {
    const far = { $date: { $numberLong: '253402300800000000' } };
    expect(() => {
      checkWritable('insertOne', [{ at: far }]);
    }).toThrow('Datardo cannot write a date beyond the range of JavaScript at at');
    expect(() => {
      checkWritable('insertOne', [{ at: { $date: { $numberLong: '8640000000000000' } } }]);
    }).not.toThrow();
  });

  it('never stops a read', () => {
    expect(() => {
      checkWritable('find', [{ a: { $undefined: true } }]);
    }).not.toThrow();
  });
});
