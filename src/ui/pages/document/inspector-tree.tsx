/**
 * The document of the inspector as a tree (`document.inspect`): one line per field, its value in mongosh syntax, a
 * folded sub-document or array saying what it holds. The arrows move through the lines and open or fold them; a double
 * click or `F2` on a value edits it there (`document.inline-edit`); `Ctrl+C` copies it (`document.copy-value`); the
 * context menu has **Copy value** and **Copy field path** (`document.copy-path`).
 */
import { useState } from 'react';
import { lineControls, type TreeLine } from '../../../features/document/inspect';
import type { Document, MenuEntry } from '../../../features/table/types';
import type { CollectionRef } from '../../query/collection-reads';
import { MenuList } from '../../table/menu-list';
import type { ChosenEntry } from '../../table/menu-entries';
import { startOnDocuments } from './document-actions';
import { beginInlineEdit } from './inline-edit-actions';
import { changeInspect, toggleLine } from './inspect-store';
import styles from './document.module.css';

/** What the tree is drawn from. */
export interface TreeProps {
  readonly collectionRef: CollectionRef;
  readonly document: Document;
  readonly lines: readonly TreeLine[];
  readonly selected: string | undefined;
  readonly label: string;
}

interface OpenMenu {
  readonly line: TreeLine;
  readonly x: number;
  readonly y: number;
  readonly back: HTMLElement;
}

const menuEntries: readonly MenuEntry[] = [
  { kind: 'entry', label: lineControls.copyValue.label, element: lineControls.copyValue.element },
  { kind: 'entry', label: lineControls.copyPath.label, element: lineControls.copyPath.element },
];

function copyValue(ref: CollectionRef, line: TreeLine): void {
  void startOnDocuments(ref, lineControls.copyValue.element, { value: line.item });
}

function chosen(ref: CollectionRef, line: TreeLine, entry: ChosenEntry): void {
  if (entry.element === lineControls.copyValue.element) {
    copyValue(ref, line);
  } else {
    void startOnDocuments(ref, lineControls.copyPath.element, { path: [...line.segments] });
  }
}

function edit(props: TreeProps, line: TreeLine, anchor: HTMLElement): void {
  if (line.editable) {
    beginInlineEdit({
      ref: props.collectionRef,
      place: 'inspector',
      document: props.document,
      path: line.path,
      shown: line.item,
      anchor,
    });
  }
}

function lineKey(
  props: TreeProps,
  line: TreeLine,
  event: React.KeyboardEvent<HTMLElement>,
  menu: (open: OpenMenu) => void,
): boolean {
  const index = props.lines.indexOf(line);
  const select = (other: TreeLine | undefined): void => {
    if (other !== undefined) {
      changeInspect(props.collectionRef.tab, (before) => ({ ...before, line: other.path }));
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`[data-line="${CSS.escape(other.path)}"]`)?.focus();
      });
    }
  };
  const box = event.currentTarget.getBoundingClientRect();
  switch (event.key) {
    case 'ArrowDown':
      select(props.lines[index + 1]);
      return true;
    case 'ArrowUp':
      select(props.lines[index - 1]);
      return true;
    case 'ArrowRight':
    case 'ArrowLeft':
    case 'Enter':
      if (line.open !== undefined && (event.key === 'Enter' || line.open === (event.key === 'ArrowLeft'))) {
        toggleLine(props.collectionRef.tab, line.path);
      }
      return true;
    case 'F2':
      edit(props, line, event.currentTarget);
      return true;
    case 'ContextMenu':
      menu({ line, x: box.left, y: box.bottom, back: event.currentTarget });
      return true;
    default:
      if (event.shiftKey && event.key === 'F10') {
        menu({ line, x: box.left, y: box.bottom, back: event.currentTarget });
        return true;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === 'c' || event.key === 'C')) {
        copyValue(props.collectionRef, line);
        return true;
      }
      return false;
  }
}

function Line({
  props,
  line,
  onMenu,
}: {
  readonly props: TreeProps;
  readonly line: TreeLine;
  readonly onMenu: (open: OpenMenu) => void;
}): React.JSX.Element {
  const selected = line.path === (props.selected ?? props.lines[0]?.path);
  return (
    <div
      role="treeitem"
      className={styles['line']}
      aria-level={line.depth + 1}
      aria-selected={selected}
      aria-expanded={line.open}
      tabIndex={selected ? 0 : -1}
      data-line={line.path}
      style={{ paddingLeft: `calc(${String(line.depth)} * var(--space-4) + var(--space-2))` }}
      onClick={() => {
        changeInspect(props.collectionRef.tab, (before) => ({ ...before, line: line.path }));
        if (line.open !== undefined) {
          toggleLine(props.collectionRef.tab, line.path);
        }
      }}
      onDoubleClick={(event) => {
        edit(props, line, event.currentTarget);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu({ line, x: event.clientX, y: event.clientY, back: event.currentTarget });
      }}
      onKeyDown={(event) => {
        if (lineKey(props, line, event, onMenu)) {
          event.preventDefault();
        }
      }}
    >
      <span className={styles['name']}>{line.name}</span>
      <span className={styles['value']} data-feature={line.editable ? lineControls.edit.element : undefined}>
        {line.value}
      </span>
    </div>
  );
}

/** The tree of the inspector. */
export function InspectorTree(props: TreeProps): React.JSX.Element {
  const [menu, setMenu] = useState<OpenMenu | undefined>(undefined);
  return (
    <div role="tree" className={styles['tree']} aria-label={props.label}>
      {props.lines.map((line) => (
        <Line key={line.path} props={props} line={line} onMenu={setMenu} />
      ))}
      {menu === undefined ? null : (
        <MenuList
          label={menu.line.path}
          element={lineControls.copyValue.element}
          x={menu.x}
          y={menu.y}
          entries={menuEntries}
          returnFocus={menu.back}
          onChoose={(entry) => {
            chosen(props.collectionRef, menu.line, entry);
          }}
          onClose={() => {
            setMenu(undefined);
          }}
        />
      )}
    </div>
  );
}
