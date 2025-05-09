// esbuild.config.js
import * as esbuild from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import autoprefixer from "autoprefixer";
import fs from "fs/promises";
import process from "process";

const isProduction = process.env.NODE_ENV === "production";

const InlineTailwindPlugin = {
  name: "inline-tailwind-css",
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, async (args) => {
      const css = await fs.readFile(args.path, "utf8");
      const result = await postcss([tailwindcss, autoprefixer]).process(css, {
        from: args.path,
      });

      const jsContent = `
        if (typeof document !== "undefined") {
          const style = document.createElement("style");
          style.textContent = ${JSON.stringify(result.css)};
          document.head.appendChild(style);
        }
      `;

      return {
        contents: jsContent,
        loader: "js",
      };
    });
  },
};

esbuild.build({
  entryPoints: ["./src/index.ts"],
  bundle: true,
  sourcemap: !isProduction,
  minify: isProduction,
  target: ["es2020"],
  outfile: "dist/main.js",
  format: "esm",
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
  },
  plugins: [InlineTailwindPlugin],
  loader: {
    ".css": "file",
    ".png": "file",
    ".svg": "file",
  },
  external: ["react", "react-dom"],
}).catch(() => process.exit(1));
