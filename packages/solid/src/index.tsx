import { createEffect, onCleanup, onMount, splitProps, type JSX } from 'solid-js'
import { CRT, type CRTOptions, type CRTScreen as Screen, type Quality, type Renderer } from 'retro-crt'

export interface CRTScreenProps extends CRTOptions {
  children?: JSX.Element
  class?: string
  style?: JSX.CSSProperties | string
  onRendererChange?: (renderer: Renderer, quality: Quality) => void
}

export function CRTScreen(props: CRTScreenProps) {
  const [local, options] = splitProps(props, ['children', 'class', 'style', 'onRendererChange'])
  let host: HTMLDivElement | undefined
  let screen: Screen | undefined
  // Serialising reads every nested prop, so the effect tracks the whole config.
  const snapshot = (): CRTOptions => JSON.parse(JSON.stringify(options))

  onMount(() => {
    if (!host) return
    const s = CRT.mount(host, snapshot())
    const notify = () => local.onRendererChange?.(s.activeRenderer, s.activeQuality)
    onCleanup(s.subscribe(notify))
    notify()
    screen = s
  })
  createEffect(() => {
    const next = snapshot()
    screen?.set(next)
  })
  onCleanup(() => screen?.destroy())

  return (
    <div ref={host} class={local.class} style={local.style}>
      <div data-rcrt-content="">{local.children}</div>
    </div>
  )
}

export type { CRTOptions }
