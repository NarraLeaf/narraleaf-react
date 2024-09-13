/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-require-imports */

const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");
const {BundleAnalyzerPlugin} = require("webpack-bundle-analyzer");
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin");

const isProduction = process.env.npm_lifecycle_event === "publish" || process.env.npm_lifecycle_event === "build:prod";
const useAnalyzer = process.env.npm_lifecycle_event === "build:analyze";

console.log(`
${new Date().toLocaleString()}
> Webpack is in ${isProduction ? "production" : "development"} mode.
> Bundle analyzer is ${useAnalyzer ? "enabled" : "disabled"}.
`);

module.exports = {
    entry: {
        main: ["./src/index.ts"]
    },
    output: {
        filename: (!useAnalyzer) ? "index.js" : "[name].[contenthash].js",
        path: path.resolve(__dirname, "dist"),
        library: "NarraleafReact",
        libraryTarget: "umd",
        globalObject: "this",
    },
    mode: isProduction ? "production" : "development",
    resolve: {
        extensions: [".ts", ".tsx", ".js", ".jsx"],
        alias: {
            "@lib": path.resolve(__dirname, "src/"),
            "@core": path.resolve(__dirname, "src/game/nlcore/"),
            "@player": path.resolve(__dirname, "src/game/player/"),
        },
        plugins: [
            new TsconfigPathsPlugin({configFile: "./tsconfig.json"})
        ]
    },
    module: {
        rules: [
            {
                test: /\.(ts|tsx)$/,
                exclude: /node_modules/,
                include: path.resolve(__dirname, "src"),
                use: [
                    {
                        loader: "babel-loader",
                        options: {
                            cacheDirectory: true,
                            presets: [
                                "@babel/preset-env",
                                "@babel/preset-react",
                                "@babel/preset-typescript"
                            ]
                        }
                    },
                    "ts-loader"
                ],
            },
            {
                test: /\.css$/,
                use: [
                    "style-loader",
                    "css-loader",
                    "postcss-loader",
                ],
            },
        ]
    },
    externals: {
        react: {
            commonjs: "react",
            commonjs2: "react",
            amd: "react",
            root: "React"
        },
        "react-dom": {
            commonjs: "react-dom",
            commonjs2: "react-dom",
            amd: "react-dom",
            root: "ReactDOM"
        }
    },
    devtool: isProduction ? false : "source-map",
    optimization: {
        minimize: isProduction,
        minimizer: isProduction ? [new TerserPlugin({
            extractComments: false,
        })] : [],
        ...(
            (!useAnalyzer) ? {} : {
                splitChunks: {
                    chunks: "all",
                    cacheGroups: {
                        vendor: {
                            test: /[\\/]node_modules[\\/]/,
                            name: "vendors",
                            chunks: "all",
                        },
                    },
                },
            }
        )
    },
    plugins: [
        ...(useAnalyzer ? [new BundleAnalyzerPlugin()] : []),
    ],
};