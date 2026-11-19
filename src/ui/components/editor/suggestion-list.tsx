/**
 * The list of suggestions of a mongosh editor (`query.autocomplete`), drawn from its View: a list box under the
 * cursor, or above it when there is no room below, each line with the mark of its kind, its text with the part typed
 * in bold and its detail at the right. A click inserts a line and leaves the focus in the editor.
 */
import '@vscode/codicons/dist/codicon.css';
import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { AutocompleteView, SuggestionLine } from '../../../features/query/autocomplete';
import type { SuggestionKind } from '../../../features/query/suggestions';
import styles from './editor.module.css';

/** Where the list is drawn: the place of the text it completes, in the coordinates of the window. */
export interface ListAnchor {
  readonly left: number;
  readonly top: number;
  readonly bottom: number;
}

/** What the list is given. */
export interface SuggestionListProps {
  /** The id of the list box; each line's id starts with it. */
  readonly id: string;
  readonly shown: AutocompleteView;
  readonly anchor: ListAnchor;
  readonly onPick: (index: number) => void;
  /** Its `data-feature`: `query.autocomplete@editor` unless said. */
  readonly element?: 'query.autocomplete@editor' | 'playground.autocomplete@editor';
}

const kindIcons: Readonly<Record<SuggestionKind, string>> = {
  field: 'codicon codicon-symbol-field',
  operator: 'codicon codicon-symbol-operator',
  stage: 'codicon codicon-symbol-structure',
  value: 'codicon codicon-symbol-constant',
  collection: 'codicon codicon-symbol-class',
  method: 'codicon codicon-symbol-method',
};

function Label({ line }: { readonly line: SuggestionLine }): React.JSX.Element {
  if (line.typed === undefined) {
    return <span className={styles.label}>{line.label}</span>;
  }
  const [from, to] = line.typed;
  return (
    <span className={styles.label}>
      {line.label.slice(0, from)}
      <b className={styles.typed}>{line.label.slice(from, to)}</b>
      {line.label.slice(to)}
    </span>
  );
}

/** Puts the list under its anchor, or above it when it would leave the window below, and inside the window sideways. */
function usePlacement(elementRef: React.RefObject<HTMLDivElement | null>, anchor: ListAnchor): void {
  useLayoutEffect(() => {
    const list = elementRef.current;
    if (list === null) {
      return;
    }
    const height = list.offsetHeight;
    const above = anchor.bottom + height > window.innerHeight && anchor.top - height >= 0;
    list.style.top = `${String(above ? anchor.top - height : anchor.bottom)}px`;
    list.style.left = `${String(Math.max(0, Math.min(anchor.left, window.innerWidth - list.offsetWidth)))}px`;
  });
}

/** Keeps the active line in view as the keys move through the list. */
function useActiveInView(elementRef: React.RefObject<HTMLDivElement | null>, active: string | undefined): void {
  useLayoutEffect(() => {
    if (active === undefined) {
      return;
    }
    const line = elementRef.current?.querySelector(`[data-line="${active}"]`);
    line?.scrollIntoView({ block: 'nearest' });
  }, [elementRef, active]);
}

/** The list box of the suggestions, in a layer over the window. */
export function SuggestionList({
  id,
  shown,
  anchor,
  onPick,
  element = 'query.autocomplete@editor',
}: SuggestionListProps): React.JSX.Element {
  const elementRef = useRef<HTMLDivElement>(null);
  usePlacement(elementRef, anchor);
  useActiveInView(elementRef, shown.active);
  return createPortal(
    <div
      ref={elementRef}
      id={id}
      className={styles.list}
      role={shown.role}
      aria-label={shown.name}
      data-feature={element}
      onMouseDown={(event) => {
        // The editor keeps the focus.
        event.preventDefault();
      }}
    >
      {shown.lines.map((line, index) => (
        <div
          key={line.id}
          id={`${id}-${line.id}`}
          data-line={line.id}
          className={styles.option}
          role="option"
          aria-selected={line.selected}
          onClick={() => {
            onPick(index);
          }}
        >
          <span className={kindIcons[line.kind]} aria-hidden="true" />
          <Label line={line} />
          {line.detail === undefined ? null : <span className={styles.detail}>{line.detail}</span>}
        </div>
      ))}
    </div>,
    document.body,
  );
}
