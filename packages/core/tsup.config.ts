import { defineConfig } from 'tsup'

// splitting keeps the WebGL tier in its own chunk, loaded only when it resolves (§10)
export default defineConfig({
  entry: ['src/index.ts', 'src/webgl.ts'],
  format: ['esm'],
  dts: true,
  splitting: true,
  minify: true,
  clean: true,
  target: 'es2022',
})
