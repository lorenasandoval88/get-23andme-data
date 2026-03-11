import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import terser from '@rollup/plugin-terser';

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
      json(),
      terser()
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
