import { minimalOptions, type CRTOptions } from 'retro-crt'

/** The Paper export tabs first, then the remaining adapters. `html` is built in `standalone.ts`. */
export const TARGETS = ['react', 'js', 'html', 'ts', 'vue', 'svelte', 'solid', 'angular'] as const
export type Target = (typeof TARGETS)[number]

export const TARGET_LABELS: Record<Target, string> = {
  react: 'React',
  js: 'Javascript',
  html: 'HTML',
  ts: 'Typescript',
  vue: 'Vue',
  svelte: 'Svelte',
  solid: 'Solid',
  angular: 'Angular',
}

const PACKAGES: Partial<Record<Target, string>> = {
  react: '@retro-crt/react',
  vue: '@retro-crt/vue',
  svelte: '@retro-crt/svelte',
  solid: '@retro-crt/solid',
  angular: '@retro-crt/angular',
}

/** `null` for the standalone page: it has no dependency to install. */
export const installCommand = (target: Target): string | null =>
  target === 'html' ? null : ['npm install retro-crt', PACKAGES[target]].filter(Boolean).join(' ')

/**
 * Snippets are built from JSON.stringify output only: every value is a number, boolean or an
 * escaped string literal, so nothing a user types can become executable code (§9.5).
 */
export function literal(options: CRTOptions, indent = 0): string {
  const json = JSON.stringify(minimalOptions(options), null, 2)
  // Only whole-line keys are unquoted; string values can never match the line-start anchor.
  const js = json.replace(/^(\s*)"([A-Za-z_]\w*)":/gm, '$1$2:')
  return js.split('\n').join(`\n${' '.repeat(indent)}`)
}

export function snippet(target: Exclude<Target, 'html'>, options: CRTOptions): string {
  const crt = literal(options)
  switch (target) {
    case 'react':
      return `import { CRTScreen } from '@retro-crt/react'
import 'retro-crt/styles.css'

const crt = ${crt}

export function Screen({ children }) {
  return <CRTScreen {...crt}>{children}</CRTScreen>
}`
    case 'js':
      return `import { CRT } from 'retro-crt'
import 'retro-crt/styles.css'

const crt = ${crt}

const screen = CRT.mount('#app', crt)
console.log(screen.activeRenderer) // 'webgl' | 'svg' | 'css'`
    case 'ts':
      return `import { CRT, type CRTOptions } from 'retro-crt'
import 'retro-crt/styles.css'

const crt: CRTOptions = ${crt}

const screen = CRT.mount('#app', crt)
screen.activeRenderer // 'webgl' | 'svg' | 'css'
screen.update({ curvature: 0.6 })
screen.destroy()`
    case 'vue':
      return `<script setup>
import { CRTScreen } from '@retro-crt/vue'
import 'retro-crt/styles.css'

const crt = ${crt}
</script>

<template>
  <CRTScreen :options="crt"><slot /></CRTScreen>
</template>`
    case 'svelte':
      return `<script>
  import { CRTScreen } from '@retro-crt/svelte'
  import 'retro-crt/styles.css'

  let { children } = $props()
  const crt = ${literal(options, 2)}
</script>

<CRTScreen {...crt}>{@render children?.()}</CRTScreen>`
    case 'solid':
      return `import { CRTScreen } from '@retro-crt/solid'
import 'retro-crt/styles.css'

const crt = ${crt}

export function Screen(props) {
  return <CRTScreen {...crt}>{props.children}</CRTScreen>
}`
    case 'angular':
      return `import { Component } from '@angular/core'
import { CRTScreenComponent, type CRTOptions } from '@retro-crt/angular'
// add "node_modules/retro-crt/dist/styles.css" to "styles" in angular.json

@Component({
  selector: 'app-screen',
  imports: [CRTScreenComponent],
  template: '<crt-screen [options]="crt"><ng-content /></crt-screen>',
})
export class ScreenComponent {
  readonly crt: CRTOptions = ${literal(options, 2)}
}`
  }
}
