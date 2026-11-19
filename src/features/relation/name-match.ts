/**
 * Feature: relation.name-match
 *
 * Whether the name of a field points to a collection by name, as `customerId` points to `customers`: the test that
 * lets a string or a number be looked up as a reference.
 */

function squeezed(name: string): string {
  return name.replace(/[_\-\s]/gu, '').toLowerCase();
}

/** The last name of a dotted path or a namespace: `customerId` of `billing.customerId`. */
export function lastName(path: string): string {
  return path.slice(path.lastIndexOf('.') + 1);
}

/** The stem of a field's name: its ending `id`, `ids`, `ref`, `refs`, `key` or `keys` removed once, squeezed. */
export function stem(name: string): string {
  return squeezed(name.replace(/(?:_?ids?|_?refs?|_?keys?)$/iu, ''));
}

/** The singular of a name, squeezed: `people` is `person`, `categories` `category`, `boxes` `box`. */
export function singular(name: string): string {
  const squeezedName = squeezed(name);
  if (squeezedName === 'people') {
    return 'person';
  }
  if (squeezedName.endsWith('ies')) {
    return `${squeezedName.slice(0, -3)}y`;
  }
  if (/(?:ss|sh|ch|x|z)es$/u.test(squeezedName)) {
    return squeezedName.slice(0, -2);
  }
  return squeezedName.endsWith('s') && !squeezedName.endsWith('ss') ? squeezedName.slice(0, -1) : squeezedName;
}

/** Feature: relation.name-match — whether the field is named after the collection. */
export function namesMatch(field: string, collection: string): boolean {
  const fieldStem = stem(lastName(field));
  if (fieldStem === '') {
    return false;
  }
  const name = lastName(collection);
  const collectionSingular = singular(name);
  return fieldStem === collectionSingular || fieldStem === squeezed(name) || singular(fieldStem) === collectionSingular;
}
