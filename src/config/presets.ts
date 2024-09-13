import type { ConfigInput } from "./schema.js";

export const PRESETS: Record<string, Partial<ConfigInput>> = {
  "preset:react": {
    review: {
      include: ["**/src/**/*.{ts,tsx,js,jsx}"],
      exclude: ["**/*.test.*", "**/*.stories.*", "dist/**", "build/**"],
    },
    rules: [
      { id: "react-no-inline-fn", description: "Avoid inline arrow functions in JSX props in hot paths.", severity: "suggestion" },
      { id: "react-key-prop", description: "List items must have stable, unique keys.", severity: "issue" },
    ],
  },
  "preset:node": {
    review: {
      include: ["**/src/**/*.{ts,js}"],
      exclude: ["**/*.test.*", "dist/**", "node_modules/**"],
    },
    rules: [
      { id: "node-no-sync-fs", description: "Avoid sync fs APIs on hot paths.", severity: "suggestion" },
      { id: "node-error-handling", description: "Don't swallow errors silently.", severity: "issue" },
    ],
  },
  "preset:python": {
    review: {
      include: ["**/*.py"],
      exclude: ["**/test_*.py", "**/*_test.py", "venv/**", ".venv/**"],
    },
    rules: [
      { id: "py-typing", description: "Public functions should have type hints.", severity: "suggestion" },
    ],
  },
  "preset:go": {
    review: {
      include: ["**/*.go"],
      exclude: ["**/*_test.go", "vendor/**"],
    },
    rules: [
      { id: "go-error-wrap", description: "Wrap errors with context using fmt.Errorf(\"%w\", err).", severity: "suggestion" },
    ],
  },
};
