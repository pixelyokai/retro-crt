<script lang="ts">
  import { untrack, type Snippet } from 'svelte'
  import { CRT, type CRTOptions, type CRTScreen as Screen, type Quality, type Renderer } from 'retro-crt'

  interface Props extends CRTOptions {
    children?: Snippet
    class?: string
    style?: string
    onrendererchange?: (renderer: Renderer, quality: Quality) => void
  }

  let { children, class: className, style, onrendererchange, ...options }: Props = $props()
  let host: HTMLDivElement
  let screen: Screen | undefined = $state()

  $effect(() => {
    const s = CRT.mount(host, untrack(() => $state.snapshot(options)))
    const notify = () => untrack(() => onrendererchange?.(s.activeRenderer, s.activeQuality))
    const unsubscribe = s.subscribe(notify)
    notify()
    screen = s
    return () => {
      unsubscribe()
      s.destroy()
    }
  })

  $effect(() => {
    const next = $state.snapshot(options)
    untrack(() => screen)?.set(next)
  })
</script>

<div bind:this={host} class={className} {style}>
  <div data-rcrt-content="">{@render children?.()}</div>
</div>
