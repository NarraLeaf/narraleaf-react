const esbuild = require('esbuild');
const alias = require('esbuild-plugin-alias');
const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';

async function build() {
  try {
    const result = await esbuild.build({
      entryPoints: ['src/index.ts'],
      bundle: true,
      outfile: 'dist/main.js',
      platform: 'browser',
      target: ['es2020'],
      format: 'esm',
      minify: isProduction,
      sourcemap: 'external',
      external: ['react', 'react-dom', '@emotion/is-prop-valid'],
      plugins: [
        alias({
          '@lib': path.resolve(__dirname, 'src/'),
          '@core': path.resolve(__dirname, 'src/game/nlcore/'),
          '@player': path.resolve(__dirname, 'src/game/player/'),
        }),
      ],
      loader: {
        '.ts': 'ts',
        '.tsx': 'tsx',
        '.css': 'css',
      },
      define: {
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
      },
      tsconfig: 'tsconfig.json',
      resolveExtensions: ['.ts', '.tsx', '.js', '.jsx'],
      mainFields: ['module', 'main'],
      preserveSymlinks: true,
      treeShaking: true,
      logLevel: 'info',
    });

    console.log('Build completed successfully!');
    return result;
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build(); 