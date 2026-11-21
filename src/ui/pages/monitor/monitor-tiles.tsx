/**
 * The tiles of the Stats, Replication and Sharding sections of the Monitor page, drawn from their Views: a label, a
 * value in its tone, a smaller line, and for **Connections**, **Operations / s** and **Network / s** the line of their
 * last values (`monitor.rates`). Also the color of a shard and a section's line of notice.
 */
import type { Tile } from '../../../features/monitor/parts/tiles';
import { cellTone } from './monitor-parts';
import styles from '../server/server-page.module.css';
import own from './monitor-page.module.css';

/** How many colors the shards take before they repeat: the chart colors of the tokens. */
const shardColors = 12;

/** The color of a shard by its place among the shards, as the tokens' chart colors number it. */
export function shardColor(index: number): string {
  return String(index % shardColors);
}

/** The line of a tile: its points from 0 (the smallest value shown) to 1 (the largest), left to right. */
function TileLine(props: { readonly points: readonly number[] }): React.JSX.Element {
  const last = props.points.length - 1;
  const coordinates = props.points
    .map((point, index) => `${String((index / last) * 100)},${String((1 - point) * 20)}`)
    .join(' ');
  return (
    <svg className={own['line']} viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={coordinates} />
    </svg>
  );
}

/** The tiles of a section. */
export function SectionTiles(props: { readonly label: string; readonly tiles: readonly Tile[] }): React.JSX.Element {
  return (
    <ul className={styles['tiles']} aria-label={props.label}>
      {props.tiles.map((tile) => (
        <li key={tile.label} className={styles['tile-item']}>
          <div className={styles['tile']}>
            <span className={styles['tile-label']}>{tile.label}</span>
            <span className={styles['tile-value']} data-tone={cellTone(tile.tone)}>
              {tile.value}
            </span>
            {tile.points === undefined ? null : <TileLine points={tile.points} />}
            {tile.line === '' ? null : <span className={styles['tile-line']}>{tile.line}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** What an Operation of the section said once it ran: *The balancer is stopped.* */
export function NoticeLine(props: { readonly text: string | undefined }): React.JSX.Element | null {
  return props.text === undefined ? null : (
    <p className={own['status']} role="status">
      {props.text}
    </p>
  );
}
