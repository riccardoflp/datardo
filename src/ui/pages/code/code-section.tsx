/**
 * The Code section of a collection tab (`codegen.show`): a toolbar with the title, the languages as a group of tabs,
 * **Full program** and **Copy** (`codegen.copy`); then the code, selectable, not wrapped, scrolled in both directions,
 * or the message of a query that cannot be written as code. The query is taken when the section is shown and each
 * time **Code** is pressed, not at every key typed in the query bar.
 */
import { useEffect, useRef } from 'react';
import { view } from '../../../features/codegen/show';
import { text } from '../../../features/codegen/text';
import type { CodeLanguage } from '../../../features/codegen/types';
import type { CollectionRef } from '../../query/collection-reads';
import { chooseLanguage, copyCode, takeSource, toggleProgram } from './code-actions';
import { useCodeMemory } from './code-store';
import styles from './code.module.css';

/** The languages, as tabs moved between with the arrow keys, `Home` and `End`. */
function Languages({
  collectionRef: ref,
  label,
  tabs,
}: {
  readonly collectionRef: CollectionRef;
  readonly label: string;
  readonly tabs: readonly { readonly language: CodeLanguage; readonly label: string; readonly selected: boolean }[];
}): React.JSX.Element {
  const list = useRef<HTMLDivElement>(null);
  const choose = (index: number): void => {
    const next = tabs[(index + tabs.length) % tabs.length];
    if (next === undefined) {
      return;
    }
    chooseLanguage(ref, next.language);
    list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[(index + tabs.length) % tabs.length]?.focus();
  };
  const selected = tabs.findIndex((tab) => tab.selected);
  const onKeyDown = (event: React.KeyboardEvent): void => {
    const moves: Readonly<Record<string, number>> = {
      ArrowRight: selected + 1,
      ArrowLeft: selected - 1,
      Home: 0,
      End: tabs.length - 1,
    };
    const index = moves[event.key];
    if (index !== undefined) {
      event.preventDefault();
      choose(index);
    }
  };
  return (
    <div className={styles['languages']} role="tablist" aria-label={label} ref={list} onKeyDown={onKeyDown}>
      {tabs.map((tab, index) => (
        <button
          key={tab.language}
          type="button"
          role="tab"
          className={styles['language']}
          aria-selected={tab.selected}
          tabIndex={tab.selected ? 0 : -1}
          onClick={() => {
            choose(index);
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** The Code section. */
export function CodeSection({ collectionRef: ref }: { readonly collectionRef: CollectionRef }): React.JSX.Element {
  const memory = useCodeMemory(ref.tab);
  // The query is taken when the section is shown and each time **Code** asks for it again.
  useEffect(() => {
    takeSource(ref);
  }, [ref, memory.asked]);
  const source = memory.source ?? { kind: 'invalid' as const, message: '' };
  const shown = view({ source, collection: ref.collection, language: memory.language, program: memory.program });
  return (
    <section className={styles['section']} aria-label={text.section}>
      <div className={styles['toolbar']} role="toolbar" aria-label={text.section}>
        <h2 className={styles['title']}>{shown.title}</h2>
        <Languages collectionRef={ref} label={shown.languages.label} tabs={shown.languages.tabs} />
        <label className={styles['program']} title={shown.program.hint}>
          <input
            type="checkbox"
            checked={shown.program.checked}
            onChange={() => {
              toggleProgram(ref);
            }}
          />
          {shown.program.label}
        </label>
        <button
          type="button"
          className={styles['button']}
          data-feature={shown.copy.element}
          disabled={!shown.copy.enabled}
          onClick={() => void copyCode(ref, 'toolbar')}
        >
          {shown.copy.label}
        </button>
      </div>
      <div className={styles['body']} role="tabpanel" aria-label={text.section}>
        {shown.code === undefined ? null : (
          <pre className={styles['code']} tabIndex={0}>
            {shown.code}
          </pre>
        )}
        {shown.message === undefined || shown.message === '' ? null : (
          <p className={styles['message']}>{shown.message}</p>
        )}
      </div>
    </section>
  );
}
