/**
 * `db` and the collections of a script (`playground.runtime`). Any name of `db` that is not one of its methods is the
 * collection of that name (`db.orders`, `db["order-items"]`), and any name of a collection that is not one of its
 * methods is the collection with the dotted name (`db.logs.archive`). Each method that reaches the database is a call
 * to the main process, which checks it (`playground.writes`) and answers it; `find` and `aggregate` give a cursor.
 */
import type { Json } from '../../shared/engine-request';
import { dottedCollection, isCollectionMethod, isDatabaseMethod } from '../../features/playground/runtime';
import { jsonArguments, scriptError, type ScriptEnvironment } from './environment';
import { explained, scriptCursor, type CursorOrigin } from './script-cursor';

type Method = (...args: unknown[]) => unknown;

/** The names an object of the runtime answers as an object of the language, never as a collection. */
function languageName(key: string | symbol): boolean {
  return typeof key === 'symbol' || key === 'then' || key === 'toJSON' || key === 'constructor' || key === 'inspect';
}

/** The pipeline of `aggregate`: an array of stages, or the stages as separate arguments, then the options. */
function aggregateArguments(environment: ScriptEnvironment, args: readonly unknown[]): Json[] {
  const [first, options] = args;
  if (Array.isArray(first)) {
    return jsonArguments([first, options], environment.json);
  }
  return [jsonArguments(args, environment.json)];
}

function nameArgument(environment: ScriptEnvironment, method: string, name: unknown): string {
  if (typeof name !== 'string' || name === '') {
    throw scriptError(`${method}(): the name is a string`, environment.line());
  }
  return name;
}

interface Place {
  readonly database: string;
  readonly session?: number;
}

function sessionPart(place: Place): { readonly session?: number } {
  return place.session === undefined ? {} : { session: place.session };
}

/** `db.orders.explain()`: its `find` and `aggregate` give the explain with `executionStats`. */
function explainable(environment: ScriptEnvironment, place: Place, collection: string): object {
  const origin = (of: CursorOrigin['of'], args: Json[]): CursorOrigin => ({
    of,
    database: place.database,
    collection,
    arguments: args,
    ...sessionPart(place),
  });
  const value = {
    find: (...args: unknown[]) => explained(environment, origin('find', jsonArguments(args, environment.json))),
    aggregate: (...args: unknown[]) =>
      explained(environment, origin('aggregate', aggregateArguments(environment, args))),
    toString: () => `Explainable(${place.database}.${collection})`,
  };
  environment.kinds.set(value, { kind: 'explainable' });
  return value;
}

function collectionMethod(environment: ScriptEnvironment, place: Place, name: string, method: string): Method {
  const cursor = (of: CursorOrigin['of'], args: Json[]): object =>
    scriptCursor(environment, {
      of,
      database: place.database,
      collection: name,
      arguments: args,
      ...sessionPart(place),
    });
  switch (method) {
    case 'getName':
      return () => name;
    case 'getFullName':
      return () => `${place.database}.${name}`;
    case 'find':
      return (...args) => cursor('find', jsonArguments(args, environment.json));
    case 'aggregate':
      return (...args) => cursor('aggregate', aggregateArguments(environment, args));
    case 'explain':
      return () => explainable(environment, place, name);
    default:
      return (...args) =>
        environment.send({
          on: 'collection',
          database: place.database,
          collection: name,
          method,
          arguments: jsonArguments(args, environment.json),
          ...sessionPart(place),
        });
  }
}

/** The collection `name` of a database of the script. */
export function scriptCollection(environment: ScriptEnvironment, place: Place, name: string): object {
  const methods = new Map<string, Method>();
  const target = {};
  const collection: object = new Proxy(target, {
    get(_target, key) {
      if (key === 'toString') {
        return () => `${place.database}.${name}`;
      }
      if (languageName(key)) {
        return undefined;
      }
      const word = String(key);
      if (!isCollectionMethod(word)) {
        return scriptCollection(environment, place, dottedCollection(name, word));
      }
      const known = methods.get(word) ?? collectionMethod(environment, place, name, word);
      methods.set(word, known);
      return known;
    },
    has: (_target, key) => typeof key === 'string' && isCollectionMethod(key),
  });
  environment.kinds.set(collection, { kind: 'collection', database: place.database, name });
  return collection;
}

function databaseMethod(environment: ScriptEnvironment, place: Place, method: string): Method {
  switch (method) {
    case 'getName':
      return () => place.database;
    case 'getCollection':
      return (name) => scriptCollection(environment, place, nameArgument(environment, 'getCollection', name));
    case 'getSiblingDB':
      return (name) =>
        scriptDatabase(environment, { ...place, database: nameArgument(environment, 'getSiblingDB', name) });
    case 'getMongo':
      return () => environment.objects.mongo();
    case 'getSession':
      return () => (place.session === undefined ? undefined : environment.objects.session(place.session));
    case 'aggregate':
      return (...args) =>
        scriptCursor(environment, {
          of: 'aggregate',
          database: place.database,
          arguments: aggregateArguments(environment, args),
          ...sessionPart(place),
        });
    default:
      return (...args) =>
        environment.send({
          on: 'database',
          database: place.database,
          method,
          arguments: jsonArguments(args, environment.json),
          ...sessionPart(place),
        });
  }
}

/** A database of the script: `db`, `db.getSiblingDB("archive")`, or one of a session, whose calls run in it. */
export function scriptDatabase(environment: ScriptEnvironment, place: Place): object {
  const inSession = place.session !== undefined;
  const methods = new Map<string, Method>();
  const database: object = new Proxy(
    {},
    {
      get(_target, key) {
        if (key === 'toString') {
          return () => place.database;
        }
        if (languageName(key)) {
          return undefined;
        }
        const word = String(key);
        if (!isDatabaseMethod(word, inSession)) {
          return scriptCollection(environment, place, word);
        }
        const known = methods.get(word) ?? databaseMethod(environment, place, word);
        methods.set(word, known);
        return known;
      },
      has: (_target, key) => typeof key === 'string' && isDatabaseMethod(key, inSession),
    },
  );
  environment.kinds.set(database, { kind: 'database', name: place.database });
  return database;
}
