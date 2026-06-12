import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import sharedConfig from "./packages/eslint-config/index.js";

export default [
  {
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
  },
  {
    ignores: [
      "**/dist/**",
      "**/public/**",
      "**/node_modules/**",
      "data/**",
      "URD/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": {
        rules: {
          "exhaustive-deps": {
            meta: {
              type: "suggestion",
              docs: {
                description: "Placeholder for existing react-hooks disable comments.",
              },
              schema: [],
            },
            create() {
              return {};
            },
          },
        },
      },
    },
    rules: {
      ...(sharedConfig[0]?.rules ?? {}),
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    rules: {
      eqeqeq: ["error", "always"],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "error",
    },
  },
];
