import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import terser from '@rollup/plugin-terser';

export default [
  // Browser bundle (IIFE)
  {
    input: 'src/js/main.js',
    output: {
      file: 'dist/bundle.js',
      format: 'iife',
      name: 'get_23andme_data',
      sourcemap: true
    },
    plugins: [
      resolve(),
      commonjs(),
      json(),
      terser()
    ]
  },
  // ESM module
  {
    input: 'src/js/data/genomicData.js',
    output: {
      file: 'dist/sdk.mjs',
      format: 'es',
      sourcemap: true
    },
    plugins: [
      resolve(),
      commonjs(),
      json()
    ]
  },
  // CommonJS module
  {
    input: 'src/js/data/genomicData.js',
    output: {
      file: 'dist/sdk.cjs',
      format: 'cjs',
      sourcemap: true
    },
    plugins: [
      resolve(),
      commonjs(),
      json()
    ]
  }
];
