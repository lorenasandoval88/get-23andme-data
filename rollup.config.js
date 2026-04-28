import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';

const plugins = [
      resolve({ browser: true , preferBuiltins: false      }),
      commonjs(),
      json()
    ]

export default [
  // App bootstrap bundle (ESM)
  {
    input: 'src/js/get23_main.js',
    output: {
      file: 'dist/main.mjs',
      format: 'es',
      sourcemap: true
    },
    plugins
  },
  // All users data module (ESM bundle)
  {
    input: 'src/js/get23_allUsers.js',
    output: {
      file: 'dist/allUsers.bundle.mjs',
      format: 'es',
      sourcemap: true
    },
    plugins
  },
  // Stats module (ESM bundle)
  {
    input: 'src/js/get23_loadStats.js',
    output: {
      file: 'dist/loadStats.bundle.mjs',
      format: 'es',
      sourcemap: true
    },
    plugins
  },
  // ESM module
  {
    input: 'sdk.js',
    output: {
      file: 'dist/sdk.mjs',
      format: 'es',
      sourcemap: true
    },
    plugins
  }
];
