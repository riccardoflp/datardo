/**
 * How the Index advisor writes durations, how long ago, sizes and the label of an index (`advisor.show`, "Times and
 * durations"), and the controls its page returns.
 */
import type { Json } from '../../../shared/engine-request';
import type { Target } from '../../../shared/target';
import { groupThousands } from '../../../shared/text-units';
import { indexKeyText } from '../../monitor/types';
import { text } from '../text';
import type { AdvisorIndex } from '../types';

/** A duration: whole seconds from 10,000 ms (`12 s`), seconds with one decimal from 1,000 ms (`4.2 s`), else `350 ms`. */
export function durationText(milliseconds: number): string {
  if (milliseconds >= 10_000) {
    return `${groupThousands(Math.round(milliseconds / 1000))} s`;
  }
  if (milliseconds >= 1000) {
    return `${(milliseconds / 1000).toFixed(1)} s`;
  }
  return `${groupThousands(Math.round(milliseconds))} ms`;
}

/** How long ago: *a minute ago* under 90 seconds, then minutes under 90 minutes, hours under 36 hours, then days. */
export function agoText(milliseconds: number): string {
  const seconds = Math.max(0, milliseconds) / 1000;
  if (seconds < 90) {
    return text.ago.minute;
  }
  if (seconds < 90 * 60) {
    return text.ago.minutes(Math.round(seconds / 60));
  }
  if (seconds < 36 * 3600) {
    return text.ago.hours(Math.round(seconds / 3600));
  }
  return text.ago.days(Math.round(seconds / 86_400));
}

/** The marks of an index that apply: `unique · sparse · partial · collation fr · hidden`. */
export function indexMarks(index: AdvisorIndex): string {
  return [
    index.unique ? 'unique' : '',
    index.sparse ? 'sparse' : '',
    index.partialFilterExpression === undefined ? '' : 'partial',
    index.collation === undefined ? '' : `collation ${index.collation}`,
    index.hidden ? 'hidden' : '',
  ]
    .filter((mark) => mark !== '')
    .join(' · ');
}

/** An index as the page names it: `status_1_createdAt_-1 { status: 1, createdAt: -1 }`. */
export function indexLabel(index: AdvisorIndex): string {
  return `${index.name} ${indexKeyText(index.key)}`;
}

/** A control of the page: a feature it starts, a text it copies, or a list it shows whole or in part. */
export type AdvisorControl =
  | {
      readonly kind: 'start';
      readonly label: string;
      /** The control's identifier, written whole, when the card of the feature it starts lists its place here. */
      readonly element?: string;
      readonly feature: string;
      readonly target: Target;
      readonly args: Json;
      readonly tooltip?: string;
      readonly enabled: boolean;
    }
  | { readonly kind: 'copy'; readonly label: string; readonly tooltip: string; readonly text: string }
  | { readonly kind: 'toggle'; readonly label: string; readonly advice: string };

/** What a control that starts a feature is given. */
export interface StartGiven {
  readonly label: string;
  readonly element?: string;
  readonly feature: string;
  readonly target: Target;
  readonly args: Json;
  readonly tooltip?: string;
  /** On a read-only connection: disabled, with *The connection is read-only* as tooltip. */
  readonly readOnly?: boolean;
}

/** A control that starts a feature. */
export function startControl(given: StartGiven): AdvisorControl {
  const tooltip = given.readOnly === true ? text.readOnlyTooltip : given.tooltip;
  return {
    kind: 'start',
    label: given.label,
    ...(given.element === undefined ? {} : { element: given.element }),
    feature: given.feature,
    target: given.target,
    args: given.args,
    ...(tooltip === undefined ? {} : { tooltip }),
    enabled: given.readOnly !== true,
  };
}
