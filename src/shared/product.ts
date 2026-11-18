/**
 * Facts about Datardo itself that several areas need.
 */

/** What is known of where Datardo lives. */
export interface Product {
  /**
   * The address of Datardo's repository on GitHub (D48), or `undefined` in a build that has none: the links and the
   * check for a newer version that need it are then not offered.
   */
  readonly repository: string | undefined;
}

/** Datardo. */
export const product: Product = { repository: 'https://github.com/riccardoflp/datardo' };
