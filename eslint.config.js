// eslint.config.js
//
// Flat ESLint config. Two separate blocks below because src/ and
// pipeline/ run in different environments and shouldn't share globals
// or plugin rules: src/ is the browser-side React app (JSX, DOM
// globals, React Hooks rules), pipeline/ is a set of plain Node.js
// scripts (no JSX, no browser globals, no React).

import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  { ignores: ["dist", "node_modules"] },

  // src/: the browser-side React + TypeScript dashboard
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // Only the two classic hooks rules, NOT the plugin's full
      // "recommended" set. v7 of eslint-plugin-react-hooks bundles a
      // much stricter, forward-looking rule set aimed at React
      // Compiler compatibility (immutability, set-state-in-effect,
      // refs, and so on) that flags plenty of normal, working React
      // patterns already used throughout this codebase (e.g. resetting
      // state in an effect when a prop changes) as hard errors. Those
      // are a separate, much stricter style choice, not bugs, so only
      // rules-of-hooks (a real correctness rule) and exhaustive-deps
      // are enabled here.
      "react-hooks/rules-of-hooks": "error",
      // exhaustive-deps is the main payoff: MapView.tsx in particular
      // manages several effect dependency arrays by hand (using refs
      // specifically so certain effects DON'T re-run on every render;
      // see its own comments), which is exactly the kind of thing a
      // future edit can silently break. Kept at "warn" rather than
      // "error" since some deviations are intentional and already
      // documented in-file; a warning still surfaces every case for
      // review without failing the build.
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // This codebase deliberately casts to `any` in a handful of spots
      // where @arcgis/core's types are incomplete or its events use an
      // overloaded `on()` signature with no exported type (see the
      // comments at each usage in MapView.tsx); downgraded to a warning
      // rather than disabled outright, so new `any` usage still gets
      // flagged for a second look.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // pipeline/: plain Node.js scripts (fetch/geocode/cache/etc.)
  {
    files: ["pipeline/**/*.mjs"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node,
    },
  },
);