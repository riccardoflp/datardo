/**
 * The sections of a collection tab that its section bar holds besides the first ones: **Schema** (`schema.show`), and
 * **More**, a menu with **Explain** (`explain.show`), which reads as pressed while one of its sections is shown.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { text as explainText } from '../../../features/explain/text';
import { text as schemaText } from '../../../features/schema/text';
import { startFeature } from '../../shell/intent';
import type { SectionPlace } from '../manage/section-actions';
import styles from './collection-page.module.css';

function startSection(place: SectionPlace, feature: 'schema.show' | 'explain.show'): void {
  startFeature(feature, {
    place: 'section-bar',
    target: {
      kind: 'collection',
      connection: place.connection,
      database: place.database,
      collection: place.collection,
    },
    args: { tab: place.tab },
  });
}

/** **Schema** in the section bar. */
export function SchemaButton({ place, section }: { readonly place: SectionPlace; readonly section: string }) {
  return (
    <button
      type="button"
      className={styles['section-button']}
      data-feature="schema.show@section-bar"
      aria-pressed={section === 'schema'}
      onClick={() => {
        startSection(place, 'schema.show');
      }}
    >
      {schemaText.section}
    </button>
  );
}

/** **More** in the section bar, and its menu. */
export function MoreMenu({ place, section }: { readonly place: SectionPlace; readonly section: string }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={styles['section-button']} aria-pressed={section === 'explain'}>
          {explainText.more} <span className="codicon codicon-chevron-down" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles['menu']} aria-label={explainText.more} align="start">
          <DropdownMenu.Item
            className={styles['item']}
            data-feature="explain.show@section-bar"
            onSelect={() => {
              startSection(place, 'explain.show');
            }}
          >
            {explainText.section}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
