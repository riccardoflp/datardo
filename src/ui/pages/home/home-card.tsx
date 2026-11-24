/**
 * `home.card` and `home.card-menu`: one connection on Home, drawn from what `src/features/home/card.ts` returns. Its one
 * button connects, cancels the connecting or goes to the connection; a double click on the card does what **Connect**
 * and **Go to** do; its `…`, a right click, `Shift+F10` or the menu key open the menu of the connection
 * (`connection.menu`), which leaves Home active.
 */
import type { CardView } from '../../../features/home/card';
import type { AppState } from '../../../shared/state';
import { ConnectionContextMenu, ConnectionMenuButton } from '../../connection/connection-menu';
import { startFeature } from '../../shell/intent';
import styles from './home-page.module.css';
import { colorAttributes } from '../../components/color';

/** Goes to the connection: it becomes the current one and connects if it is not connected (`nav.switch-connection`). */
function goTo(card: CardView): void {
  startFeature('nav.switch-connection', { place: 'home', args: { connection: card.id } });
}

/** Stops the connecting: the work of the connection is cancelled, or the connection is disconnected. */
function cancel(card: CardView, state: AppState): void {
  const work = state.runner.work.find((each) => each.connection === card.id && each.done === undefined);
  if (work === undefined) {
    startFeature('connection.disconnect', { place: 'home', target: { kind: 'connection', connection: card.id } });
  } else {
    void window.datardo.cancel(work.id);
  }
}

function press(card: CardView, state: AppState): void {
  if (card.button.kind === 'cancel') {
    cancel(card, state);
  } else {
    goTo(card);
  }
}

/** A card. */
export function HomeCard(props: { readonly card: CardView; readonly state: AppState }): React.JSX.Element {
  const { card, state } = props;
  return (
    <ConnectionContextMenu connection={card.id} place="home">
      <div
        className={styles['card']}
        role="group"
        tabIndex={0}
        aria-label={card.spoken}
        data-card={card.id}
        data-feature={card.element}
        {...colorAttributes(card.color)}
        data-current={card.current ? true : undefined}
        onDoubleClick={(event) => {
          if (!(event.target instanceof Element && event.target.closest('button') !== null)) {
            goTo(card);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && event.target === event.currentTarget) {
            event.preventDefault();
            press(card, state);
          }
        }}
      >
        <span className={styles['band']} aria-hidden="true" />
        <div className={styles['cardBody']}>
          <div className={styles['cardTop']}>
            <span className={styles['cardName']} title={card.name}>
              {card.name}
            </span>
            <span data-feature="home.card-menu@home">
              <ConnectionMenuButton connection={card.id} place="home" className={styles['iconButton']} />
            </span>
          </div>
          <span className={styles['muted']}>{card.engine}</span>
          <span className={styles['address']} title={card.hosts.join('\n')}>
            {card.address}
          </span>
          {card.marks.length === 0 ? null : (
            <span className={styles['marks']}>
              {card.marks.map((mark) => (
                <span key={mark} className={styles['mark']}>
                  {mark}
                </span>
              ))}
            </span>
          )}
          <div className={styles['cardBottom']}>
            <span className={styles['state']} data-state={card.state.name} title={card.state.tooltip}>
              {card.state.text}
              {card.state.line === undefined ? null : <span className={styles['reason']}>{card.state.line}</span>}
            </span>
            <button
              type="button"
              className={styles['button']}
              data-feature={card.button.element}
              onClick={() => {
                press(card, state);
              }}
            >
              {card.button.label}
            </button>
          </div>
        </div>
      </div>
    </ConnectionContextMenu>
  );
}
