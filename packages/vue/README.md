# retro-crt

A CRT monitor effect your content renders *inside*. Curvature, bloom and chromatic aberration apply
to the real pixels of whatever you wrap, not a scanline sticker on top.

Zero runtime dependencies. 9.3 KB gzipped.

## Install

```bash
npm install retro-crt                      # plain JS
npm install retro-crt @retro-crt/react     # or /vue, /svelte, /solid, /angular
```

## Use it

```js
import { CRT } from 'retro-crt'
import 'retro-crt/styles.css'

const screen = CRT.mount('#app', { curvature: 0.4 })

screen.update({ curvature: 0.7 })
screen.activeRenderer // 'webgl' | 'svg' | 'css'
screen.destroy()
```

```jsx
import { CRTScreen } from '@retro-crt/react'
import 'retro-crt/styles.css'

<CRTScreen curvature={0.4} scanlines={{ intensity: 0.6 }}>
  <App />
</CRTScreen>
```

Every adapter takes the same plain `CRTOptions` object. All adapters are SSR-safe. To wrap a whole
page, call `CRT.mountFullPage()`.

> **Wrapping content breaks `position: fixed` inside it.** A CSS filter makes its element the
> containing block for every fixed descendant. Use `CRT.mountFullPage()` for a whole page, which the
> spec exempts.

## Renderers

`renderer: 'auto'` picks one of three tiers from measured facts, never the user-agent string.

| | `webgl` | `svg` | `css` |
|---|---|---|---|
| Curvature | true barrel | approximation | edge shading |
| Chromatic aberration | yes | yes | no |
| Persistence | yes | no | no |
| Content stays interactive | **no** | yes | yes |
| Picked for | a lone image, video or canvas | Chrome and Firefox on desktop | Safari over animating content, low-end devices |

The WebGL tier is a separate chunk that loads only when something uses it.

## Options

```ts
interface CRTOptions {
  renderer?: 'auto' | 'webgl' | 'svg' | 'css'        // 'auto'
  background?: string                                // '#000000'
  curvature?: number                                 // 0-1, 0.3
  vignette?: number                                  // 0-1, 0.5
  scanlines?: { intensity?: number; gap?: number; flicker?: boolean }   // 0.5, 3px, false
  tint?: { preset?: 'default' | 'green' | 'amber' | 'blue' | 'violet' | 'lime' | 'pink' | 'red'
           strength?: number }                       // 'default', 0.35
  bloom?: { enabled?: boolean; radius?: number; strength?: number; threshold?: number }
  chromaticAberration?: { intensity?: number }       // 0-6px, 0.6
  noise?: { enabled?: boolean; static?: number }     // true, 0.04
  persistence?: { strength?: number }                // 0-0.5, 0 (webgl only)
  bezel?: { enabled?: boolean; thickness?: number; radius?: { outer?: number; screen?: number }
            color?: string; bevel?: number; lightAngle?: number; innerLip?: number
            screenSpill?: number; glare?: number; shadow?: boolean }
  quality?: 'auto' | 'high' | 'balanced' | 'low'     // 'auto'
  maxPixelRatio?: number                             // 2
  pauseWhenOffscreen?: boolean                       // true
  respectReducedMotion?: boolean                     // true
  respectSaveData?: boolean                          // true
}
```

Out-of-range numbers clamp. Unknown values fall back to the default. `background` and `bezel.color`
accept `#rgb`, `#rrggbb` and `rgb()` only. When a renderer cannot honour an option you set, it
ignores it and warns once in development.

`prefers-reduced-motion` stops flicker, grain and persistence. `prefers-reduced-transparency` halves
tint and bloom. Save-Data forces the CSS tier. Effect layers are `aria-hidden` and
`pointer-events: none`.

## License

MIT
