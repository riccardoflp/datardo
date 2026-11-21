/**
 * What a Relationship diagram tab keeps and asks (`relation.diagram`): **Sample**, **Keys only**, the boxes the user
 * moved and the scale, kept with the tab as one choice, `diagram`, in the text of JSON and read back made valid, so
 * that a restored tab draws as it was left (`tab.restore`).
 */
import { diagramSamples } from '../read';

/** The name of the tab's choice that keeps the page's options. */
export const diagramChoice = 'diagram';

/** The app action that samples the collections of a diagram's database (`relation.read`). */
export const sampleAction = 'relation.sample';

/** What the tab keeps. */
export interface KeptDiagram {
  readonly sample: (typeof diagramSamples)[number];
  readonly keysOnly: boolean;
  readonly moved: readonly { readonly name: string; readonly left: number; readonly top: number }[];
  readonly scale: number;
}

/** What a tab keeps before the user changes anything. */
export const firstDiagram: KeptDiagram = { sample: 100, keysOnly: false, moved: [], scale: 1 };

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function movedOf(value: unknown): KeptDiagram['moved'] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((each: unknown) =>
    isRecord(each) && typeof each['name'] === 'string' && Number.isFinite(each['left']) && Number.isFinite(each['top'])
      ? [{ name: each['name'], left: each['left'] as number, top: each['top'] as number }]
      : [],
  );
}

/** The options from what was kept, each part that is missing or not valid as it starts. */
export function diagramOf(value: unknown): KeptDiagram {
  if (!isRecord(value)) {
    return firstDiagram;
  }
  const scale = value['scale'];
  return {
    sample: diagramSamples.find((size) => size === value['sample']) ?? firstDiagram.sample,
    keysOnly: value['keysOnly'] === true,
    moved: movedOf(value['moved']),
    scale: typeof scale === 'number' && Number.isFinite(scale) && scale > 0 ? scale : 1,
  };
}

/** The options a tab kept in its choices; those of the first time when it kept none. */
export function keptDiagram(choices: Readonly<Record<string, string>> | undefined): KeptDiagram {
  const kept = choices?.[diagramChoice];
  if (kept === undefined) {
    return firstDiagram;
  }
  try {
    return diagramOf(JSON.parse(kept) as unknown);
  } catch {
    // A choice that is not JSON was not written by this page: the page starts as it does the first time.
    return firstDiagram;
  }
}

/** The choices that keep the options with the tab. */
export function diagramChoices(kept: KeptDiagram): Readonly<Record<string, string>> {
  return { [diagramChoice]: JSON.stringify(diagramOf(kept)) };
}
