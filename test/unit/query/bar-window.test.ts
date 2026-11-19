/**
 * The pure helpers of the query bar in the window (`query.bar`, `query.drag`): the name a control says, and what the
 * data of a drag stands for.
 */
import { describe, expect, it } from 'vitest';
import { draggedOfText } from '../../../src/ui/query/drag-data';
import { spokenName } from '../../../src/ui/query/spoken-name';

describe('query.bar names its controls with the text they show', () => {
  it('keeps a name that holds the text, and adds the text to one that does not', () => {
    expect(spokenName('Builder', 'Builder')).toBe('Builder');
    expect(spokenName('Run query', 'Find')).toBe('Run query, Find');
    expect(spokenName('Query mode', 'Find')).toBe('Query mode, Find');
  });
});

describe('query.drag reads what the table drags', () => {
  it('reads a cell with its value and the array it is in, and a header', () => {
    expect(draggedOfText('{"kind":"cell","field":"status","value":"paid"}')).toEqual({
      kind: 'cell',
      field: 'status',
      value: 'paid',
    });
    expect(draggedOfText('{"kind":"cell","field":"items.sku","value":null,"within":"items"}')).toEqual({
      kind: 'cell',
      field: 'items.sku',
      value: null,
      within: 'items',
    });
    expect(draggedOfText('{"kind":"header","field":"createdAt"}')).toEqual({ kind: 'header', field: 'createdAt' });
  });

  it('reads nothing from data that is not a cell or a header of the table', () => {
    expect(draggedOfText('not json')).toBeUndefined();
    expect(draggedOfText('{"kind":"cell","field":"status"}')).toBeUndefined();
    expect(draggedOfText('{"kind":"header","field":""}')).toBeUndefined();
    expect(draggedOfText('[1]')).toBeUndefined();
  });
});
