import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const config = [
  {
    ignores: [
      ".next/**",
      ".next-preseason/**",
      ".next-in-season/**",
      "node_modules/**",
      // Subagent worktrees: stale checkout copies, linted in their own runs.
      ".claude/**",
      "next-env.d.ts",
      "docs/**",
      "_bmad-output/**",
      "_work/**",
      "playwright-report/**",
      "test-results/**",
      "drizzle/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    rules: {
      // New in eslint-plugin-react-hooks v6 (React Compiler rules). Five hits,
      // all the "reset or sync state when a prop flips" pattern in existing
      // client islands. Kept visible as a warning rather than silenced or
      // refactored under a tooling PR.
      "react-hooks/set-state-in-effect": "warn",
      // The repo already uses a leading underscore for deliberate throwaways.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
];

export default config;
