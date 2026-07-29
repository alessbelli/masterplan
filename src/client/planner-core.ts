// Browser entry point: bundle the pure domain logic so the UI can search,
// compute macros, optimize, and roll up shopping entirely client-side — the
// same code that's unit-tested for the server. Built to public/planner-core.js
// by `pnpm build:client` (esbuild).
export { dayMacros, itemMacros, type Macros } from "../domain/macros";
export { optimizeDay, type OptimizeItem, type OptimizeResult } from "../domain/optimize";
export { shoppingRollup, type ShoppingSourceItem } from "../domain/shopping";
