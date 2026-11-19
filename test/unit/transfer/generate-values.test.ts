import { BSON } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { analyzeSample } from '../../../src/features/transfer/generate/sample';
import {
  documentGenerator,
  generateDocuments,
  newObjectIds,
  nextDocument,
  seededRandom,
  type GenerateOptions,
} from '../../../src/features/transfer/generate-values';
import type { JsonDocument } from '../../../src/features/transfer/types';

const now = Date.UTC(2026, 10, 19, 12, 0, 0);
const options: GenerateOptions = { seed: '42', now };
const int = (value: number) => ({ $numberInt: String(value) });

function analysisOf(documents: readonly JsonDocument[]) {
  return analyzeSample(documents);
}

function share(documents: readonly JsonDocument[], test: (document: JsonDocument) => boolean): number {
  return documents.filter(test).length / documents.length;
}

describe('transfer.generate-values', () => {
  it('counts integer _ids up from the largest analyzed, or from nextId; an int beyond 32 bits is a long', () => {
    const analysis = analysisOf([{ _id: int(1) }, { _id: int(7) }, { _id: int(3) }]);
    expect(generateDocuments(analysis, 3, options).map((document) => document['_id'])).toEqual([
      int(8),
      int(9),
      int(10),
    ]);
    expect(generateDocuments(analysis, 2, { ...options, nextId: 100 }).map((document) => document['_id'])).toEqual([
      int(100),
      int(101),
    ]);
    expect(generateDocuments(analysis, 1, { ...options, nextId: 2 ** 31 })[0]?.['_id']).toEqual({
      $numberLong: '2147483648',
    });
  });

  it('makes 300 different string _ids shaped like ORD-1000, ORD-1007…', () => {
    const analysis = analysisOf(Array.from({ length: 50 }, (_, index) => ({ _id: `ORD-${String(1000 + index * 7)}` })));
    const ids = generateDocuments(analysis, 300, options).map((document) => document['_id']);
    expect(new Set(ids).size).toBe(300);
    expect(ids.every((id) => typeof id === 'string' && /^ORD-\d{4}$/u.test(id))).toBe(true);
  });

  it('uses the few values seen, in about the same shares', () => {
    const statuses = [
      ...Array<string>(60).fill('active'),
      ...Array<string>(30).fill('pending'),
      ...Array<string>(10).fill('closed'),
    ];
    const documents = generateDocuments(analysisOf(statuses.map((status) => ({ status }))), 3000, options);
    expect(share(documents, (document) => document['status'] === 'active')).toBeCloseTo(0.6, 1);
    expect(share(documents, (document) => document['status'] === 'pending')).toBeCloseTo(0.3, 1);
    expect(share(documents, (document) => document['status'] === 'closed')).toBeCloseTo(0.1, 1);
  });

  it('ends every email with the domain seen', () => {
    const names = ['ada', 'lin', 'joe', 'kim', 'max', 'sam', 'tom', 'eva'];
    const analysis = analysisOf(names.map((name) => ({ email: `${name}@example.org` })));
    const emails = generateDocuments(analysis, 200, options).map((document) => document['email']);
    expect(emails.every((email) => typeof email === 'string' && email.endsWith('@example.org'))).toBe(true);
  });

  it('draws Doubles with at most 2 decimals between 1 and 99', () => {
    const prices = Array.from({ length: 80 }, (_, index) => ({
      price: { $numberDouble: (1 + index * 1.2375).toFixed(2) },
    }));
    const documents = generateDocuments(analysisOf(prices), 500, options);
    for (const document of documents) {
      const price = document['price'] as { $numberDouble: string };
      expect(Number(price.$numberDouble)).toBeGreaterThanOrEqual(1);
      expect(Number(price.$numberDouble)).toBeLessThanOrEqual(99);
      expect(price.$numberDouble).toMatch(/^\d+\.\d{1,2}$/u);
    }
  });

  it('gives an Int32 field seen in half of the documents to about half', () => {
    const analysis = analysisOf(
      Array.from({ length: 100 }, (_, index) => (index % 2 === 0 ? { qty: int(index) } : {})),
    );
    const documents = generateDocuments(analysis, 2000, options);
    expect(share(documents, (document) => 'qty' in document)).toBeCloseTo(0.5, 1);
    expect(
      documents
        .filter((document) => 'qty' in document)
        .every((document) => '$numberInt' in (document['qty'] as object)),
    ).toBe(true);
  });

  it('gives an empty analysis documents with only an ObjectId _id created at now', () => {
    const [document] = generateDocuments({ sampled: 0, fields: [] }, 1, options);
    const oid = (document?.['_id'] as { $oid: string }).$oid;
    expect(Object.keys(document ?? {})).toEqual(['_id']);
    expect(parseInt(oid.slice(0, 8), 16)).toBe(Math.floor(now / 1000));
  });

  it('gives the same documents for the same analysis, seed and now, others for another seed', () => {
    const analysis = analysisOf([
      { name: 'Ada Smith', n: int(3) },
      { name: 'Lin Chen', n: int(9) },
    ]);
    expect(generateDocuments(analysis, 20, options)).toEqual(generateDocuments(analysis, 20, options));
    expect(generateDocuments(analysis, 20, options)).not.toEqual(
      generateDocuments(analysis, 20, { ...options, seed: '43' }),
    );
    const generator = documentGenerator(analysis, options);
    expect([nextDocument(generator), nextDocument(generator)]).toEqual(generateDocuments(analysis, 2, options));
  });

  it('gives valid canonical Extended JSON, _id first', () => {
    const analysis = analysisOf([
      {
        _id: { $oid: '64b000000000000000000001' },
        at: { $date: { $numberLong: '1700000000000' } },
        tags: ['a', 'b'],
        sub: { x: int(1) },
      },
      {
        _id: { $oid: '64b000000000000000000002' },
        at: { $date: { $numberLong: '1700000500000' } },
        tags: [],
        n: { $numberLong: '5' },
      },
    ]);
    for (const document of generateDocuments(analysis, 50, options)) {
      expect(Object.keys(document)[0]).toBe('_id');
      expect(() => {
        BSON.EJSON.parse(JSON.stringify(document), { relaxed: false });
      }).not.toThrow();
    }
  });

  it('gives a field seen as Int32 in 70% and string in 30% about those shares', () => {
    const documents = Array.from({ length: 100 }, (_, index) => ({
      v: index < 70 ? int(index) : `s${String(index)} text`,
    }));
    const generated = generateDocuments(analysisOf(documents), 3000, options);
    expect(share(generated, (document) => typeof document['v'] === 'object')).toBeCloseTo(0.7, 1);
  });

  it('keeps dates at UTC midnight when every date seen was', () => {
    const day = 86_400_000;
    const analysis = analysisOf(
      Array.from({ length: 60 }, (_, index) => ({
        on: { $date: { $numberLong: String(1_700_006_400_000 - (1_700_006_400_000 % day) + index * day) } },
      })),
    );
    for (const document of generateDocuments(analysis, 100, options)) {
      expect(Number((document['on'] as { $date: { $numberLong: string } }).$date.$numberLong) % day).toBe(0);
    }
  });

  it('makes a 16-byte binary of subtype 4 a version-4 UUID', () => {
    const uuid = { $binary: { base64: 'ABEiM0RVZneImaq7zN3u/w==', subType: '04' } };
    const analysis = analysisOf(
      Array.from({ length: 60 }, () => ({ ref: uuid })).map((document, index) =>
        index === 0
          ? document
          : {
              ref: {
                $binary: {
                  base64: Buffer.from(Array.from({ length: 16 }, (_, at) => (at * index) % 256)).toString('base64'),
                  subType: '04',
                },
              },
            },
      ),
    );
    for (const document of generateDocuments(analysis, 20, options)) {
      const bytes = Buffer.from((document['ref'] as typeof uuid).$binary.base64, 'base64');
      expect(bytes).toHaveLength(16);
      expect(bytes[6]! >> 4).toBe(4);
      expect(bytes[8]! >> 6).toBe(2);
    }
  });

  it('does not repeat string _ids among 300 documents', () => {
    const analysis = analysisOf(['alpha', 'beta', 'gamma', 'delta', 'omega'].map((name) => ({ _id: name })));
    const ids = generateDocuments(analysis, 300, options).map((document) => JSON.stringify(document['_id']));
    expect(new Set(ids).size).toBeGreaterThan(290);
  });

  it('draws numbers in [0, 1) from a seed, the same for the same seed', () => {
    const one = seededRandom('x');
    const other = seededRandom('x');
    const drawn = Array.from({ length: 5 }, () => one());
    expect(drawn).toEqual(Array.from({ length: 5 }, () => other()));
    expect(drawn.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it('gives an import new ObjectIds, all different, at now', () => {
    const ids = newObjectIds(1000, now, 'orders.jsonl') as { $oid: string }[];
    expect(new Set(ids.map((id) => id.$oid)).size).toBe(1000);
    expect(
      ids.every(
        (id) => /^[0-9a-f]{24}$/u.test(id.$oid) && parseInt(id.$oid.slice(0, 8), 16) === Math.floor(now / 1000),
      ),
    ).toBe(true);
  });
});
