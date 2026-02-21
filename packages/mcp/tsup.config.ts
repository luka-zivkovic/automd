import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  noExternal: [/.*/],
  banner: {
    js: '#!/usr/bin/env node',
  },
  dts: false,
  sourcemap: false,
})
