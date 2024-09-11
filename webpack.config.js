// webpack.config.js
const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const {BundleAnalyzerPlugin} = require('webpack-bundle-analyzer');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

const isProduction = false;
const useAnalyzer = false;

module.exports = {
    entry: {
        main: ['./src/index.ts']
    },
    output: {
        filename: 'index.js',
        path: path.resolve(__dirname, 'dist'),
        library: 'NarraleafReact',
        libraryTarget: 'umd',
        globalObject: 'this',
    },
    mode: isProduction ? 'production' : 'development',
    resolve: {
        extensions: ['.ts', '.tsx', '.js', '.jsx'],
        alias: {
            '@lib': path.resolve(__dirname, 'src/'),
            '@core': path.resolve(__dirname, 'src/game/nlcore/'),
            '@player': path.resolve(__dirname, 'src/game/player/'),
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
                use: [
                    {
                        loader: 'babel-loader',
                        options: {
                            presets: [
                                '@babel/preset-env',
                                '@babel/preset-react',
                                '@babel/preset-typescript'
                            ]
                        }
                    },
                    'ts-loader'
                ],
            },
        ]
    },
    externals: {
        react: {
            commonjs: 'react',
            commonjs2: 'react',
            amd: 'react',
            root: 'React'
        },
        'react-dom': {
            commonjs: 'react-dom',
            commonjs2: 'react-dom',
            amd: 'react-dom',
            root: 'ReactDOM'
        }
    },
    devtool: isProduction ? false : 'source-map',
    optimization: {
        minimize: isProduction,
        minimizer: isProduction ? [new TerserPlugin({
            extractComments: false,
        })] : [],
    },
    plugins: [
        ...(useAnalyzer ? [new BundleAnalyzerPlugin()] : []),
    ],
};