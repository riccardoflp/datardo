/**
 * The toolbar of the Relationship diagram (`@toolbar`): the count, **Sample**, **Keys only**, **Refresh**; then **−**,
 * **+**, **Fit**, **Reset layout**, **Copy Mermaid** and **Save SVG…**. And **Relations (9)** (`@list`), a list that
 * folds, whose lines select their relation.
 */
import {
  zoomSteps,
  type DiagramControl,
  type DiagramSample,
  type DiagramView,
} from '../../../features/relation/diagram';
import { text } from '../../../features/relation/text';
import type { ReferenceGraph, Relation } from '../../../features/relation/types';
import { changeOptions, exportDiagram, layOutAgain, sample } from './diagram-changes';
import { fit, zoomStep } from './diagram-moves';
import styles from './diagram-page.module.css';

function Control(props: { readonly control: DiagramControl; readonly onClick: () => void }) {
  const { control } = props;
  return (
    <button
      type="button"
      className={styles['button']}
      title={control.hint}
      // A symbol (`−`, `+`) is named by its hint; a word is its own name, and the hint describes it.
      {...(control.label.length === 1 ? { 'aria-label': control.hint } : {})}
      disabled={!control.enabled}
      {...(control.element === undefined ? {} : { 'data-feature': control.element })}
      onClick={props.onClick}
    >
      {control.label}
    </button>
  );
}

/** The two rows of the toolbar. */
export function DiagramToolbar(props: {
  readonly tabId: string;
  readonly shown: DiagramView;
  readonly graph: ReferenceGraph | undefined;
  readonly page: () => DOMRect | undefined;
}) {
  const { tabId, shown, graph, page } = props;
  const controls = shown.controls;
  return (
    <>
      <div className={styles['toolbar']} role="toolbar" aria-label={text.diagram.page}>
        <span className={styles['count']} role="status">
          {shown.count}
        </span>
        <label className={styles['field']} title={shown.sample.hint}>
          <span>{shown.sample.label}</span>
          <select
            className={styles['input']}
            value={String(shown.sample.choices.find((choice) => choice.chosen)?.value ?? 100)}
            onChange={(event) => {
              const size = Number(event.target.value) as DiagramSample;
              changeOptions(tabId, (kept) => ({ ...kept, sample: size }));
              sample(tabId);
            }}
          >
            {shown.sample.choices.map((choice) => (
              <option key={choice.value} value={String(choice.value)}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles['field']} title={shown.keysOnly.hint}>
          <input
            type="checkbox"
            checked={shown.keysOnly.on}
            onChange={(event) => {
              const keysOnly = event.target.checked;
              layOutAgain(tabId, (kept) => ({ ...kept, keysOnly }));
            }}
          />
          <span>{shown.keysOnly.label}</span>
        </label>
        <Control
          control={controls.refresh}
          onClick={() => {
            sample(tabId);
          }}
        />
      </div>
      <div className={styles['toolbar']} role="toolbar" aria-label={text.diagram.viewRow}>
        <Control
          control={controls.zoomOut}
          onClick={() => {
            zoomStep(tabId, zoomSteps.out, page());
          }}
        />
        <Control
          control={controls.zoomIn}
          onClick={() => {
            zoomStep(tabId, zoomSteps.in, page());
          }}
        />
        <Control
          control={controls.fit}
          onClick={() => {
            if (shown.drawing !== undefined) {
              fit(tabId, shown.drawing, page());
            }
          }}
        />
        <Control
          control={controls.resetLayout}
          onClick={() => {
            layOutAgain(tabId);
          }}
        />
        <span className={styles['gap']} />
        <Control
          control={controls.copyMermaid}
          onClick={() => {
            if (graph !== undefined) {
              exportDiagram(tabId, 'relation.export-mermaid', graph);
            }
          }}
        />
        <Control
          control={controls.saveSvg}
          onClick={() => {
            if (graph !== undefined) {
              exportDiagram(tabId, 'relation.export-svg', graph);
            }
          }}
        />
      </div>
    </>
  );
}

/** **Relations (9)**: one line per relation, which selects it. */
export function DiagramList(props: {
  readonly tabId: string;
  readonly list: NonNullable<DiagramView['list']>;
  readonly relations: readonly Relation[];
  readonly onRelation: (at: number, from: string, to: string) => void;
}) {
  const { list, relations } = props;
  return (
    <details className={styles['list']} open>
      <summary>{list.title}</summary>
      {list.empty === undefined ? null : <p className={styles['muted-line']}>{list.empty}</p>}
      <ul className={styles['lines']}>
        {list.lines.map((line, at) => (
          <li key={`${line.text} ${String(at)}`}>
            <button
              type="button"
              className={styles['line']}
              aria-pressed={line.selected}
              onClick={() => {
                const relation = relations[at];
                if (relation !== undefined) {
                  props.onRelation(at, relation.from, relation.to);
                }
              }}
            >
              {line.text}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
