/**
 * The requests a pairing answers, in whichever thread it runs: the start of a comparison, a batch of a side (the bytes
 * of its documents as stored, read here with their BSON types, R5.5), the result, and the end. One session holds one
 * comparison at a time.
 */
import { documentOfBytes } from '../../engines/mongodb/document-bytes';
import {
  addLeft,
  addRight,
  finishPairing,
  startPairing,
  type Pairing,
  type PairingInput,
  type PairingStep,
} from '../../features/compare/pairing/pairing';
import type { CompareResult, Side } from '../../features/compare/types';

/** What is asked of a pairing. */
export type PairingRequest =
  | { readonly kind: 'start'; readonly input: PairingInput }
  | { readonly kind: 'add'; readonly side: Side; readonly documents: readonly Uint8Array[] }
  | { readonly kind: 'finish' }
  | { readonly kind: 'close' };

/** What a pairing answers, one reply for each request, in their order. */
export type PairingReply =
  | { readonly kind: 'started' }
  | { readonly kind: 'step'; readonly step: PairingStep }
  | { readonly kind: 'result'; readonly result: CompareResult }
  | { readonly kind: 'closed' }
  | { readonly kind: 'failed'; readonly message: string };

function answer(pairing: Pairing | undefined, request: Exclude<PairingRequest, { kind: 'start' }>): PairingReply {
  if (request.kind === 'close') {
    return { kind: 'closed' };
  }
  if (pairing === undefined) {
    return { kind: 'failed', message: 'The comparison was not started.' };
  }
  if (request.kind === 'finish') {
    return { kind: 'result', result: finishPairing(pairing) };
  }
  const documents = request.documents.map((bytes) => documentOfBytes(bytes));
  const step = request.side === 'left' ? addLeft(pairing, documents) : addRight(pairing, documents);
  return { kind: 'step', step };
}

/** A session: the function that answers each request with the pairing it keeps. */
export function pairingSession(): (request: PairingRequest) => PairingReply {
  let pairing: Pairing | undefined;
  return (request) => {
    try {
      if (request.kind === 'start') {
        pairing = startPairing(request.input);
        return { kind: 'started' };
      }
      const reply = answer(pairing, request);
      if (request.kind === 'close') {
        pairing = undefined;
      }
      return reply;
    } catch (error: unknown) {
      // A document that cannot be read ends the comparison with its message, in place of the reply.
      return { kind: 'failed', message: error instanceof Error ? error.message : String(error) };
    }
  };
}
