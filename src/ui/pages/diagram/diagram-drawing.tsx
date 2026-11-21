/**
 * The drawing of the Relationship diagram (`relation.diagram`): the boxes and the arrows of `drawing`, moved and
 * scaled as a whole. Dragging a box moves it, dragging the background moves the drawing, the wheel zooms around the
 * pointer. A click selects a box, a double click or `Enter` opens its collection; `Tab` moves between the boxes and
 * `Space` selects one.
 */
import { useRef } from 'react';
import { zoomed } from '../../../features/relation/diagram';
import type { BoxView, DrawingView } from '../../../features/relation/model/drawing';
import { headHeight, rowHeight } from '../../../features/relation/model/rows';
import { changeOptions, openCollection, select } from './diagram-changes';
import { changeDiagramTab, diagramTabOf, type DiagramTab } from './diagram-store';
import styles from './diagram-page.module.css';

/** What a drag under way moves: a box from where it was, or the whole drawing. */
type Drag =
  | {
      readonly kind: 'box';
      readonly name: string;
      readonly x: number;
      readonly y: number;
      readonly left: number;
      readonly top: number;
      moved: boolean;
    }
  | {
      readonly kind: 'page';
      readonly x: number;
      readonly y: number;
      readonly offset: DiagramTab['offset'];
      moved: boolean;
    };

/** How far the pointer goes before a press is a drag, in pixels. */
const dragFrom = 3;

function moveBox(tabId: string, name: string, left: number, top: number): void {
  changeOptions(tabId, (kept) => ({
    ...kept,
    moved: [...kept.moved.filter((each) => each.name !== name), { name, left, top }],
  }));
}

function Box(props: {
  readonly tabId: string;
  readonly box: BoxView;
  readonly onPress: (event: React.PointerEvent, box: BoxView) => void;
}) {
  const { tabId, box } = props;
  const lineY = (at: number): number => box.top + headHeight + at * rowHeight + rowHeight / 2 + 4;
  const classes = [styles['box'], box.selected ? styles['selected'] : '', box.faded ? styles['faded'] : ''].join(' ');
  return (
    <g
      className={classes}
      role="button"
      tabIndex={0}
      aria-pressed={box.selected}
      data-box={box.name}
      onPointerDown={(event) => {
        props.onPress(event, box);
      }}
      onDoubleClick={() => {
        openCollection(tabId, box.name, box.view);
      }}
      onKeyDown={(event) => {
        if (event.key === ' ') {
          event.preventDefault();
          select(tabId, { kind: 'box', name: box.name });
        } else if (event.key === 'Enter') {
          event.preventDefault();
          openCollection(tabId, box.name, box.view);
        }
      }}
    >
      <rect className={styles['box-body']} x={box.left} y={box.top} width={box.width} height={box.height} rx={4} />
      <rect
        className={box.view ? styles['view-head'] : styles['head']}
        x={box.left}
        y={box.top}
        width={box.width}
        height={headHeight}
        rx={4}
      />
      <text className={styles['name']} x={box.left + 10} y={box.top + 19}>
        {box.head}
      </text>
      {box.badge === undefined ? null : (
        <text className={styles['muted']} x={box.left + box.width - 10} y={box.top + 19} textAnchor="end">
          {box.badge}
        </text>
      )}
      {box.rows.map((row, at) => (
        <g key={`${row.text} ${String(at)}`}>
          <title>{row.tooltip}</title>
          <text
            className={row.key ? styles['key'] : styles['row-field']}
            x={box.left + 10 + row.indent * 10}
            y={lineY(at)}
          >
            {row.text}
          </text>
          <text className={styles['muted']} x={box.left + box.width - 10} y={lineY(at)} textAnchor="end">
            {row.right}
          </text>
        </g>
      ))}
      {box.last === undefined ? null : (
        <text className={styles['muted']} x={box.left + 10} y={lineY(box.rows.length)}>
          {box.last}
        </text>
      )}
    </g>
  );
}

/** The drawing, in an area that takes the pointer and the wheel. */
export function Drawing(props: { readonly tabId: string; readonly drawn: DrawingView; readonly tab: DiagramTab }) {
  const { tabId, drawn, tab } = props;
  const drag = useRef<Drag | undefined>(undefined);
  const scale = tab.kept.scale;
  const pressBox = (event: React.PointerEvent, box: BoxView): void => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      kind: 'box',
      name: box.name,
      x: event.clientX,
      y: event.clientY,
      left: box.left,
      top: box.top,
      moved: false,
    };
  };
  return (
    <svg
      className={styles['drawing']}
      role="group"
      aria-label={tab.database}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { kind: 'page', x: event.clientX, y: event.clientY, offset: tab.offset, moved: false };
      }}
      onPointerMove={(event) => {
        const now = drag.current;
        if (now === undefined) {
          return;
        }
        const dx = event.clientX - now.x;
        const dy = event.clientY - now.y;
        now.moved ||= Math.abs(dx) > dragFrom || Math.abs(dy) > dragFrom;
        if (!now.moved) {
          return;
        }
        if (now.kind === 'box') {
          moveBox(tabId, now.name, Math.round(now.left + dx / scale), Math.round(now.top + dy / scale));
        } else {
          changeDiagramTab(tabId, (state) => ({ ...state, offset: { x: now.offset.x + dx, y: now.offset.y + dy } }));
        }
      }}
      onPointerUp={() => {
        const ended = drag.current;
        drag.current = undefined;
        if (ended !== undefined && !ended.moved) {
          select(tabId, ended.kind === 'box' ? { kind: 'box', name: ended.name } : undefined);
        }
      }}
      onWheel={(event) => {
        const state = diagramTabOf(tabId);
        if (state === undefined) {
          return;
        }
        const area = event.currentTarget.getBoundingClientRect();
        const at = { x: event.clientX - area.left, y: event.clientY - area.top };
        const after = zoomed(state.kept.scale, event.deltaY < 0 ? 1.1 : 1 / 1.1);
        const ratio = after / state.kept.scale;
        changeDiagramTab(tabId, (before) => ({
          ...before,
          offset: { x: at.x - (at.x - before.offset.x) * ratio, y: at.y - (at.y - before.offset.y) * ratio },
        }));
        changeOptions(tabId, (kept) => ({ ...kept, scale: after }));
      }}
    >
      <defs>
        <marker
          id="diagram-arrow"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path className={styles['arrow-head']} d="M 0 0 L 10 5 L 0 10 z" />
        </marker>
      </defs>
      <g transform={`translate(${String(tab.offset.x)} ${String(tab.offset.y)}) scale(${String(scale)})`}>
        {drawn.arrows.map((arrow, index) => (
          <g
            key={`${arrow.d} ${String(index)}`}
            className={[arrow.selected ? styles['selected'] : '', arrow.faded ? styles['faded'] : ''].join(' ')}
          >
            <path
              id={`diagram-arrow-${tabId}-${String(index)}`}
              className={styles['arrow']}
              d={arrow.d}
              strokeDasharray={arrow.dashed ? '5 4' : undefined}
              markerEnd="url(#diagram-arrow)"
            >
              <title>{arrow.tooltip}</title>
            </path>
            {arrow.mark === undefined ? null : (
              <text className={styles['mark']} dy={-4}>
                <textPath href={`#diagram-arrow-${tabId}-${String(index)}`} startOffset="50%">
                  {arrow.mark}
                </textPath>
              </text>
            )}
          </g>
        ))}
        {drawn.boxes.map((box) => (
          <Box key={box.name} tabId={tabId} box={box} onPress={pressBox} />
        ))}
      </g>
    </svg>
  );
}
