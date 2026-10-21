// Bundles three.js into one classic script (global THREE) for the sandboxed simulation frames.
// Run: node scripts/build-sim-three.mjs   (output: public/sim/three.min.js, committed)
import { build } from "esbuild";
await build({
  stdin: { contents: 'import * as THREE from "three"; globalThis.THREE = THREE;', resolveDir: process.cwd(), loader: "js" },
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2019",
  outfile: "public/sim/three.min.js",
  legalComments: "none",
});
console.log("built public/sim/three.min.js");
