import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const watch = process.argv.includes("--watch");

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("manifest.json", "dist/manifest.json");
cpSync("src/options/options.html", "dist/options.html");

const common = {
  bundle: true,
  target: "chrome120",
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
};

const builds = [
  // The service worker is declared with "type": "module".
  { ...common, entryPoints: { background: "src/background/index.ts" }, format: "esm", outdir: "dist" },
  { ...common, entryPoints: { content: "src/content/index.ts" }, format: "iife", outdir: "dist" },
  { ...common, entryPoints: { options: "src/options/options.ts" }, format: "iife", outdir: "dist" },
];

if (watch) {
  for (const options of builds) await (await esbuild.context(options)).watch();
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
}
