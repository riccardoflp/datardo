/**
 * Feature: tree.set-database-color
 *
 * Gives one database its own color, shown on its icon and on those of its collections, views, buckets or namespaces
 * without a color of their own, and on their tabs. Started from the node of a MongoDB database with `{ connection,
 * database }`, or of a Redis database with its number; from Go to, on the database of the active tab. **None** is
 * the only way back: the connection's color never reaches an icon (D69), so there is no **Connection's color** here.
 */
import type { ConnectionView } from '../../shared/connection';
import { featureId } from '../../shared/ids';
import { noDanger, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { colorText } from '../connection/parts/color-text';
import { chosenColor, colorQuestion, customColorQuestion } from '../connection/parts/color-question';
import { ownColor, type ColorTarget } from './color-of';
import { argumentsOf, colorPlaceOf, colorPlan, databaseOfShows, nameOf, type ColorPlace } from './parts/color-plan';
import { text } from './text';

function question(connection: ConnectionView, target: ColorTarget): Outcome {
  return colorQuestion({
    title: text.colors.title(nameOf(target)),
    placeholder: connection.engine === 'redis' ? text.colors.redisDatabasePlaceholder : text.colors.databasePlaceholder,
    current: ownColor(connection, target) ?? 'none',
    noneDescription: colorText.databaseNone,
  });
}

/** The color **Choose a color** starts on: the database's own color, else blue. */
function startOf(place: ColorPlace): NonNullable<ConnectionView['color']> {
  const own = ownColor(place.connection, place.target);
  return own !== undefined && own !== 'none' ? own : 'blue';
}

/**
 * Feature: tree.set-database-color — asks the color of the database, then sets its entry in `databaseColors` on the
 * connection (`shop`, or `"3"` for `db3`); **None** removes the entry.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const place = colorPlaceOf(context, answers, databaseOfShows);
  if (place?.target.kind !== 'database') {
    return run({
      title: text.menu.setColor,
      steps: [],
      danger: noDanger,
      undo: { cannot: text.colors.cannotUndo },
      publishes: false,
      after: [],
    });
  }
  const chosen = chosenColor(answers, argumentsOf(answers));
  switch (chosen?.kind) {
    case undefined:
    case 'follow':
      return question(place.connection, place.target);
    case 'custom':
      return customColorQuestion({ name: nameOf(place.target), start: startOf(place) });
    case 'none':
      return colorPlan(place, undefined);
    case 'color':
      return colorPlan(place, chosen.color);
  }
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('tree.set-database-color'), plan };
