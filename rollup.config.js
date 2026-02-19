import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import terser from '@rollup/plugin-terser';

export default {
  input: 'index.js',
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
};
