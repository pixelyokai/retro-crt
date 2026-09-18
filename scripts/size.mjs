// Measures shipped bundles against the §10 budget (gzipped).
import { readFileSync, readdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { buildSync } from 'esbuild'

const gz = (code) => gzipSync(code).length
const core = readdirSync('packages/core/dist').filter((f) => f.endsWith('.js'))
const webgl = gz(readFileSync('packages/core/dist/webgl.js'))
const initial = core.filter((f) => f !== 'webgl.js').reduce((n, f) => n + gz(readFileSync(`packages/core/dist/${f}`)), 0)
const min = (file) => gz(buildSync({ entryPoints: [file], bundle: false, minify: true, write: false, format: 'esm', loader: { '.svelte': 'text' } }).outputFiles[0].contents)
const adapters = {
  react: min('packages/react/dist/index.js'),
  vue: min('packages/vue/dist/index.js'),
  solid: min('packages/solid/dist/index.js'),
  svelte: gz(readFileSync('packages/svelte/dist/CRTScreen.svelte')),
  angular: min('packages/angular/dist/fesm2022/retro-crt-angular.mjs'),
}
const rows = [['core (initial)', initial, 15000], ['core webgl chunk (lazy)', webgl, Infinity], ...Object.entries(adapters).map(([k, v]) => [`@retro-crt/${k}`, v, 2000])]
let failed = false
for (const [name, size, limit] of rows) {
  const ok = size <= limit
  failed ||= !ok
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(26)} ${(size / 1024).toFixed(2)} KB${limit === Infinity ? '' : ` / ${limit / 1000} KB`}`)
}
process.exit(failed ? 1 : 0)
