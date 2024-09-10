const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

module.exports = {
    entry: {
        main: './src/index.ts',
        vendor: ['react', 'react-dom']
    },
    output: {
        filename: '[name].[contenthash].js',
        path: path.resolve(__dirname, 'dist'),
        library: 'NarraleafReact',
        libraryTarget: 'umd',
        globalObject: 'this'
    },
    mode: 'production',
    resolve: {
        extensions: ['.ts', '.tsx', '.js', '.jsx'],
        alias: {
            react: path.resolve('./node_modules/react'),
            'react-dom': path.resolve('./node_modules/react-dom'),
            '@lib': path.resolve(__dirname, 'src/'),
            '@core': path.resolve(__dirname, 'src/game/nlcore/'),
            '@player': path.resolve(__dirname, 'src/game/player/'),
        },
    },
    module: {
        rules: [
            {
                test: /\.(js|jsx|ts|tsx)$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: [
                            '@babel/preset-env',
                            '@babel/preset-react',
                            ['@babel/preset-typescript', { allowDeclareFields: true }]
                        ]
                    },
                },
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
    devtool: false,
    optimization: {
        splitChunks: {
            chunks: 'all',
        },
        minimize: true,
        minimizer: [new TerserPlugin({
            extractComments: false,
        })],
    },
    plugins: [
        new BundleAnalyzerPlugin(),
    ],
};