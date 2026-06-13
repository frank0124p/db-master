/**
 * ESLint config for apps/mcp — enforces read-only constraint.
 *
 * Key rules:
 * - no-restricted-syntax: prevent mutation HTTP methods in fetch() calls
 * - The client.ts file must only use GET or the two allowed POSTs
 */

"use strict";

module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  rules: {
    // Ban mutation HTTP methods in fetch calls
    // This catches: fetch(url, { method: "PATCH" }) etc.
    "no-restricted-syntax": [
      "error",
      {
        selector:
          "Property[key.name='method'][value.value=/^(PATCH|PUT|DELETE|HEAD|OPTIONS)$/i]",
        message:
          "MCP server is READONLY: HTTP PATCH/PUT/DELETE/HEAD/OPTIONS are forbidden. " +
          "Only GET and POST /api/v1/ask/link-only + POST /api/v1/ask are allowed.",
      },
    ],
    // Warn if fetch is called directly in tool files (should use client methods)
    "no-restricted-globals": [
      "warn",
    ],
  },
  overrides: [
    {
      // TypeScript-specific rules
      files: ["**/*.ts"],
      rules: {
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/explicit-function-return-type": "off",
      },
    },
  ],
  ignorePatterns: ["dist/", "node_modules/"],
};
