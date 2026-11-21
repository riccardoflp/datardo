/**
 * The facts of an error of MongoDB beyond its message and code, that the main process acts on: the name of its code,
 * its error labels (a transaction tried again on `TransientTransactionError`, a commit on
 * `UnknownTransactionCommitResult`), and the operations of an `insertMany` or a `bulkWrite` that failed. None of these
 * holds a secret; the message is masked before.
 */
import { MongoBulkWriteError, MongoError, MongoServerError } from 'mongodb';
import { EngineError } from '../engine';
import { plainNumber } from './mongosh-forms';

/** What a {@link MongoEngineError} says besides its message and code. */
export interface MongoErrorFacts {
  readonly code: string | number | undefined;
  readonly codeName: string | undefined;
  readonly labels: readonly string[];
  /** The indexes of the operations of an `insertMany` or a `bulkWrite` that failed, in order. */
  readonly failedOperations: readonly number[];
  /** The code of each operation that failed, in the order of `failedOperations`: 11000 for an `_id` that exists. */
  readonly failedCodes: readonly number[];
}

/** An error of MongoDB, its message without secrets, with the facts the main process acts on. */
export class MongoEngineError extends EngineError {
  readonly codeName: string | undefined;
  readonly labels: readonly string[];
  readonly failedOperations: readonly number[];
  readonly failedCodes: readonly number[];

  /** An error with a message that holds no secret. */
  constructor(message: string, facts: MongoErrorFacts) {
    super(message, facts.code);
    this.name = 'MongoEngineError';
    this.codeName = facts.codeName;
    this.labels = facts.labels;
    this.failedOperations = facts.failedOperations;
    this.failedCodes = facts.failedCodes;
  }
}

function writeErrorsOf(error: MongoError): readonly { readonly index: unknown; readonly code: unknown }[] {
  return error instanceof MongoBulkWriteError ? [error.writeErrors].flat() : [];
}

function failedOperations(error: MongoError): readonly number[] {
  return writeErrorsOf(error).map((each) => Number(plainNumber(each.index)));
}

function failedCodes(error: MongoError): readonly number[] {
  return writeErrorsOf(error).map((each) => Number(plainNumber(each.code)));
}

/** The code as a number: a client that reads values without promoting them gets it as an Int32. */
function codeOf(masked: EngineError, error: MongoError): string | number | undefined {
  const code = plainNumber(error.code);
  return typeof code === 'number' || typeof code === 'string' ? code : masked.code;
}

/** The masked error with the facts of the driver's error, when it is one of MongoDB; otherwise the masked error. */
export function withMongoFacts(masked: EngineError, error: unknown): EngineError {
  if (!(error instanceof MongoError)) {
    return masked;
  }
  const facts: MongoErrorFacts = {
    code: codeOf(masked, error),
    codeName: error instanceof MongoServerError ? error.codeName : undefined,
    labels: error.errorLabels,
    failedOperations: failedOperations(error),
    failedCodes: failedCodes(error),
  };
  return new MongoEngineError(masked.message, facts);
}
