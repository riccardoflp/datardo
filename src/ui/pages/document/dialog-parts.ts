/**
 * What the dialogs of the document area share: reading the `about` of their question, and a text read again a moment
 * after the last key (the count of the insert dialog).
 */
import { useEffect, useState } from 'react';
import type { Json } from '../../../shared/engine-request';
import type { Question } from '../../../shared/question';

/** The `about` of a question, read by name. */
export interface About {
  readonly text: (name: string) => string;
  readonly optional: (name: string) => string | undefined;
  readonly flag: (name: string) => boolean;
  readonly number: (name: string) => number;
}

/** Reads the `about` of a question. */
export function dialogAbout(question: Question): About {
  const about = question.about;
  const fields: Readonly<Record<string, Json>> =
    typeof about === 'object' && about !== null && !Array.isArray(about)
      ? (about as Readonly<Record<string, Json>>)
      : {};
  const optional = (name: string): string | undefined => {
    const value = fields[name];
    return typeof value === 'string' ? value : undefined;
  };
  return {
    text: (name) => optional(name) ?? '',
    optional,
    flag: (name) => fields[name] === true,
    number: (name) => {
      const value = fields[name];
      return typeof value === 'number' ? value : 0;
    },
  };
}

/** What `read` gives of a text, `delayMs` after it last changed; `undefined` before the first time. */
export function useCounted<T>(source: string, read: (source: string) => T, delayMs: number): T | undefined {
  const [counted, setCounted] = useState<T | undefined>(undefined);
  useEffect(() => {
    const timer = setTimeout(() => {
      setCounted(read(source));
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [source, read, delayMs]);
  return counted;
}
