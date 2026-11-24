/**
 * The buttons of the query bar (`query.bar`), each with its Codicon before its name: the run button and **Reset**, the
 * toggle of the query's place (`query.position`), **Builder**, **Queries**, **Explain**, **Code**, **Update many…** and
 * **Delete many…**. In a section that runs something else from the bar (the Schema section's **Analyze**, the Chart
 * section's **Draw**), the run button starts that instead ({@link RunInstead}).
 */
import type { BarButton } from '../../features/query/bar';
import type { Target } from '../../shared/target';
import { showCode } from '../pages/code/code-actions';
import { startOnFilter } from '../pages/document/document-actions';
import { QueriesButton } from '../pages/saved-query/queries-list';
import { startFeature } from '../shell/intent';
import { pressRun, resetBar, toggleBuilder } from './bar-actions';
import { isBuilt } from './built';
import type { CollectionRef } from './collection-reads';
import { useQueryPlace } from './query-layout';
import styles from './query-bar.module.css';
import { spokenName } from './spoken-name';

/** What the run button does in a section that runs something else from the bar: its label, its element, its run. */
export interface RunInstead {
  readonly label: string;
  readonly element: string;
  readonly run: () => void;
}

/** The collection of the tab, as the target of the features the bar starts. */
function targetOf(ref: CollectionRef): Target {
  return { kind: 'collection', connection: ref.connection, database: ref.database, collection: ref.collection };
}

function pressed(ref: CollectionRef, button: BarButton): void {
  switch (button.element) {
    case 'query.builder@query-bar':
      toggleBuilder(ref);
      return;
    case 'query.reset@query-bar':
      resetBar(ref);
      return;
    case 'query.run@query-bar':
    case 'runner.cancel@list':
      pressRun(ref);
      return;
    case 'query.position@query-bar':
      // The toggle moves the query of every collection tab; nothing runs.
      startFeature('query.position', {
        place: 'query-bar',
        target: targetOf(ref),
        args: { position: button.pressed === true ? 'top' : 'right' },
      });
      return;
    case 'explain.show@query-bar':
      startFeature('explain.show', { place: 'query-bar', target: targetOf(ref) });
      return;
    case 'codegen.show@query-bar':
      showCode(ref, { kind: 'query' }, 'query-bar');
      return;
    case 'document.update-many@query-bar':
    case 'document.delete-many@query-bar':
      void startOnFilter(ref, button.element);
      return;
    default:
      return;
  }
}

function Icon({ icon }: { readonly icon: string | undefined }): React.JSX.Element | null {
  return icon === undefined ? null : <span className={`codicon codicon-${icon}`} aria-hidden="true" />;
}

/** One button of the bar. */
export function BarButtonView({
  button,
  collectionRef,
  instead,
}: {
  readonly button: BarButton;
  readonly collectionRef: CollectionRef;
  readonly instead?: RunInstead | undefined;
}): React.JSX.Element {
  const narrow = useQueryPlace().narrow;
  const run = button.element === 'query.run@query-bar' || button.element === 'runner.cancel@list';
  const className = `${styles['button'] ?? ''} ${run ? (styles['run'] ?? '') : ''}`;
  if (run && instead !== undefined) {
    return (
      <button type="button" className={className} data-feature={instead.element} onClick={instead.run}>
        <Icon icon={button.icon} />
        <span>{instead.label}</span>
      </button>
    );
  }
  if (button.element === 'saved-query.show@query-bar') {
    return (
      <QueriesButton
        collectionRef={collectionRef}
        label={button.label}
        spoken={spokenName(button.name, button.label)}
        {...(button.tip === undefined ? {} : { tip: button.tip })}
        {...(button.icon === undefined ? {} : { icon: button.icon })}
        iconAlone={button.iconAloneWhenNarrow === true && narrow}
        className={styles['button'] ?? ''}
      />
    );
  }
  return (
    <button
      type="button"
      className={className}
      data-feature={button.element}
      aria-label={button.label === '' ? button.name : spokenName(button.name, button.label)}
      title={button.tip}
      aria-pressed={button.pressed}
      onClick={() => {
        pressed(collectionRef, button);
      }}
    >
      <Icon icon={button.icon} />
      {button.label === '' ? null : <span>{button.label}</span>}
    </button>
  );
}

/** Some buttons of the bar, those whose feature is built, in a group of the bar's layout. */
export function BarButtons({
  buttons,
  className,
  collectionRef,
  instead,
}: {
  readonly buttons: readonly BarButton[];
  readonly className: string;
  readonly collectionRef: CollectionRef;
  readonly instead?: RunInstead | undefined;
}): React.JSX.Element | null {
  const shown = buttons.filter((button) => isBuilt(button.element));
  if (shown.length === 0) {
    return null;
  }
  return (
    <div className={className}>
      {shown.map((button) => (
        <BarButtonView key={button.element} button={button} collectionRef={collectionRef} instead={instead} />
      ))}
    </div>
  );
}
