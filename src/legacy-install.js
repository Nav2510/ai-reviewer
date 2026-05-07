// Fallback shim used when dist/install.js is unavailable (e.g., dev install before build).
console.log(
  "[ai-reviewer] dist not built yet; skipping postinstall workflow copy. Run `npm run build` and reinstall, or use the composite action.",
);
