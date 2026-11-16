import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/src-tauri/**",
      "spikes/**",
      "**/*.config.{js,ts}",
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },

  // Core must stay platform-neutral: no terminal/console output, no Node, no Tauri, no UI.
  {
    files: ["packages/core/**/*.ts"],
    rules: {
      "no-console": "error",
      "no-restricted-globals": [
        "error",
        { name: "process", message: "core must not depend on Node." },
        { name: "window", message: "core must not touch the DOM; inject what you need." },
        { name: "document", message: "core must not touch the DOM; inject what you need." },
        { name: "localStorage", message: "core must not own storage; the app persists state." },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["node:*"], message: "core must not depend on Node." },
            { group: ["@tauri-apps/*"], message: "core must not depend on Tauri; inject it." },
            { group: ["react", "react-dom", "react/*"], message: "core has no UI." },
            { group: ["**/apps/**", "lexi"], message: "core must not import from apps." },
          ],
        },
      ],
    },
  },

  {
    files: ["apps/lexi/src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat["recommended-latest"]],
    languageOptions: { globals: globals.browser },
  },

  prettier,
);
