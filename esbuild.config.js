// esbuild.config.js
import * as esbuild from "esbuild";
import fs from "fs/promises";
import process from "process";
import { compilePlayerCss, injectionModuleSource } from "./project/injectedCss.js";

const isProduction = process.env.NODE_ENV === "production";
const external = [
  // React and React DOM
  "react",
  "react-dom",
  // Dependencies
  "client-only",
  "clsx",
  "howler",
  "html-to-image",
  "prop-types",
  // Peer Dependencies
  "@emotion/is-prop-valid",
  "motion"
];

const InlineTailwindPlugin = {
  name: "inline-tailwind-css",
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, async (args) => {
      const css = await fs.readFile(args.path, "utf8");
      // The sheet goes into the host's page; see project/injectedCss.js for why it is scoped to
      // the player and layered before it goes in.
      return {
        contents: injectionModuleSource(await compilePlayerCss(css, args.path)),
        loader: "js",
      };
    });
  },
};

const sharedOptions = {
  bundle: true,
  sourcemap: !isProduction,
  minify: isProduction,
  target: ["es2020"],
  format: "esm",
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
  },
  loader: {
    ".css": "file",
    ".png": "file",
    ".svg": "file",
  },
};

Promise.all([
  esbuild.build({
    ...sharedOptions,
    entryPoints: ["./src/index.ts"],
    outfile: "dist/main.js",
    plugins: [InlineTailwindPlugin],
    external,
  }),
  esbuild.build({
    ...sharedOptions,
    entryPoints: ["./src/built-in.ts"],
    outfile: "dist/built-in.js",
    external: [
      ...external,
      "narraleaf-react",
    ],
  }),
]).catch(() => process.exit(1));
