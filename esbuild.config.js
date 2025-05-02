// esbuild.config.js
const esbuild = require("esbuild");
const path = require("path");
const postCssPlugin = require("esbuild-plugin-postcss2");
// Use the new PostCSS package for Tailwind CSS
const tailwindPostcss = require("@tailwindcss/postcss");
const autoprefixer = require("autoprefixer");

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
    postCssPlugin.default({
      plugins: [
        // Replace direct tailwindcss plugin with @tailwindcss/postcss
        tailwindPostcss(path.resolve(__dirname, "tailwind.config.js")),
        autoprefixer,
      ],
    }),
  ],
  loader: {
    ".png": "file",
    ".svg": "file",
    ".css": "css",
  },
  external: ["react", "react-dom"],
}).catch(() => process.exit(1));