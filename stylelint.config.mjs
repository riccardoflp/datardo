// stylelint for Datardo: colors and sizes come from the tokens (R10.2). Only src/ui/theme/tokens.css holds literal
// values.
export default {
  extends: ['stylelint-config-standard'],
  plugins: ['stylelint-declaration-strict-value'],
  rules: {
    'selector-class-pattern': null,
    'custom-property-pattern': null,
    'color-no-hex': true,
    'color-named': 'never',
    'function-disallowed-list': ['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch'],
    'scale-unlimited/declaration-strict-value': [
      ['/color$/', 'background', 'font-size', 'border-radius', 'gap', 'z-index'],
      { ignoreValues: ['transparent', 'inherit', 'currentcolor', 'none', '0', 'initial', 'unset'] },
    ],
  },
  overrides: [
    {
      files: ['src/ui/theme/tokens.css'],
      rules: { 'color-no-hex': null, 'scale-unlimited/declaration-strict-value': null },
    },
  ],
};
