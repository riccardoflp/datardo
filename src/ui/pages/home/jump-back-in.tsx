/**
 * `home.jump-back-in` and `home.forget-recent`: the things used last, drawn from what
 * `src/features/home/jump-back-in.ts` returns. An item opens what it names (`palette.open-result`); **Clear** and
 * **Remove from Jump back in** in an item's menu forget recent places.
 */
import * as ContextMenu from '@radix-ui/react-context-menu';
import type { JumpBackIn as JumpBackInView, JumpItem } from '../../../features/home/jump-back-in';
import { openArgs } from '../../../features/palette/open-result';
import { startFeature } from '../../shell/intent';
import menuStyles from '../../connection/connection-menu.module.css';
import styles from './home-page.module.css';

function forget(args: { readonly key: string } | { readonly all: true }): void {
  startFeature('home.forget-recent', { place: 'home', args });
}

function Item(props: { readonly item: JumpItem; readonly part: JumpBackInView }): React.JSX.Element {
  const { item, part } = props;
  return (
    <ContextMenu.Root modal={false}>
      <ContextMenu.Trigger asChild>
        <li>
          <button
            type="button"
            className={styles['jump']}
            data-feature="home.jump-back-in@home"
            data-color={item.color}
            onClick={() => {
              startFeature('palette.open-result', { place: 'home', args: openArgs(item.opens, 'foreground') });
            }}
          >
            <span className={`codicon codicon-${item.icon}`} aria-hidden="true" />
            <span className={styles['jumpTitle']}>{item.title}</span>
            <span className={styles['dot']} aria-hidden="true" />
            <span className={styles['muted']}>{item.connection}</span>
            <span className={styles['jumpPath']}>{item.path}</span>
          </button>
        </li>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={menuStyles['menu']} aria-label={item.menuLabel}>
          <ContextMenu.Item
            className={menuStyles['item']}
            data-feature={part.remove.element}
            onSelect={() => {
              forget({ key: item.key });
            }}
          >
            {part.remove.label}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

/** **Jump back in**. */
export function JumpBackIn({ part }: { readonly part: JumpBackInView }): React.JSX.Element {
  return (
    <section className={styles['section']} aria-labelledby="home-jump-back-in">
      <div className={styles['sectionHead']}>
        <h2 id="home-jump-back-in" className={styles['heading']}>
          {part.heading}
        </h2>
        <button
          type="button"
          className={styles['textButton']}
          data-feature={part.clear.element}
          onClick={() => {
            forget({ all: true });
          }}
        >
          {part.clear.label}
        </button>
      </div>
      <ul className={styles['jumps']}>
        {part.items.map((item) => (
          <Item key={item.key} item={item} part={part} />
        ))}
      </ul>
    </section>
  );
}
