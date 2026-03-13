import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';

export default [
  // Browser bundle (IIFE)
  {
    input: 'src/js/get23_main.js',
    output: {
      file: 'dist/bundle.js',
      format: 'iife',
      name: 'get_23andme_data',
      sourcemap: true
    },
    plugins: [
      resolve({ browser: true }),
      commonjs(),
      json()
    ]
  },
  // All users data module (ESM bundle)
  {
    input: 'src/js/data/get23_allUsers.js',
    output: {
      file: 'dist/allUsers.bundle.mjs',
      format: 'es',
      sourcemap: true
    },
    plugins: [
      resolve({ browser: true }),
      commonjs(),
      json()
    ]
  },
  // Stats module (ESM bundle)
  {
    input: 'src/js/get23_loadStats.js',
    output: {
      file: 'dist/loadStats.bundle.mjs',
      format: 'es',
      sourcemap: true
    },
    plugins: [
      resolve({ browser: true }),
      commonjs(),
      json()
    ]
  },
  // ESM module
  {
    input: 'sdk.js',
    output: {
      file: 'dist/sdk.mjs',
      format: 'es',
      sourcemap: true
    },
    plugins: [
      resolve({ browser: true }),
      commonjs(),
      json()
    ]
  },
  // CommonJS module
  {
    input: 'sdk.js',
    output: {
      file: 'dist/sdk.cjs',
      format: 'cjs',
      sourcemap: true
    },
    plugins: [
      resolve({ browser: true }),
      commonjs(),
      json()
    ]
  }
];
