# retro-crt — Product Requirements Document

A framework-agnostic library that renders a convincing CRT monitor effect, plus
a site with two modes: tune-and-export-code, and apply-to-your-own-media.

**Status:** Pre-build spec
**Deployment:** Vercel (site), npm (library)
**License:** MIT

---

## 1. What this is

Most web CRT effects are a semi-transparent PNG of scanlines laid over the
page. They read as a sticker, not a screen, because nothing about the content
underneath actually changes — no curvature, no bloom around bright pixels, no
colour fringing.

`retro-crt` does the opposite: content renders **inside** the effect, so the
distortion applies to the actual pixels of whatever is wrapped. It also ships
the cheap overlay mode, because sometimes that's all you can do — but it's
labelled honestly rather than sold as the real thing.

### Goals, in priority order

1. **Performance.** 60fps on a mid-range phone, not just a dev's laptop.
2. **Universal compatibility.** Every modern browser including Safari/iOS,
   every device class. Degrades visibly-differently but never breaks.
3. **Responsiveness.** Correct at any viewport, any DPR, any orientation.
4. Framework support: React, Vue, Svelte, Solid, Angular, plain JS.
5. Two ways to use it: export a tuned config as code, or apply the effect to
   your own image/video and export the asset — all client-side.

Priorities 1–3 outrank visual fidelity. **A beautiful effect that janks on a
phone or vanishes in Safari is a failed build.** Where fidelity and performance
conflict, performance wins and the docs explain the tradeoff.

### Non-goals
- Not a terminal emulator or text-rendering library
- Not a full retro UI kit (8bitcn covers that)
- Not a video post-processing pipeline
- Not IE11

---

## 2. Browser reality check

This section exists because the naive implementation of this library
**silently fails in Safari**, and that has to shape the architecture rather
than be patched in later.

### 2.1 Known WebKit defects that constrain the design

| Issue | Impact | Reference |
|---|---|---|
| WebKit does not support `url(#…)` SVG filter references in its **accelerated (compositing) codepath** — only the static one | SVG filters silently stop applying to **moving/animating content** in Safari. That is our primary use case. | [webkit #184601](https://bugs.webkit.org/show_bug.cgi?id=184601), open since 2018 |
| `backdrop-filter: url(#…)` does nothing in Safari (macOS + iOS) | No SVG-filter path for overlay mode in Safari | [webkit #245510](https://bugs.webkit.org/show_bug.cgi?id=245510) |
| CSS `filter` on inline SVG has historically made elements vanish on iOS | Must not assume filter-on-SVG works | long-standing iOS behaviour |
| `feDisplacementMap` output colour-space handling differs between WebKit and Gecko | Barrel distortion renders at different brightness across engines unless pinned | [w3c #11015](https://www.w3.org/Bugs/Public/show_bug.cgi?id=11015) |

**Mandatory mitigations:**
- Set `color-interpolation-filters="sRGB"` explicitly on every filter
  primitive. Never rely on the default.
- Never assume an SVG filter applied. Detect, don't hope (§3.3).
- Treat Safari's static-vs-accelerated split as the reason the `svg` tier
  cannot be the universal default.

### 2.2 Support matrix

| Browser | Minimum | Expected tier (§3.2) |
|---|---|---|
| Chrome / Edge | 111 | `webgl` or `svg` |
| Firefox | 113 | `svg` |
| Safari macOS | 16.4 | `webgl` for animated content, `css` fallback |
| Safari iOS | 16.4 | `css`; `webgl` only where measured safe |
| Samsung Internet | 23 | `svg` |
| Chrome Android | 111 | `svg` or `css` by device class |

Every tier must produce a *recognisably CRT* result. `css` is not a blank
fallback — it's a real, shippable effect with fewer features.

### 2.3 Media & export API reality (drives the Upload mode, §8.2)

| Capability | Reality | Consequence |
|---|---|---|
| `HTMLMediaElement.captureStream()` (`<video>`) | **Unsupported in Safari, macOS and iOS** | Never capture from the video element. Always draw to canvas and use `HTMLCanvasElement.captureStream()`, which Safari does support. |
| WebCodecs `VideoEncoder` | Chrome 94+, Firefox 130+ desktop, **Safari 26.0+ full**; Safari 16.4–18.7 **video interfaces only, no `AudioEncoder`** | Primary export path where available — encodes faster than real time. Must feature-detect, not assume. |
| `MediaRecorder` | Safari 14.1+ macOS / 14.5+ iOS. **Real-time only** — a 30s clip takes 30s to export. Safari wrote MP4/H.264 only until 18.4, which added WebM. | Universal fallback. Output container differs by browser; always call `MediaRecorder.isTypeSupported()` before choosing a MIME type. |
| `OffscreenCanvas.captureStream()` | Does not exist | The MediaRecorder path cannot run in a worker. Main thread only. |

**Export strategy:** WebCodecs when `VideoEncoder` is available (mux with a
WebM/MP4 muxer), else `MediaRecorder` from `canvas.captureStream()`. Tell the
user which path they're on and, on the MediaRecorder path, that export takes
roughly the clip's duration — with a live progress indicator, not a spinner.

**Audio:** on Safari 16.4–18.7 `AudioEncoder` is undefined. v1 strips audio on
the WebCodecs path and states so in the UI. Audio passthrough is a v2 problem
(§15).

---

## 3. Architecture

```
packages/
  core/           framework-agnostic. Zero runtime deps. All logic.
  react/  vue/  svelte/  solid/  angular/     thin adapters
apps/
  site/           /code + /upload (Next.js → Vercel)
```

The core owns all rendering. Adapters handle only lifecycle and idiomatic API
shape. A barrel-distortion fix must never require touching six packages.

**The site is not part of the library.** It depends on `dialkit`; the
published packages must not. Keep that boundary strict (§8).

### 3.1 Placement: how the effect relates to content

**`mask`** — content renders *inside* the CRT. The effect applies to a wrapper,
so everything within inherits it. This is the mode that looks real.

```
┌─ CRT wrapper (effect applied here) ──┐
│  ┌────────────────────────────────┐  │
│  │ your content — DOM, iframe,    │  │
│  │ canvas, whatever               │  │
│  └────────────────────────────────┘  │
│  bezel + glare on top, unfiltered    │
└──────────────────────────────────────┘
```

**`overlay`** — `position: fixed; inset: 0; pointer-events: none` layer above
the page. Additive layers only: scanlines, tint, bloom glow, static, vignette.

**Overlay cannot do curvature.** You cannot displace pixels already painted
beneath a fixed element, and `backdrop-filter: url()` is unsupported in Safari
(§2.1), so there's no backdrop-displacement path either. `curvature` is ignored
in overlay mode with a one-time dev warning. Vignette can *imply* curvature; it
does not create it.

### 3.2 Renderer tiers

Three tiers, not two. Each is a complete, shippable effect.

**`webgl`** — content captured to a texture, post-processed in a fragment
shader. Highest fidelity; the only tier with true barrel distortion and
phosphor persistence. **Interactivity inside the screen is lost** unless the
consumer implements hit-testing. Right for a game canvas, hero banner, or
video. Wrong for a working UI.

**`svg`** — CSS + SVG filters. Keeps full DOM interactivity: links, inputs,
scroll, text selection. **Unreliable in Safari on animating content** (§2.1).

**`css`** — no SVG filters at all. Scanlines via `repeating-linear-gradient`,
tint via `mix-blend-mode`, vignette via `radial-gradient`, bloom approximated
with a duplicated blurred layer, curvature omitted or faked with a mild
`perspective` transform. Full interactivity, works **everywhere**, cheapest to
run. This is the mobile and Safari-with-animation default.

**`auto`** (default) — capability detection picks the best safe tier for the
browser, device class, and content (§3.3).

### 3.3 Capability detection & tier selection

`auto` decides from measured facts, never a user-agent string.

1. **Feature probe at init** (once, cached): render a 2×2 offscreen probe with
   a known SVG filter and read back a pixel. If the filter didn't apply, `svg`
   is unavailable.
2. **Safari accelerated-path probe:** apply the same probe to an element with
   an active transform/animation. If the filter applies statically but not when
   animated, mark `svg` *static-only* and fall to `css` whenever the wrapped
   content animates.
3. **WebGL probe:** context creation plus a shader compile. Failure → not
   available.
4. **Device-class heuristic:** `navigator.hardwareConcurrency`,
   `navigator.deviceMemory`, DPR. Low-end → prefer `css` even if `svg` probes
   fine.
5. **Runtime downgrade:** sample frame time for ~2s after mount. If median
   frame time exceeds budget (§10), drop one tier and emit a dev-only notice.
   One-way within a session, to avoid oscillation.

Expose the resolved tier as `screen.activeRenderer` and surface it in the
site, so users always know which tier they're seeing.

---

## 4. Effect properties

This table is the source of truth. Unsupported combinations no-op silently in
production and warn once in development.

| Property | `webgl` | `svg` | `css` | overlay |
|---|---|---|---|---|
| `curvature` | full | approx. | faked/off | ✗ |
| `vignette` | ✓ | ✓ | ✓ | ✓ |
| `scanlines.intensity` | ✓ | ✓ | ✓ | ✓ |
| `scanlines.gap` | ✓ | ✓ | ✓ | ✓ |
| `scanlines.flicker` | ✓ | ✓ | ✓ | ✓ |
| `tint.preset` | ✓ | ✓ | ✓ | ✓ |
| `tint.strength` | ✓ | ✓ | ✓ | ✓ |
| `bloom.*` | ✓ | ✓ | approx. | partial |
| `fringe.intensity` | ✓ | ✓ | ✗ | ✗ |
| `noise.static` | ✓ | ✓ | ✓ | ✓ |
| `persistence.strength` | ✓ | ✗ | ✗ | ✗ |
| `bezel.*` | ✓ | ✓ | ✓ | ✓ |

### 4.1 Schema

```ts
interface CRTOptions {
  mode?: 'mask' | 'overlay'                    // default 'mask'
  renderer?: 'auto' | 'webgl' | 'svg' | 'css'  // default 'auto'

  curvature?: number                   // 0–1,   default 0.3
  vignette?: number                    // 0–1,   default 0.5

  scanlines?: {
    intensity?: number                 // 0–1,   default 0.5
    gap?: number                       // 1–8 CSS px, default 3
    flicker?: boolean                  // default false
  }

  tint?: {
    preset?: 'default' | 'phosphor-green' | 'amber' | 'blue-white' | 'warm-white'
    strength?: number                  // 0–1,   default 0.35
  }

  bloom?: {
    enabled?: boolean                  // default true
    radius?: number                    // 0–40px, default 8
    strength?: number                  // 0–1,    default 0.4
    threshold?: number                 // 0–1,    default 0.6
  }

  fringe?: { intensity?: number }      // 0–6px, default 1.5

  noise?: {
    enabled?: boolean                  // default true
    static?: number                    // 0–0.3, default 0.04
  }

  persistence?: { strength?: number }  // 0–0.5, default 0 — webgl only

  bezel?: {
    enabled?: boolean                  // default false — opt-in, see §4.3
    thickness?: number                 // px, default 48
    radius?: { outer?: number; screen?: number }   // default 28 / 10
    color?: string                     // base housing colour, default '#6b5b4a'
    bevel?: number                     // 0–1, strength of the moulded 3D edge, default 0.6
    lightAngle?: number                // deg, default 315 (upper-left)
    innerLip?: number                  // 0–1, depth of the recessed rim, default 0.7
    screenSpill?: number               // 0–1, screen light bleeding onto the housing, default 0.35
    glare?: number                     // 0–1, diagonal glass reflection, default 0.2
    shadow?: boolean                   // outer drop shadow, default true
  }

  // performance & adaptation
  quality?: 'auto' | 'high' | 'balanced' | 'low'   // default 'auto'
  maxPixelRatio?: number               // default 2 — clamp DPR cost
  pauseWhenOffscreen?: boolean         // default true
  respectReducedMotion?: boolean       // default true
  respectSaveData?: boolean            // default true
}
```

### 4.2 Decisions worth defending

**`tint.preset: 'default'` is a true pass-through**, not neutral grey.
`tint.strength` stays in the API and the control sidebar when `default` is
selected but has no effect, so switching to a real preset applies at the
already-tuned strength instead of resetting. The sidebar should visually
de-emphasise the strength slider when preset is `default`.

**`bloom.threshold` is what separates bloom from "blur everything."** Real
phosphor blooms only where the beam is bright; without a threshold a dark UI
glows uniformly, which reads as a bug. Implemented as `feComponentTransfer`
(clamp below threshold) → `feGaussianBlur` → `feComposite`.

**`persistence` and `bloom` are separate controls.** Bloom is light bleeding
*within* a frame; persistence is the previous frame remaining *into the next*.
Different mechanisms, different looks.

**`noise.static` is not scanlines.** Scanlines are fixed bands; static is
per-frame grain. Both exist on real CRTs.

**`maxPixelRatio` defaults to 2.** On a 3× phone, rendering at full DPR triples
fragment cost for gain nobody perceives at that density.

**`quality` scales effect cost independently of renderer tier.** Tier answers
*how* the effect is computed; `quality` answers *how expensively*. They're
orthogonal — a `webgl` tier at `low` is valid, so is `css` at `high`.

| `quality` | Effect |
|---|---|
| `high` | Full-resolution effect buffer, largest bloom kernel, noise tiles at full size |
| `balanced` | Effect buffer at 0.75×, reduced bloom kernel, smaller noise tiles |
| `low` | Effect buffer at 0.5×, cheapest bloom, fewest noise tiles, flicker forced off |
| `auto` | Picked from the same device-class signals as tier selection (§3.3), and lowered first when runtime downgrade fires — dropping quality before dropping tier preserves more of the intended look |

Runtime downgrade order is therefore: `high → balanced → low → drop a tier`.
Losing a tier changes what the effect *is*; losing quality only changes how
finely it's rendered, so exhaust quality first.

### 4.3 The bezel (monitor frame)

An opt-in physical monitor housing around the screen. **Off by default**, and
when off it must contribute **zero bytes** to exported code and zero DOM nodes
at runtime — not a hidden element with `display: none`.

Built from five stacked layers, all pure CSS/SVG (never a bitmap):

1. **Housing** — rounded rect, `radius.outer`, filled with `color`.
2. **Bevel** — a gradient overlay derived from `color` and `lightAngle`:
   lighter along the lit edge, darker on the opposite one, producing the
   moulded-plastic read. `bevel` scales the contrast between them; at `0` the
   housing is flat.
3. **Inner lip** — a recessed dark rim where the housing meets the glass, at
   `radius.screen`. Depth from `innerLip`. This is what makes the screen look
   *inset* rather than pasted on, and is the single most important layer for
   believability.
4. **Screen spill** — a soft glow, sampled from the screen's dominant tint,
   bleeding onto the inner housing. `screenSpill` controls strength. Disable
   with `prefers-reduced-transparency`.
5. **Glare** — a low-opacity diagonal highlight across the glass. Purely
   decorative; `glare: 0` removes it.

**Colour derivation:** the user sets one `color`; bevel highlight, shadow, and
inner lip are derived from it in a perceptual space (OKLCH lightness steps) so
any hue produces a plausible moulded housing without the user tuning four
swatches. Advanced users can override individual layers, but the one-colour
path must look right on its own.

**Aspect ratio:** the bezel wraps whatever the screen's aspect is. In Upload
mode it follows the selected ratio (§8.2) exactly — no letterboxing inside the
frame.

**In overlay mode the bezel frames the viewport**, which means it will cover
page content at the edges — unavoidable, since a physical frame occupies
physical space. Default `bezel.enabled: false` already avoids this, but when a
user enables it in overlay mode, warn once in dev and note it in the docs.
Consumers wanting a frame around a *region* rather than the viewport should use
`mask` mode.

**Export rule:** `bezel.enabled: false` → no bezel markup, CSS, or options keys
in the exported snippet at all. The toggle governs the artefact, not just its
visibility.

---

## 5. Hard technical constraints

Document all of these publicly. Don't let users find them via bug reports.

### 5.1 `filter` breaks `position: fixed` descendants

A non-`none` `filter` on a non-root element creates a containing block for its
absolutely- and fixed-positioned descendants. Wrapping an app in `mask` mode
means **every fixed modal, sticky header, toast, and dropdown inside it anchors
to the CRT wrapper instead of the viewport.**

Mitigations, all required:
1. **Document above the fold** in the README, not in a FAQ.
2. **`mountFullPage()`** — the spec exempts the document root element, so a
   filter applied at the root does *not* create a containing block. This is the
   correct API for "make my whole site a CRT."
3. **Dev-mode detection** — on mount, scan descendants for computed
   `position: fixed` and warn once, naming the offending elements.

### 5.2 Safari's accelerated-filter gap

Covered in §2.1. The practical rule: **never let `svg` be the resolved tier in
Safari when the wrapped content animates.** The probe in §3.3 must catch this,
and `css` must be good enough to ship as the Safari-with-animation default.

### 5.3 Barrel distortion in `svg` is an approximation

True barrel distortion is per-pixel radial displacement. In `svg` it's
approximated via `feDisplacementMap` driven by a radial gradient map generated
once at init as a data URI and **cached per curvature value** — never
regenerated per frame. Convincing at low-to-moderate curvature, degrades at the
edges at high values. `webgl` does the real thing. Show both side by side in the
docs; don't claim the approximation is accurate.

### 5.4 Persistence is impossible outside `webgl`

SVG filters are stateless — they cannot sample the previous frame. Persistence
requires frame accumulation (WebGL ping-pong framebuffer, or canvas alpha-fade).
Setting it in any other tier is a no-op with a dev warning.

### 5.5 Text rasterisation

SVG filters rasterise their input, so filtered text loses subpixel antialiasing
and softens — more so at higher curvature. Authentic, but it hurts body-copy
readability. Document it; recommend low curvature for text-heavy UIs. The `css`
tier does not have this problem, which is a genuine point in its favour rather
than a consolation.

### 5.6 Accessibility

- Honour `prefers-reduced-motion`: disable `flicker`, animated `noise`, and
  `persistence`. Keep static geometry (curvature, vignette, scanlines).
- Honour `prefers-reduced-transparency` where available: reduce tint and bloom.
- Honour `navigator.connection.saveData`: force the `css` tier.
- Scanlines and tint reduce effective contrast. Document that a CRT-wrapped UI
  may fail WCAG contrast checks the unwrapped UI passes, and that consumers
  must verify at their chosen settings.
- Overlay must be `pointer-events: none` and `aria-hidden="true"`.
- The effect must never be the sole carrier of meaning.

---

## 6. Responsiveness & device support

### 6.1 Viewport and resize
- Effect geometry is resolution-independent: scanline `gap` is specified in CSS
  px and must render consistently across DPR.
- Recompute on resize and orientation change via a **`ResizeObserver` on the
  wrapper**, debounced ~100ms — never a `window.resize` listener, which misses
  container-driven size changes.
- Regenerate WebGL framebuffers and cached displacement maps on size change,
  but not on every intermediate frame of a drag-resize.
- Must work inside a CSS container query context, and inside flex/grid parents
  that change size without a viewport change.

### 6.2 Mobile specifics
- **Touch must pass through cleanly.** Verify scroll, tap, pinch-zoom, and
  long-press inside `mask` mode on real iOS and Android, not emulation.
- A scanline gap that looks right on desktop can alias badly on a 3× phone
  screen. Clamp effective gap to a minimum of 2 device pixels.
- Respect `maxPixelRatio` (default 2) so a 3× display doesn't triple cost.
- iOS Safari's dynamic viewport (collapsing URL bar) changes height mid-scroll:
  use `dvh`-aware sizing or observe the wrapper; never assume `100vh`.
- Test with iOS low-power mode active — it throttles frame rate and will expose
  any frame-budget assumptions.

### 6.3 Offscreen and background behaviour
- `pauseWhenOffscreen` (default true): `IntersectionObserver` pauses animated
  layers when the effect scrolls out of view.
- Pause on `visibilitychange` when the tab is hidden. Never keep a rAF loop
  running in a background tab.

---

## 7. Public API

Core is imperative; adapters are idiomatic. All accept the same `CRTOptions`.

### Plain JS
```js
import { CRT } from 'retro-crt'
import 'retro-crt/styles.css'

const screen = CRT.mount('#app', { curvature: 0.4 })
screen.update({ curvature: 0.7 })
screen.activeRenderer   // 'webgl' | 'svg' | 'css'
screen.destroy()

CRT.mountFullPage({ mode: 'overlay' })   // survives position: fixed (§5.1)
```

### React
```jsx
import { CRTScreen } from 'retro-crt/react'
<CRTScreen curvature={0.4} scanlines={{ intensity: 0.6 }}>
  <App />
</CRTScreen>
```

### Vue / Svelte / Solid
```html
<CRTScreen :curvature="0.4"><App /></CRTScreen>
```

### Angular
```html
<crt-screen [curvature]="0.4" [scanlines]="{ intensity: 0.6 }">
  <app-root></app-root>
</crt-screen>
```
Ship a standalone component plus a `[crtScreen]` attribute directive. Angular
is a stated goal — v1 does not ship without it.

### Config portability
Every adapter takes a plain `CRTOptions` object, so a config copied from the
site pastes into any framework unchanged.

### SSR
All adapters must render safely on the server: no `window`/`document` access at
module scope, no hydration mismatch. The effect initialises after mount.

---

## 8. The site — two modes

One Next.js app on Vercel, two routes. Shared effect engine, shared control
sidebar, different subjects.

- `/code` — tune the effect, export code to use in your own project
- `/upload` — apply the effect to your own image or video, export the asset

Shared shell: live preview **left**, control sidebar **right**. On narrow
viewports the sidebar becomes a bottom sheet — the site must itself satisfy §6.

**Controls:** [DialKit](https://www.dialkit.dev) (`npm install dialkit motion`),
schema mirroring §4.1, folders grouping scanlines / tint / bloom / noise /
bezel, `select` for `tint.preset` with `default` first.

**DialKit hides its editor in production unless `productionEnabled` is passed
to `<DialRoot>`.** Without it the deployed site ships with no visible controls.
Most likely deploy-day bug — verify on the preview URL before promoting.

**Show the resolved renderer tier prominently** in both modes, with a manual
override, so users can see what Safari gets versus Chrome. Include a live FPS
readout during tuning, so cost is felt while tuning rather than discovered in
production.

**DialKit has no Angular adapter.** Fine — it is site-only and must never
appear in a published package's `dependencies`. It does not constrain which
frameworks the library supports.

### 8.1 `/code` — export a configuration

- Preview content switcher: text-heavy UI, bright game canvas, photo, and an
  interactive form (which also proves interactivity survives in `svg`/`css`).
- **Placement toggle** — `mask` or `overlay`. Switching updates both the
  preview and the exported snippet, including the §3.1 caveat that overlay
  cannot do curvature.
- **Export output:**
  - raw `CRTOptions` JSON
  - a snippet for the selected framework (React / Vue / Svelte / Solid /
    Angular / plain JS)
  - optional self-contained HTML+CSS for the `css` tier, for users who want
    the effect with no dependency at all
- Omit every key left at its default from the exported options — export the
  user's intent, not the whole schema.
- `bezel.enabled: false` → no bezel anything in the output (§4.3).

### 8.2 `/upload` — apply the effect to your own media

**Everything runs in the browser. Nothing is uploaded, transmitted, or stored.**
State this in the UI, not just the privacy policy — it is the feature's main
reassurance and it happens to be true.

**Aspect ratios:** 1:1, 4:3, 16:9, 9:16. The chosen ratio drives the canvas,
the bezel, and the export dimensions.

**Accepted input**

| Kind | Formats | Limit |
|---|---|---|
| Image | jpg, png, webp | 2 MB |
| Video | mp4, webm | 5 MB, **and ≤ 30s** |

The duration cap matters independently of file size: on the MediaRecorder path
export runs in real time (§2.3), so a 3-minute clip means a 3-minute wait. Cap
it and say why.

**Validation — do not trust the file picker.** Check, in order:
1. Extension and reported MIME (cheap reject)
2. **Magic bytes** — read the header and confirm the real format. A `.png` that
   is actually something else must be rejected here.
3. Size and, for video, duration after metadata loads
4. Decode dimensions; reject absurd pixel counts (decompression-bomb guard)
   before allocating a canvas

**SVG is not an accepted format and must be rejected explicitly**, including
when disguised by extension or MIME. SVG can carry script; there is no reason
to accept it here.

**Placement:** the same `mask` / `overlay` choice as `/code`. In mask mode the
media sits beneath the effect and is genuinely distorted by it; in overlay mode
the effect composites on top.

**Renderer: prefer `webgl` here, unlike `/code`.** The reason `webgl` is wrong
for `/code` is that it destroys DOM interactivity (§3.2) — but an uploaded
image or video has no interactivity to lose. So in `/upload`, `auto` should
resolve to `webgl` whenever the probe passes, falling back to `svg`/`css`
otherwise. This is the one place the highest-fidelity tier carries no
tradeoff, and it also gives the best export: true barrel distortion, working
`persistence`, and GPU encode paths that outrun the DOM tiers.

The tier indicator must still show what resolved, since Safari iOS will often
land on `css` here and the exported asset will visibly differ from what a
Chrome user gets.

**Export**
- Image → `canvas.toBlob()`, PNG or WebP, at the selected ratio.
- Video → per §2.3: WebCodecs where available, `MediaRecorder` from
  `canvas.captureStream()` otherwise. Show which path is active, show real
  progress, and allow cancel.
- Filenames are generated by the app. **Never interpolate the uploaded
  filename into the DOM or the download name** without stripping to a safe
  character set.
- Revoke every `URL.createObjectURL()` on unmount and on replacing a file.
  Leaking object URLs for 5 MB videos is a real memory problem on mobile.

**Failure states that must be designed, not left to chance:** unsupported
codec, decode failure mid-export, tab backgrounded during a real-time
MediaRecorder run, out-of-memory on a low-end device, and file rejected at
each validation step with a reason specific enough to act on.


## 9. Security

**The strongest security property of this project is architectural: there is no
backend.** No API routes, no database, no auth, no user accounts, no uploads
leaving the device. There is no API to hijack because there is no API. Keep it
that way — if a feature seems to need a server, that is a design discussion
before it is an implementation task.

What that leaves is a real but narrow surface.

### 9.1 Untrusted file input (`/upload`)

The only attacker-controlled data in the system is the file a user picks. It
never leaves their machine, so the threat is to *their own tab*, not to us or
other users — but a crash or a hang is still a broken product.

- **Validate by magic bytes, not extension or MIME** (§8.2). Both are
  trivially spoofed.
- **Reject SVG explicitly**, in all disguises. It is scriptable and is not on
  the accepted list.
- **Decompression-bomb guard:** check decoded pixel dimensions before
  allocating a canvas. A small file can decode to an enormous bitmap.
- **Never interpolate a filename into markup or a download attribute** without
  stripping to a safe character set.
- Decode inside a `try/catch` with a user-facing failure state. A malformed
  file must produce a clear message, never a blank screen.
- Revoke object URLs on unmount and on file replacement.

### 9.2 Content Security Policy

Ship a strict CSP. A site with no backend can afford one with no exceptions:

```
default-src 'self';
img-src 'self' blob: data:;
media-src 'self' blob:;
script-src 'self';
style-src 'self' 'unsafe-inline';    # only if the CSS tier truly needs it — prefer nonces
connect-src 'self';
object-src 'none';
base-uri 'self';
frame-ancestors 'none';
form-action 'none';
```

`blob:` in `img-src`/`media-src` is required for local previews and exports.
`connect-src 'self'` means a compromised dependency cannot exfiltrate a user's
media — worth having precisely because the privacy claim in §8.2 is load-bearing.

Add `Referrer-Policy: strict-origin-when-cross-origin`,
`X-Content-Type-Options: nosniff`, and `Permissions-Policy` denying camera,
microphone, and geolocation, none of which this site uses.

### 9.3 Supply chain

The likeliest real compromise of a static site is a dependency, not an attack
on the site itself.

- Core ships **zero runtime dependencies** (§11) — nothing to compromise.
- The site's dependencies are pinned with a committed lockfile.
- `npm audit` clean at release, or documented exceptions.
- No third-party script tags, no analytics that loads remote code, no CDN
  `<script>` — everything self-hosted so CSP can stay at `'self'`.

### 9.4 Availability

Static assets on Vercel's edge, with Vercel's built-in DDoS mitigation. With no
API routes and no compute per request, there is no endpoint to exhaust — the
cost of a flood is bandwidth, not compute.

Rate limiting is therefore **not needed for correctness**, only as a bandwidth
guard, and is applied at the platform level (Vercel) rather than in code.

### 9.5 Library consumers

- The library must never `eval()`, never use `innerHTML` with interpolated
  values, and never inject remote resources.
- Options are validated and clamped at the API boundary — a consumer passing
  `curvature: 1e9` gets clamped, not a hung tab.
- Exported code snippets are inert text. Generate them by construction, never
  by string-concatenating user input into executable output.

---

## 10. Performance budget

Measured, not estimated. Publish the numbers and the method.

### Frame budget by device class
| Class | Target | Reference device |
|---|---|---|
| Desktop | 60fps sustained | any modern laptop |
| Mid-range mobile | 60fps sustained | ~Pixel 6a / iPhone 12 |
| Low-end mobile | ≥30fps, auto-downgraded tier | ~Android Go class |

### Bundle
- Core: **< 15KB gzipped**, zero runtime dependencies
- Each adapter: **< 2KB gzipped**
- WebGL tier **code-split** — never in the initial bundle for users who resolve
  to `svg` or `css`

### Runtime
- Mount → first painted frame: **< 50ms** (`css`/`svg`), **< 150ms** (`webgl`)
- `update()` must not trigger reflow of wrapped content
- Idle CPU with no animated layers: **~0%** — no rAF loop unless something moves
- No per-frame allocation in any render path

### Required implementation rules
- Never animate `feTurbulence`'s `seed` from JS per frame — that re-resolves the
  whole filter every frame. Pre-generate 4–8 noise tiles at init and cycle them
  with a CSS `steps()` animation.
- Cache displacement maps keyed by curvature.
- Apply `will-change` only while values are actively changing (sidebar
  tuning), never permanently in the shipped effect.
- Composite on `transform`/`opacity` only; no layout-triggering properties in
  any animated layer.

---

## 11. Code quality standards

- **Concise over verbose.** If it reads clearly in 5 lines, don't write 10. No
  defensive scaffolding for impossible states, no wrappers that only forward
  arguments. Extract a helper on the second real use, not the first.
- **Comments explain *why*, never *what*.** A comment about a WebKit quirk earns
  its place; `// set the state` does not. If a comment is needed to explain what
  a line does, rename until it isn't.
- **No dead code.** No commented-out blocks, no unused exports.
- **Types earn their keep.** Prefer inference; annotate public boundaries. No
  `any`, no assertions to silence errors.
- **Adapters stay thin.** Anything beyond lifecycle and framework idiom belongs
  in core.
- **Zero runtime dependencies in core.** Raise it before adding one.

---

## 12. Development tooling

Tooling used **while building**. None of it ships. Same boundary as DialKit
(§8): these must never appear in a published package's `dependencies`, and
Agentation must never appear in a production bundle.

### 12.1 Agent skills

Install once in the repo, before building:

```bash
npx skills add jakubkrehel/skills      # interface craft: UI, typography, colour, layout, a11y
npx skills add emilkowalski/skills     # motion: animation curves, review, audit
```

**`jakubkrehel/skills`** — `better-ui`, `better-typography`, `better-colors`,
`better-accessibility`, `better-layout`, `better-writing`, plus
`interface-review` and `break` (renders a component in every state and stress
tests it). Directly useful for the bezel's optical details (§4.3), the
site's control sidebar, and the `css` tier needing to look good on its
own merits rather than as a fallback.

**`emilkowalski/skills`** — `animate`, `review-animations`,
`improve-animations`, `find-animation-opportunities`, `pick-ui-library`,
`prototype`. Note: the single-skill repo `emilkowalski/skill` contains only
`emil-design-eng`; the **plural** repo contains the full motion suite, which is
what this project actually needs given how much of it is motion.

**Use them at these points specifically**, not as ambient decoration:
- `review-animations` on the flicker, noise cycling, and bloom transitions
  before the performance audit — bad easing is easy to mistake for bad
  performance
- `better-accessibility` against §5.6 before the a11y audit
- `better-ui` on the bezel, which is entirely optical detail
- `break` on the site's controls, which have many states (tier
  unavailable, property disabled, `tint.preset: default`, upload rejected)

Skills advise; they don't override this PRD. Where a skill's recommendation
conflicts with a stated constraint here, the constraint wins — raise the
conflict rather than silently following either one.

### 12.2 Agentation — visual feedback

```bash
npm install agentation -D
```

Annotate the running UI in the browser; annotations sync to the coding agent
over MCP. Useful for this project specifically because most of the work is
visual judgement ("this lip reads flat", "scanlines alias here at 3×") that is
tedious to describe in prose.

```jsx
{process.env.NODE_ENV === "development" && <Agentation />}
```

Optional MCP sync for real-time annotation flow:
```bash
npx add-mcp "npx -y agentation-mcp server"    # server on :4747
```

**Constraints that matter here:**
- React 18+, client-side, **desktop only** — so it cannot be used to annotate
  the mobile testing in §13 (that row stays manual)
- `-D` dev dependency with a `NODE_ENV` guard. Verify it is absent from the
  production bundle, don't assume the guard worked.
- **CSP conflict:** the MCP endpoint is `http://localhost:4747`, which the
  production CSP's `connect-src 'self'` (§9.2) blocks by design. Resolve by
  keeping the strict CSP for production and allowing `localhost:4747` in the
  **development** CSP only — never by loosening production. Alternatively run
  Agentation in copy-paste mode (no `endpoint` prop), which makes no network
  requests at all.
- The §14 audit item "zero network requests after page load" must be verified
  against a **production build**. In dev, Agentation legitimately talks to
  localhost, and testing there would produce a false failure.

---

## 13. Testing matrix

Automated where possible; the browser/device row is manual and non-negotiable.

### Must be tested on real hardware, not emulators
- Safari macOS (latest + one prior)
- Safari iOS (latest + one prior), including **low-power mode**
- Chrome Android on a mid-range device
- Chrome, Firefox, Edge desktop
- A tablet, both orientations
- A low-end Android device, to verify auto-downgrade actually fires

### Per browser, verify
- [ ] Effect renders recognisably at the resolved tier
- [ ] **Animating content stays filtered** (the Safari §2.1 trap)
- [ ] Interactivity: links, inputs, scroll, text selection, touch gestures
- [ ] Resize and orientation change reflow correctly
- [ ] No console errors, no filter-related visual artefacts
- [ ] Frame budget met per §10

---

## 14. Audit checklist

Run before release. Report findings, including anything unfixed.

### Compatibility
- [ ] Capability probes correctly identify each tier's availability — verified by
      forcing each browser down each path
- [ ] Safari accelerated-path probe detects the animated-content case and falls
      to `css`
- [ ] `color-interpolation-filters="sRGB"` set on every filter primitive
- [ ] `css` tier looks genuinely good on its own merits, not like a broken
      fallback — review it standalone, not beside `webgl`
- [ ] Runtime downgrade fires on a low-end device and does not oscillate
- [ ] Downgrade exhausts `quality` before dropping a tier (§4.2 order)
- [ ] SSR: no hydration mismatch in any adapter

### Correctness
- [ ] Every ✓ in §4 works; every ✗ no-ops safely and warns once in dev only
- [ ] `tint.preset: 'default'` applies genuinely no tint (verify pixel values)
- [ ] `overlay` + `curvature` warns and ignores
- [ ] `persistence` outside `webgl` warns and no-ops
- [ ] A config copied from the site produces identical output across all
      six adapters

### The `position: fixed` problem
- [ ] Dev-mode fixed-descendant detection fires and names the elements
- [ ] `mountFullPage()` preserves fixed positioning — verified in Chrome,
      Firefox, **and Safari**
- [ ] Documented above the fold in the README

### Bezel
- [ ] `bezel.enabled: false` produces **no** bezel markup, CSS, or options keys
      in exported output — grep the export for bezel tokens; should be empty
- [ ] A single `color` value derives a plausible housing at several hues without
      further tuning
- [ ] Bezel follows the selected aspect ratio exactly, with no letterboxing
- [ ] Bezel in overlay mode warns once in dev about covering edge content
- [ ] Inner lip reads as recessed, not as a flat border, at default settings

### Upload mode
- [ ] Magic-byte validation rejects a renamed file (test: `evil.svg` → `.png`)
- [ ] SVG rejected in every disguise
- [ ] Decompression-bomb guard fires before canvas allocation
- [ ] Size and duration caps enforced with specific, actionable messages
- [ ] `auto` resolves to `webgl` in `/upload` where the probe passes, and to a
      DOM tier in `/code` — verify the two routes differ as specified
- [ ] Export path correctly selects WebCodecs vs MediaRecorder per browser, and
      says which is active
- [ ] Real-time export shows true progress and can be cancelled
- [ ] Video export verified on Safari (MediaRecorder path) and Chrome
      (WebCodecs path) — output plays back correctly in both
- [ ] Object URLs revoked on unmount and on file replacement — verify no
      growth in memory across repeated uploads
- [ ] Uploaded filename never reaches the DOM or download name unsanitised
- [ ] Every failure state in §8.2 has a designed UI, not a blank screen

### Security
- [ ] Zero network requests after initial page load — verify **on a production
      build** in DevTools with a file loaded and exported. The privacy claim must
      be literally true. (Dev builds talk to localhost via Agentation, §12.2 —
      testing there gives a false failure.)
- [ ] CSP present and as strict as §9.2 in production; no `unsafe-eval`, no
      remote origins. Any dev-only CSP relaxation for `localhost:4747` must not
      leak into the production config.
- [ ] `agentation` absent from the production bundle — grep the build output,
      don't trust the `NODE_ENV` guard
- [ ] Security headers set: `nosniff`, `Referrer-Policy`, `Permissions-Policy`
- [ ] No third-party scripts or CDN tags anywhere
- [ ] Lockfile committed, `npm audit` clean or exceptions documented
- [ ] Library never uses `eval` or `innerHTML` with interpolated values
- [ ] Out-of-range option values are clamped, not allowed to hang the tab

### Performance
- [ ] Bundle sizes measured and within §10
- [ ] WebGL tier code-split and absent from the initial bundle
- [ ] Noise uses pre-generated cycled tiles, not per-frame seed mutation
- [ ] Displacement maps cached per curvature value
- [ ] `will-change` not left applied permanently
- [ ] Idle CPU ~0% with no animated layers enabled
- [ ] `pauseWhenOffscreen` and `visibilitychange` both actually stop the loop
- [ ] Frame budgets met on all three device classes in §10

### Accessibility
- [ ] `prefers-reduced-motion` disables flicker, animated noise, persistence
- [ ] `prefers-reduced-transparency` and `saveData` respected
- [ ] Overlay is `pointer-events: none` and `aria-hidden`
- [ ] Interactivity verified inside `mask` mode on touch devices
- [ ] Contrast caveat documented

### Build & deploy
- [ ] `dialkit` / `motion` in the site's deps and **no** published package
- [ ] `agentation` is a `devDependency` only, in no published package
- [ ] `<DialRoot productionEnabled />` — controls visible on the deployed site
- [ ] Each adapter installs and runs in a clean scaffold of its framework
- [ ] Angular adapter builds with no peer-dependency warnings

### Development tooling
- [ ] Agent skills installed before build starts, not retrofitted after
- [ ] `review-animations` run against flicker / noise / bloom transitions
- [ ] `better-accessibility` run against §5.6 before the a11y audit
- [ ] `break` run against the site controls' full state matrix
- [ ] Any skill recommendation that conflicted with this PRD was raised, not
      silently resolved either way

### Code quality
- [ ] Re-read §11 and audit output against it
- [ ] No file over ~150 lines without reason
- [ ] No rendering logic duplicated between adapters

---

## 15. Out of scope for v1

Named so they don't creep in:
- Preset library ("IBM 5151" etc.) — v2. Real hardware names carry trademark
  risk; use descriptive names.
- Audio passthrough on video export (blocked by Safari 16.4–18.7 lacking
  `AudioEncoder`, §2.3)
- GIF export
- Batch processing multiple files
- Saving or sharing configurations server-side — would require the backend
  this project deliberately does not have (§9)
- Screen-off animation (the collapsing white line)
- 3D bezel geometry
- Video/media-specific pipeline
- React Native / native platforms
