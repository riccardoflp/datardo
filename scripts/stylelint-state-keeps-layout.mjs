// R10.8: a hover, a focus or a press changes colors, never where or how large anything is. The rule
// `datardo/state-keeps-layout` reports a declaration of a property of the layout in a rule whose selector has a state
// (`:hover`, `:focus`, `:focus-visible`, `:focus-within`, `:active`, `[data-highlighted]`), wherever the state is in
// the selector: `.row:hover .buttons { display: flex }` moves the row's words as much as `.button:hover { padding }`.
import stylelint from 'stylelint';

const {
  createPlugin,
  utils: { report, ruleMessages },
} = stylelint;

export const ruleName = 'datardo/state-keeps-layout';

export const messages = ruleMessages(ruleName, {
  rejected: (property, state) =>
    `"${property}" in a rule of ${state} moves or resizes what is shown; change colors only (R10.8)`,
});

/** The states of a control, as they are written in a selector. */
const states = [':hover', ':focus-visible', ':focus-within', ':focus', ':active', '[data-highlighted]'];

/** The properties that place or size a box, or the text in it. */
const layoutProperty =
  /^(display|position|inset|top|right|bottom|left|float|clear|width|height|min-width|min-height|max-width|max-height|inline-size|block-size|min-inline-size|min-block-size|max-inline-size|max-block-size|margin(-.+)?|padding(-.+)?|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-width)?|border-style|font|font-size|font-weight|font-family|font-stretch|letter-spacing|word-spacing|line-height|gap|row-gap|column-gap|flex(-.+)?|grid(-.+)?|order|align-self|justify-self|transform|translate|scale|rotate|zoom|white-space|text-indent|overflow(-[xy])?|box-sizing|aspect-ratio|content)$/u;

/** A shorthand of the border may only repeat its width and style with another color: `border-color` says it. */
function stateOf(selector) {
  return states.find((state) => selector.includes(state));
}

const rule = (enabled) => (root, result) => {
  if (!enabled) {
    return;
  }
  root.walkRules((node) => {
    const state = stateOf(node.selector);
    if (state === undefined) {
      return;
    }
    node.walkDecls((declaration) => {
      if (declaration.parent !== node) {
        return;
      }
      if (layoutProperty.test(declaration.prop.toLowerCase())) {
        report({
          ruleName,
          result,
          node: declaration,
          message: messages.rejected(declaration.prop, state),
        });
      }
    });
  });
};

rule.ruleName = ruleName;
rule.messages = messages;

export default createPlugin(ruleName, rule);
