/**
 * What each line of the tree island draws (`tree.show`, `tree.mongodb`, `tree.redis`, `tree.pinned`, `tree.pages`,
 * `tree.node-states`): the arrow of a line that expands, the icon, the name, what comes after it, and the buttons
 * shown on hover or focus, which the keyboard reaches through the line's context menu (`tree.keyboard`).
 */
import type { TreeRow } from '../components/tree';
import { text } from '../../features/tree/text';
import type { Control, PartName, TreeItem } from '../../features/tree/types';
import styles from './tree-island.module.css';

/** A line of the tree island, as the tree component draws it. */
export interface IslandRow extends TreeRow {
  readonly item: TreeItem;
}

/** The identifier of a part's heading, by the card that draws the part. */
function headingElement(part: PartName, engine: 'mongodb' | 'redis'): string {
  switch (part) {
    case 'pinned':
      return 'tree.pinned@tree';
    case 'pages':
      return 'tree.pages@tree';
    case 'databases':
      return engine === 'redis' ? 'tree.redis@tree' : 'tree.mongodb@tree';
  }
}

/** The identifier of the context menu of a line, by the card of the line (the entries are its menu card's). */
export function menuOfCard(item: TreeItem, engine: 'mongodb' | 'redis'): string {
  if (item.kind === 'node' && item.ref.kind === 'pin') {
    return 'tree.pinned@tree-menu';
  }
  if (item.kind === 'node' && item.ref.kind === 'page') {
    return 'tree.pages@tree-menu';
  }
  return engine === 'redis' ? 'tree.redis@tree-menu' : 'tree.mongodb@tree-menu';
}

/** The line of the tree component for a line of the island. */
export function rowOf(item: TreeItem, engine: 'mongodb' | 'redis'): IslandRow {
  switch (item.kind) {
    case 'node':
      return {
        id: item.id,
        level: item.level,
        ...(item.expandable ? { expanded: item.expanded } : {}),
        selected: item.selected,
        focusable: true,
        label: item.label,
        dimmed: item.dimmed,
        // A pinned item is dragged onto another to take its place (`nav.pin`).
        ...(item.ref.kind === 'pin' ? { draggable: true, element: 'nav.pin@tree' } : {}),
        item,
      };
    case 'heading':
      return {
        id: item.id,
        element: headingElement(item.part, engine),
        level: 1,
        expanded: item.expanded,
        selected: false,
        focusable: true,
        label: item.text,
        item,
      };
    case 'line':
      return {
        id: item.id,
        level: item.level,
        selected: false,
        focusable: item.button !== undefined,
        label: item.button === undefined ? item.text : `${item.text}, ${item.button.label}`,
        tone: item.tone,
        item,
      };
  }
}

/** The Codicon of a button, from the feature it starts; a button whose feature has none shows its words. */
const buttonIcons: Readonly<Record<string, string>> = {
  'manage.create-database': 'add',
  'manage.create-collection': 'add',
  'tree.refresh': 'refresh',
  'document.insert': 'add',
  'gridfs.upload': 'cloud-upload',
};

/** What a control does when pressed. */
export type Press = (control: Control) => void;

/** A button shown on hover or focus: out of the order of `Tab`, reached through the line's context menu. */
function HoverButton({ control, press }: { readonly control: Control; readonly press: Press }): React.JSX.Element {
  const icon = control.kind === 'start' ? buttonIcons[control.feature] : undefined;
  return (
    <button
      type="button"
      tabIndex={-1}
      className={styles['hover-button']}
      {...(control.element === undefined ? {} : { 'data-feature': control.element })}
      aria-label={control.label}
      title={control.label}
      onClick={(event) => {
        event.stopPropagation();
        press(control);
      }}
    >
      {icon === undefined ? control.label : <span className={`codicon codicon-${icon}`} aria-hidden="true" />}
    </button>
  );
}

/** The identifier of the `…` button of a line, by the card whose menu it opens. */
function menuElement(item: TreeItem, engine: 'mongodb' | 'redis'): string {
  if (item.kind === 'node' && item.ref.kind === 'pin') {
    return 'tree.pinned@tree-menu';
  }
  if (item.kind === 'node' && item.ref.kind === 'page') {
    return 'tree.pages@tree-menu';
  }
  return engine === 'redis' ? 'tree.menu-redis@tree-menu' : 'tree.menu-mongodb@tree-menu';
}

/** What a line is drawn with. */
export interface RowContext {
  readonly engine: 'mongodb' | 'redis';
  readonly press: Press;
  readonly openMenu: (item: string) => void;
}

function MenuButton({ item, context }: { readonly item: TreeItem; readonly context: RowContext }): React.JSX.Element {
  return (
    <button
      type="button"
      tabIndex={-1}
      className={styles['hover-button']}
      data-feature={menuElement(item, context.engine)}
      aria-label={text.menu.moreActions}
      aria-haspopup="menu"
      title={text.menu.moreActions}
      onClick={(event) => {
        event.stopPropagation();
        context.openMenu(item.id);
      }}
    >
      <span className="codicon codicon-ellipsis" aria-hidden="true" />
    </button>
  );
}

function Twisty({ expanded }: { readonly expanded: boolean | undefined }): React.JSX.Element {
  if (expanded === undefined) {
    return <span className={styles['twisty']} aria-hidden="true" />;
  }
  return (
    <span
      className={`${styles['twisty'] ?? ''} codicon codicon-chevron-${expanded ? 'down' : 'right'}`}
      data-twisty="true"
      aria-hidden="true"
    />
  );
}

/** What a line of the tree island draws inside its `treeitem`. */
export function RowContent({
  row,
  context,
}: {
  readonly row: IslandRow;
  readonly context: RowContext;
}): React.JSX.Element {
  const { item } = row;
  if (item.kind === 'line') {
    return (
      <>
        <span className={styles['line']}>{item.text}</span>
        {item.button === undefined ? null : (
          <button
            type="button"
            tabIndex={-1}
            className={styles['line-button']}
            {...(item.button.element === undefined ? {} : { 'data-feature': item.button.element })}
            onClick={(event) => {
              event.stopPropagation();
              if (item.button !== undefined) {
                context.press(item.button);
              }
            }}
          >
            {item.button.label}
          </button>
        )}
      </>
    );
  }
  const name = item.kind === 'heading' ? item.text : item.name;
  return (
    <>
      <Twisty expanded={row.expanded} />
      {item.kind === 'node' ? <span className={`codicon codicon-${item.icon}`} aria-hidden="true" /> : null}
      <span
        className={item.kind === 'heading' ? styles['heading'] : styles['name']}
        title={item.kind === 'node' ? item.hover : undefined}
      >
        {name}
      </span>
      {item.kind === 'node' && item.after !== undefined ? (
        <>
          {/* The space keeps the name and what follows it two words, as the accessible name says them. */}{' '}
          <span className={styles['after']}>{item.after}</span>
        </>
      ) : null}
      <span className={styles['buttons']}>
        {item.buttons.map((control, index) => (
          <HoverButton key={`${control.label} ${String(index)}`} control={control} press={context.press} />
        ))}
        {item.hasMenu ? <MenuButton item={item} context={context} /> : null}
      </span>
    </>
  );
}
