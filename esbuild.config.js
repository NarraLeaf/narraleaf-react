// esbuild.config.js
import * as esbuild from "esbuild";
import postcss from "postcss";
import postcssPresetEnv from "postcss-preset-env";
import fs from "fs";
import process from "process";

const isProduction = process.env.NODE_ENV === "production";

esbuild.build({
  entryPoints: ["./src/index.ts"],
  bundle: true,
  sourcemap: !isProduction,
  minify: isProduction,
  target: ["es2020", "chrome58", "firefox57", "safari11"],
  outfile: "dist/main.js",
  format: "esm",
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
  },
  plugins: [
    {
      name: "postcss",
      setup(build) {
        build.onLoad({ filter: /\.css$/ }, async (args) => {
          const css = await fs.promises.readFile(args.path, "utf8");
          const result = await postcss([
            postcssPresetEnv()
          ]).process(css, { from: args.path });
          
          // Create a style element with the processed CSS
          const styleContent = `
            const style = document.createElement("style");
            style.textContent = ${JSON.stringify(result.css)};
            document.head.appendChild(style);
          `;
          
          return {
            contents: styleContent,
            loader: "js"
          };
        });
      }
    }
  ],
  loader: {
    ".png": "file",
    ".svg": "file",
    ".css": "css",
  },
  external: ["react", "react-dom"],
}).catch(() => process.exit(1));