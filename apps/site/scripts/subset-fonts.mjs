// Cascadia ships every script it supports; this site renders Latin. Subsetting drops ~87% of the
// bytes and is the largest single saving available on first paint. Sources stay in fonts/source.
import subsetFont from 'subset-font'
import { readFileSync, writeFileSync, statSync } from 'node:fs'

const DIR = new URL('../app/fonts/', import.meta.url)
const FACES = ['CascadiaMono', 'CascadiaCode']

// Printable ASCII, Latin-1, and the typographic marks the UI and copy actually use.
const ranges = [
  [0x20, 0x7e],
  [0xa0, 0xff],
]
let chars = ranges.map(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => String.fromCharCode(a + i)).join('')).join('')
chars += '‘’“”–—…·×÷°±≈≤≥→←↑↓✓✕•€£¥™©®№'

const fresh = (src, out) => {
  try {
    return statSync(out).mtimeMs > statSync(src).mtimeMs && statSync(out).mtimeMs > statSync(new URL(import.meta.url)).mtimeMs
  } catch {
    return false
  }
}

for (const face of FACES) {
  const src = new URL(`source/${face}.woff2`, DIR)
  const out = new URL(`${face}.woff2`, DIR)
  if (fresh(src, out)) continue
  const input = readFileSync(src)
  const subset = await subsetFont(input, chars, { targetFormat: 'woff2' })
  writeFileSync(out, subset)
  console.log(`${face}: ${(input.length / 1024) | 0} KB -> ${(subset.length / 1024) | 0} KB`)
}
