import { transformAsync } from '@babel/core'
import { readFile } from 'node:fs/promises'
import { defineConfig, type Options } from 'tsup'

const shared: Options = { entry: ['src/index.tsx'], format: ['esm'], external: ['solid-js', 'retro-crt'], target: 'es2022' }

// Two outputs, as Solid libraries conventionally ship: raw JSX under the `solid` condition for
// consumers' own compiler (SSR-aware), and a DOM-compiled build for everything else.
export default defineConfig([
  { ...shared, dts: true, clean: true, esbuildOptions: (o) => void (o.jsx = 'preserve'), outExtension: () => ({ js: '.jsx' }) },
  {
    ...shared,
    minify: true,
    esbuildPlugins: [
      {
        name: 'solid',
        setup(build) {
          build.onLoad({ filter: /\.tsx$/ }, async ({ path }) => {
            const result = await transformAsync(await readFile(path, 'utf8'), {
              filename: path,
              presets: ['babel-preset-solid', ['@babel/preset-typescript', { isTSX: true, allExtensions: true }]],
            })
            return { contents: result?.code ?? '', loader: 'js' }
          })
        },
      },
    ],
  },
])
