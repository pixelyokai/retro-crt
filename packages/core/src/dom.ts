/**
 * Keyed child nodes that exist only while enabled: a disabled layer is removed, never hidden,
 * so an off feature costs zero DOM nodes (§4.3).
 */
export class LayerSet {
  private nodes = new Map<string, HTMLElement>()
  constructor(private parent: HTMLElement) {}

  toggle(name: string, on: boolean): HTMLElement | undefined {
    let node = this.nodes.get(name)
    if (!on) {
      node?.remove()
      this.nodes.delete(name)
      return undefined
    }
    if (!node) {
      node = document.createElement('div')
      node.className = `rcrt-${name}`
      node.setAttribute('aria-hidden', 'true')
      this.nodes.set(name, node)
      this.parent.appendChild(node)
    }
    return node
  }

  clear(): void {
    this.nodes.forEach((n) => n.remove())
    this.nodes.clear()
  }
}

export const setVars = (el: HTMLElement, vars: Record<string, string | number>) => {
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(`--rcrt-${k}`, String(v))
}
