/**
 * Combat Terminal — esbuild bundler script
 * Replaces Vite for environments where rollup native binaries aren't available.
 *
 * Usage:  node build.mjs
 */

import { build } from "esbuild";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src       = (...p) => resolve(__dirname, "src", ...p);
const out       = (...p) => resolve(__dirname, "dist", ...p);

mkdirSync(out("assets"), { recursive: true });

// ─── JS bundle ───────────────────────────────────────────────────────────────

await build({
  entryPoints:    [src("main.jsx")],
  bundle:         true,
  outfile:        out("assets", "main.js"),
  format:         "esm",
  jsx:            "automatic",
  jsxImportSource:"react",
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  // Path aliases (matches vite.config.js resolve.alias)
  alias: {
    "@":        src(),              // @/components/... → src/components/...
    "recharts": src("recharts-mock.js"),
  },
  // CSS is handled separately by Tailwind — skip it inside the JS bundle
  loader: { ".css": "empty" },
  minify:    true,
  sourcemap: false,
  logLevel:  "info",
});

console.log("[build] JS bundle complete → dist/assets/main.js");
