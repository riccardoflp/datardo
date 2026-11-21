/**
 * Feature: server.config
 *
 * The Configuration section of the Server page: the parameters of the server as a table with a filter. In the first
 * release it only reads: no control edits, on any connection, and the notice says to use `CONFIG SET` in the console.
 * The filter looks in the value as shown, so a secret is never found by its real value.
 */
import type { ConnectionId } from '../../shared/ids';
import type { ConfigParameter } from './read-config';
import { text } from './text';
import {
  clockText,
  connectionTarget,
  holdsWithoutCase,
  sentenceOf,
  startControl,
  valueOf,
  type Inspection,
  type PartRead,
  type ServerControl,
} from './types';

/** How a value is shown: as written, *empty* (dimmed), `***` with its tooltip, or *not set* for an empty secret. */
export type ConfigValueLook = 'text' | 'empty' | 'hidden' | 'not-set';

/** A row of the table. */
export interface ConfigRow {
  readonly name: string;
  readonly value: string;
  readonly look: ConfigValueLook;
  readonly tooltip?: string;
  readonly selected: boolean;
  /** **Copy parameter**, **Copy value**: the context menu of the row. */
  readonly menu: readonly ServerControl[];
}

/** What the Configuration section is drawn from. */
export interface ConfigState {
  readonly connection: ConnectionId;
  readonly parameters?: PartRead<readonly ConfigParameter[]>;
  readonly readAt?: number;
  readonly filter: string;
  readonly selected?: string;
}

/** What the Configuration section shows. */
export interface ConfigView {
  readonly toolbar: {
    readonly filter: { readonly placeholder: string; readonly value: string };
    readonly count?: string;
  };
  readonly notice: { readonly text: string; readonly openConsole: ServerControl };
  readonly error?: string;
  readonly table?: { readonly columns: typeof text.config.columns; readonly rows: readonly ConfigRow[] };
  readonly noMatch?: string;
  /** The parameter selected, for the inspector island: its name and its value as the row shows it. */
  readonly inspector?: Inspection;
}

/** The value as the row shows it, and how. */
export function shownValue(parameter: ConfigParameter): Pick<ConfigRow, 'value' | 'look' | 'tooltip'> {
  if (parameter.secret) {
    return parameter.value === ''
      ? { value: text.config.notSet, look: 'not-set' }
      : { value: parameter.value, look: 'hidden', tooltip: text.config.hidden };
  }
  return parameter.value === ''
    ? { value: text.config.empty, look: 'empty' }
    : { value: parameter.value, look: 'text' };
}

/** Whether a parameter is shown with the filter: in its name or in its value as shown, without case. */
export function isParameterShown(parameter: ConfigParameter, filter: string): boolean {
  const needle = filter.trim();
  return (
    needle === '' || holdsWithoutCase(parameter.name, needle) || holdsWithoutCase(shownValue(parameter).value, needle)
  );
}

function row(parameter: ConfigParameter, selected: string | undefined): ConfigRow {
  return {
    name: parameter.name,
    ...shownValue(parameter),
    selected: parameter.name === selected,
    menu: [
      { kind: 'copy', label: text.config.copyParameter, text: parameter.name },
      { kind: 'copy', label: text.config.copyValue, text: parameter.value },
    ],
  };
}

/** Feature: server.config — what the Configuration section shows. */
export function view(state: ConfigState): ConfigView {
  const error = sentenceOf(state.parameters);
  const parameters = valueOf(state.parameters);
  const shown = (parameters ?? []).filter((parameter) => isParameterShown(parameter, state.filter));
  const counted = parameters !== undefined && state.readAt !== undefined;
  const selected = parameters?.find((parameter) => parameter.name === state.selected);
  return {
    toolbar: {
      filter: { placeholder: text.config.filter, value: state.filter },
      ...(counted ? { count: text.config.count(shown.length, parameters.length, clockText(state.readAt ?? 0)) } : {}),
    },
    notice: {
      text: text.config.notice,
      openConsole: startControl(text.config.openConsole, undefined, 'console.show', {
        target: connectionTarget(state.connection),
      }),
    },
    ...(error === undefined ? {} : { error }),
    ...(parameters === undefined
      ? {}
      : { table: { columns: text.config.columns, rows: shown.map((parameter) => row(parameter, state.selected)) } }),
    ...(parameters !== undefined && parameters.length > 0 && shown.length === 0
      ? { noMatch: text.config.noMatch }
      : {}),
    ...(selected === undefined ? {} : { inspector: inspection(selected) }),
  };
}

function inspection(parameter: ConfigParameter): Inspection {
  return {
    title: parameter.name,
    fields: [
      [text.config.columns.parameter, parameter.name],
      [text.config.columns.value, shownValue(parameter).value],
    ],
  };
}
