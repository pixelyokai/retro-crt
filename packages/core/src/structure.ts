import { isDev, warnOnce } from './env'

export interface Structure {
  host: HTMLElement
  /** The element the effect filters. `null` for a full page, where the filter sits on <html>. */
  content: HTMLElement | null
  detach(): void
}

/**
 * mask: `target` becomes the host; its children render inside `.rcrt-content`. Framework adapters
 * render that content element themselves (marked `data-rcrt-content`) so we never reparent nodes
 * a virtual DOM owns; plain-JS mounts get their children moved in and restored on destroy.
 */
export function attachMask(target: HTMLElement): Structure {
  target.classList.add('rcrt')
  target.dataset.rcrtMode = 'mask'
  let content = target.querySelector<HTMLElement>(':scope > [data-rcrt-content]')
  const owned = !content
  if (!content) {
    content = document.createElement('div')
    content.append(...target.childNodes)
    target.appendChild(content)
  }
  content.classList.add('rcrt-content')
  if (isDev) queueMicrotask(() => content && warnFixedDescendants(content))
  const el = content
  return {
    host: target,
    content,
    detach() {
      target.classList.remove('rcrt')
      for (const key of ['rcrtMode', 'rcrtTier', 'rcrtStill', 'rcrtPaused', 'rcrtTuning']) delete target.dataset[key]
      for (const prop of [...target.style]) if (prop.startsWith('--rcrt-')) target.style.removeProperty(prop)
      el.classList.remove('rcrt-content')
      delete el.dataset.rcrtFiltered
      if (owned) {
        target.append(...el.childNodes)
        el.remove()
      }
    },
  }
}

/** mountFullPage: effect layers pinned over the viewport. */
export function attachViewport(): Structure {
  const host = document.createElement('div')
  host.className = 'rcrt'
  host.dataset.rcrtMode = 'viewport'
  host.setAttribute('aria-hidden', 'true')
  document.body.appendChild(host)
  return { host, content: null, detach: () => host.remove() }
}

/**
 * A filtered ancestor becomes the containing block for fixed descendants, so modals and sticky
 * headers anchor to the screen instead of the viewport (§5.1). Name them so it isn't a mystery.
 */
function warnFixedDescendants(root: HTMLElement): void {
  const offenders: string[] = []
  for (const el of root.querySelectorAll<HTMLElement>('*')) {
    if (getComputedStyle(el).position !== 'fixed') continue
    offenders.push(el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (el.classList.length ? `.${[...el.classList].join('.')}` : ''))
    if (offenders.length >= 10) break
  }
  if (offenders.length)
    warnOnce(
      'fixed',
      `position: fixed descendants will anchor to the CRT wrapper, not the viewport: ${offenders.join(', ')}. ` +
        'Use CRT.mountFullPage() to wrap a whole page.',
    )
}
