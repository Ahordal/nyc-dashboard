export default {
  extends: 'stylelint-config-standard',
  rules: {
    // Flags plain descendant overrides declared after a more specific
    // state/context selector (e.g. :focus, :disabled, a parent
    // data-attribute) even when they touch disjoint properties and never
    // actually collide - a false positive on this codebase's component-
    // scoped override style, not a real cascade bug.
    'no-descending-specificity': null,
  },
  overrides: [
    {
      // Esri's own BEM (double-underscore) class names, not ours to rename.
      files: ['src/styles/esri-overrides.css'],
      rules: {
        'selector-class-pattern': null,
      },
    },
  ],
};
