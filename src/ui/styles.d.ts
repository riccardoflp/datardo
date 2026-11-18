/** The classes of a CSS Module, by name. */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}

declare module '*.css';
