/**
 * What an open field rule of the Formatting view shows (`table.edit-field-rule`): **Field**, **Color**, **As**, then
 * for true and false **Swap colors**, for a scale **Scale**, its color, its two ends and **From this page**, for a
 * color per value **Palette**; and the legend of the page (`table.format-field`), each value with its swatch, its
 * count, its pin mark and, while it is being pinned, the eleven presets and **Unpin**; **Pin a value…**. Also the
 * swatches a field rule's line shows. Each control carries the change it makes.
 */
import { presetColors, type FieldRule, type PresetColor } from '../../../shared/formatting-rules';
import { colorLabel } from '../../connection/color-presets';
import { fieldRuleProblem } from '../color-by-field';
import { endOfText, endText, scaleKindOf, type FieldChange, type ScaleKind } from '../edit-field-rule';
import { fieldOnPage, legendOfRule, valueColors, type FormatPaint, type Legend } from '../format-field';
import type { Document } from '../types';
import { text } from '../text';

/**
 * What an open field rule holds while it is edited: the texts typed in its boxes (an end not typed shows the rule's),
 * the value being pinned.
 */
export interface OpenFieldTexts {
  readonly field: string;
  readonly min?: string;
  readonly max?: string;
  readonly pin: string;
  /** The value of the legend whose swatch was clicked: its presets are shown under it. */
  readonly pinning?: string;
  /** Why the value typed in **Pin a value…** was refused, under it. */
  readonly pinProblem?: string;
}

/** A choice of a list of the open rule. */
export interface FieldOption<Value extends string> {
  readonly value: Value;
  readonly label: string;
}

/** A list to pick one from: **Color**, **As**, **Scale**, **Palette**. */
export interface FieldSelect<Value extends string> {
  readonly label: string;
  readonly tip: string;
  readonly value: Value;
  readonly options: readonly FieldOption<Value>[];
}

/** A box of one line, with why what is typed is refused. */
export interface FieldBox {
  readonly label: string;
  readonly value: string;
  readonly placeholder: string;
  readonly tip: string;
  readonly problem?: string;
}

/** A preset to choose, a button named by its color, the one chosen marked. */
export interface SwatchChoice {
  readonly color: PresetColor;
  readonly name: string;
  readonly chosen: boolean;
  readonly change: FieldChange;
}

/** A value of the legend. */
export interface LegendLine {
  readonly text: string;
  readonly count: number;
  readonly paint: FormatPaint;
  readonly pinned: boolean;
  /** The swatch, a button that pins the value to a color; none for true and false. */
  readonly swatch?: { readonly label: string; readonly tip: string };
  /** While the value is being pinned: the eleven presets, and **Unpin** when it is pinned. */
  readonly pinning?: {
    readonly label: string;
    readonly swatches: readonly SwatchChoice[];
    readonly unpin?: { readonly label: string; readonly tip: string; readonly change: FieldChange };
  };
}

/** The bar of a scale: its first and last color, with the faint end of one color. */
export interface ScaleBar {
  readonly from?: PresetColor;
  readonly to: PresetColor;
  readonly label: string;
}

/** The open field rule. */
export interface FieldOpenView {
  readonly field: FieldBox;
  readonly target: FieldSelect<FieldRule['target']>;
  readonly mode: FieldSelect<FieldRule['mode']>;
  readonly swap?: { readonly label: string; readonly tip: string; readonly change: FieldChange };
  readonly scale?: {
    readonly kind: FieldSelect<ScaleKind>;
    readonly colors?: { readonly label: string; readonly swatches: readonly SwatchChoice[] };
    readonly min: FieldBox;
    readonly max: FieldBox;
    readonly bar: ScaleBar;
    readonly fromPage: { readonly label: string; readonly tip: string; readonly change: FieldChange };
  };
  readonly palette?: FieldSelect<'all' | PresetColor>;
  readonly legend: { readonly label: string; readonly lines: readonly LegendLine[] };
  readonly repeats?: string;
  readonly pinValue?: FieldBox;
  readonly noValues?: string;
}

const modeLabels = {
  values: text.fieldRule.values,
  scale: text.fieldRule.scale,
  boolean: text.fieldRule.boolean,
} as const;

/** The ends of a scale on the page, without the rule's own: what **From this page** and **As** take. */
export function pageEnds(rule: FieldRule, documents: readonly Document[]): { min?: number; max?: number } {
  const { min: _min, max: _max, ...rest } = rule;
  const page = fieldOnPage({ ...rest, mode: 'scale' }, documents);
  return { ...(page.min === undefined ? {} : { min: page.min }), ...(page.max === undefined ? {} : { max: page.max }) };
}

function modeSelect(rule: FieldRule, documents: readonly Document[]): FieldSelect<FieldRule['mode']> {
  const chosen = fieldOnPage({ ...rule, mode: 'auto' }, documents).mode;
  return {
    label: text.fieldRule.as,
    tip: text.fieldRule.asTip,
    value: rule.mode,
    options: [
      { value: 'auto', label: text.fieldRule.automatic(modeLabels[chosen]) },
      { value: 'values', label: modeLabels.values },
      { value: 'scale', label: modeLabels.scale },
      { value: 'boolean', label: modeLabels.boolean },
    ],
  };
}

function swatchChoices(chosen: PresetColor | undefined, change: (color: PresetColor) => FieldChange): SwatchChoice[] {
  return presetColors.map((color) => ({
    color,
    name: colorLabel(color),
    chosen: color === chosen,
    change: change(color),
  }));
}

function endBox(
  rule: FieldRule,
  end: 'min' | 'max',
  typed: string | undefined,
  page: { legend: Legend; now: number },
): FieldBox {
  const refused = typed === undefined ? null : endOfText(typed, page.now);
  return {
    label: end === 'min' ? text.fieldRule.min : text.fieldRule.max,
    value: typed ?? endText(rule[end], page.legend.dates === true),
    placeholder: endText(page.legend[end], page.legend.dates === true) || end,
    tip: end === 'min' ? text.fieldRule.minTip : text.fieldRule.maxTip,
    ...(refused !== null && typeof refused === 'object' ? { problem: refused.message } : {}),
  };
}

function scaleView(
  rule: FieldRule,
  texts: OpenFieldTexts,
  page: { legend: Legend; now: number },
  documents: readonly Document[],
) {
  const kind = scaleKindOf(rule);
  const to = rule.scale?.to ?? 'blue';
  const from = rule.scale?.from;
  return {
    kind: {
      label: text.fieldRule.scaleKind,
      tip: text.fieldRule.scaleKindTip,
      value: kind,
      options: [
        { value: 'one', label: text.fieldRule.oneColor },
        { value: 'red-green', label: text.fieldRule.redToGreen },
        { value: 'green-red', label: text.fieldRule.greenToRed },
      ],
    } satisfies FieldSelect<ScaleKind>,
    ...(kind === 'one'
      ? {
          colors: {
            label: text.fieldRule.scaleColor,
            swatches: swatchChoices(to, (color) => ({ kind: 'scale-color', color })),
          },
        }
      : {}),
    min: endBox(rule, 'min', texts.min, page),
    max: endBox(rule, 'max', texts.max, page),
    bar: {
      ...(from === undefined ? {} : { from }),
      to,
      label: text.fieldRule.scaleBar(colorLabel(from ?? to), colorLabel(to)),
    },
    fromPage: {
      label: text.fieldRule.fromPage,
      tip: text.fieldRule.fromPageTip,
      change: { kind: 'from-page', ends: pageEnds(rule, documents) } as const,
    },
  };
}

function legendLines(legend: Legend, pinning: string | undefined, pinnable: boolean): readonly LegendLine[] {
  return legend.entries.map((entry) => {
    const tip = entry.pinned ? text.fieldRule.pinnedTip : text.fieldRule.pinTip;
    const open = pinnable && pinning === entry.text;
    return {
      text: entry.text,
      count: entry.count,
      paint: entry.paint,
      pinned: entry.pinned,
      ...(pinnable ? { swatch: { label: text.fieldRule.pinChoice(tip, entry.text), tip } } : {}),
      ...(open
        ? {
            pinning: {
              label: text.fieldRule.colorOf(entry.text),
              swatches: swatchChoices(entry.pinned ? entry.paint.color : undefined, (color) => ({
                kind: 'pin',
                value: entry.text,
                color,
              })),
              ...(entry.pinned
                ? {
                    unpin: {
                      label: text.fieldRule.unpin,
                      tip: text.fieldRule.unpinTip,
                      change: { kind: 'unpin', value: entry.text } as const,
                    },
                  }
                : {}),
            },
          }
        : {}),
    };
  });
}

function paletteSelect(rule: FieldRule): FieldSelect<'all' | PresetColor> {
  return {
    label: text.fieldRule.palette,
    tip: text.fieldRule.paletteTip,
    value: rule.palette ?? 'all',
    options: [
      { value: 'all', label: text.fieldRule.allColors },
      { value: 'gray', label: text.fieldRule.shadesOf(colorLabel('gray')) },
      ...valueColors.map((color) => ({ value: color, label: text.fieldRule.shadesOf(colorLabel(color)) })),
    ],
  };
}

/** Whether the page has a value of the field to show in the legend. */
function hasValues(legend: Legend): boolean {
  return legend.entries.some((entry) => entry.count > 0) || legend.min !== undefined;
}

/** The open field rule, from the rule as saved, the texts typed in its boxes, the page and the time of its read. */
export function fieldOpenView(
  rule: FieldRule,
  texts: OpenFieldTexts,
  page: { readonly documents: readonly Document[]; readonly now: number },
): FieldOpenView {
  const legend = legendOfRule(rule, page.documents);
  const fieldProblem = fieldRuleProblem(texts.field);
  const values = legend.mode === 'values';
  return {
    field: {
      label: text.fieldRule.field,
      value: texts.field,
      placeholder: text.fieldRule.fieldPlaceholder,
      tip: text.fieldRule.fieldTip,
      ...(fieldProblem === undefined ? {} : { problem: fieldProblem }),
    },
    target: {
      label: text.fieldRule.target,
      tip: text.fieldRule.targetTip,
      value: rule.target,
      options: [
        { value: 'cell', label: text.fieldRule.cell },
        { value: 'row', label: text.fieldRule.row },
      ],
    },
    mode: modeSelect(rule, page.documents),
    ...(legend.mode === 'boolean'
      ? { swap: { label: text.fieldRule.swap, tip: text.fieldRule.swapTip, change: { kind: 'swap' } as const } }
      : {}),
    ...(legend.mode === 'scale' ? { scale: scaleView(rule, texts, { legend, now: page.now }, page.documents) } : {}),
    ...(values ? { palette: paletteSelect(rule) } : {}),
    legend: { label: text.fieldRule.legend(rule.field), lines: legendLines(legend, texts.pinning, values) },
    ...(legend.repeats === undefined ? {} : { repeats: legend.repeats }),
    ...(values
      ? {
          pinValue: {
            label: text.fieldRule.pinValue,
            value: texts.pin,
            placeholder: text.fieldRule.pinValuePlaceholder,
            tip: text.fieldRule.pinValueTip,
            ...(texts.pinProblem === undefined ? {} : { problem: texts.pinProblem }),
          },
        }
      : {}),
    ...(page.documents.length > 0 && !hasValues(legend) ? { noValues: text.fieldRule.noValues(rule.field) } : {}),
  };
}

/** What a field rule's line shows of its colors: the bar of its scale, or the swatches of its first three values. */
export function lineColors(
  rule: FieldRule,
  documents: readonly Document[],
): { readonly bar?: ScaleBar; readonly paints: readonly FormatPaint[] } {
  const legend = legendOfRule(rule, documents);
  if (legend.mode === 'scale') {
    const to = rule.scale?.to ?? 'blue';
    const from = rule.scale?.from;
    const label = text.fieldRule.scaleBar(colorLabel(from ?? to), colorLabel(to));
    return { bar: { ...(from === undefined ? {} : { from }), to, label }, paints: [] };
  }
  return { paints: legend.entries.slice(0, 3).map((entry) => entry.paint) };
}
