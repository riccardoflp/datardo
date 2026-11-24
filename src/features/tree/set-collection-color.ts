/**
 * Feature: tree.set-collection-color
 *
 * Gives one collection, view or GridFS bucket its own color, which takes the place of its database's on its icon in
 * the tree and on the icons of its tabs. Started from the node of the tree with `{ connection, database, collection }`
 * or `{ connection, database, bucket }`; from Go to, on the collection, view or bucket of the active tab. A bucket's
 * color is kept under its `.files` collection.
 */
import type { ColorMap } from '../../shared/color';
import type { ConnectionView } from '../../shared/connection';
import { featureId } from '../../shared/ids';
import { noDanger, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { colorLabel } from '../connection/color-presets';
import { colorText } from '../connection/parts/color-text';
import { chosenColor, colorQuestion, customColorQuestion, type ColorList } from '../connection/parts/color-question';
import { colorOf, databaseKey, ownColor, type ColorTarget } from './color-of';
import { argumentsOf, collectionOfShows, colorPlaceOf, colorPlan, nameOf, type ColorPlace } from './parts/color-plan';
import { text } from './text';

function described(color: ColorMap[string] | undefined): string {
  return color === undefined || color === 'none' ? colorText.noColor : colorLabel(color).toLowerCase();
}

/** The list: the presets, **None**, what the collection follows, **Custom color…**. */
function listOf(connection: ConnectionView, target: Exclude<ColorTarget, { kind: 'database' }>): ColorList {
  const ofDatabase = connection.databaseColors?.[databaseKey(target.database)];
  return {
    title: text.colors.title(nameOf(target)),
    placeholder:
      ofDatabase === undefined ? text.colors.collectionPlaceholder : text.colors.collectionInsteadOf(target.database),
    current: ownColor(connection, target) ?? 'follow',
    noneDescription: colorText.collectionNone,
    follow:
      ofDatabase === undefined
        ? { label: colorText.connectionsColor, color: described(connection.color) }
        : { label: colorText.databasesColor, color: described(ofDatabase) },
  };
}

function nothing(): Outcome {
  return run({
    title: text.menu.setColor,
    steps: [],
    danger: noDanger,
    undo: { cannot: text.colors.cannotUndo },
    publishes: false,
    after: [],
  });
}

/** The color **Choose a color** starts on: the collection's own color, else the color it shows now, else blue. */
function startOf(place: ColorPlace): NonNullable<ConnectionView['color']> {
  const own = ownColor(place.connection, place.target);
  return own !== undefined && own !== 'none' ? own : (colorOf(place.connection, place.target).color ?? 'blue');
}

/**
 * Feature: tree.set-collection-color — asks the color of the collection, view or bucket, then sets its entry in
 * `collectionColors` on the connection: a color, `none`, or removed to follow its database or its connection again.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const place = colorPlaceOf(context, answers, collectionOfShows);
  const target = place?.target;
  if (place === undefined || target === undefined || target.kind === 'database') {
    return nothing();
  }
  const chosen = chosenColor(answers, argumentsOf(answers));
  switch (chosen?.kind) {
    case undefined:
      return colorQuestion(listOf(place.connection, target));
    case 'custom':
      return customColorQuestion({ name: nameOf(target), start: startOf(place) });
    case 'follow':
      return colorPlan(place, undefined);
    case 'none':
      return colorPlan(place, 'none');
    case 'color':
      return colorPlan(place, chosen.color);
  }
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('tree.set-collection-color'), plan };
