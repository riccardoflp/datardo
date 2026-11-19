/**
 * The Operations and the Reads of the relation area, as the runner starts them. Derivations and views are not listed.
 */
import type { RunnableFeature } from '../../shared/feature';
import { feature as diagram } from './diagram';
import { feature as exportMermaid } from './export-mermaid';
import { feature as exportSvg, fileRead as exportSvgFile } from './export-svg';
import { feature as openReferenced } from './open-referenced';
import { feature as openReferencing } from './open-referencing';
import { feature as read } from './read';

/** The features of this area the runner can start. */
export const features: readonly RunnableFeature[] = [
  read,
  diagram,
  exportMermaid,
  exportSvg,
  exportSvgFile,
  openReferenced,
  openReferencing,
];
