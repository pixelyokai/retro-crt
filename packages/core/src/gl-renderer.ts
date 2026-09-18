import { parseColor } from './color'
import { COPY, VERTEX, effectShader } from './gl-shader'
import { scanlineGeometry } from './layers'
import type { Quality, ResolvedOptions } from './options'
import { TINT_COLORS } from './options'

type TextureSource = TexImageSource

const TAPS: Record<Quality, number> = { high: 24, balanced: 12, low: 6 }

interface Target {
  tex: WebGLTexture
  fb: WebGLFramebuffer
}

export interface FrameParams {
  opts: ResolvedOptions
  quality: Quality
  /** CSS-px → buffer-px factor, so gap and aberration stay in CSS px at any DPR and quality. */
  scale: number
  motion: boolean
}

/**
 * Standalone WebGL CRT pass. Used by the `webgl` tier and directly by exporters that need the
 * effect burnt into pixels. All GPU objects are created up front: no per-frame allocation (§10).
 */
export class GLRenderer {
  readonly gl: WebGLRenderingContext
  private effect: { program: WebGLProgram; taps: number } | null = null
  private copy: WebGLProgram
  private source: WebGLTexture
  private blank: WebGLTexture
  private targets: Target[] = []
  private front = 0
  private persist = 0
  private uniforms = new Map<string, WebGLUniformLocation | null>()

  constructor(readonly canvas: HTMLCanvasElement, preserveDrawingBuffer = false) {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer })
    if (!gl) throw new Error('WebGL unavailable')
    this.gl = gl
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    this.copy = this.program(COPY)
    gl.useProgram(this.copy)
    gl.uniform1i(gl.getUniformLocation(this.copy, 'uTex'), 1)
    this.source = this.texture()
    this.blank = this.texture()
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4))
  }

  private program(fragment: string): WebGLProgram {
    const gl = this.gl
    const p = gl.createProgram()
    for (const [type, src] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, fragment]] as const) {
      const s = gl.createShader(type)
      if (!s) throw new Error('shader allocation failed')
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader error')
      gl.attachShader(p, s)
    }
    gl.bindAttribLocation(p, 0, 'aPos')
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link error')
    return p
  }

  private texture(): WebGLTexture {
    const gl = this.gl
    const t = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, t)
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]])
      gl.texParameteri(gl.TEXTURE_2D, k, v)
    return t
  }

  /** Reallocates buffers only when the pixel size actually changes. */
  resize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width))
    const h = Math.max(1, Math.round(height))
    if (this.canvas.width === w && this.canvas.height === h && this.targets.length) return
    Object.assign(this.canvas, { width: w, height: h })
    const gl = this.gl
    this.targets.forEach(({ tex, fb }) => (gl.deleteTexture(tex), gl.deleteFramebuffer(fb)))
    this.targets = [0, 1].map(() => {
      const tex = this.texture()
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      const fb = gl.createFramebuffer()
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
      gl.clearColor(0, 0, 0, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)
      return { tex, fb }
    })
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  private effectProgram(quality: Quality): WebGLProgram {
    const gl = this.gl
    if (this.effect?.taps === TAPS[quality]) return this.effect.program
    if (this.effect) gl.deleteProgram(this.effect.program)
    const program = this.program(effectShader(TAPS[quality]))
    this.effect = { program, taps: TAPS[quality] }
    this.uniforms.clear()
    gl.useProgram(program)
    gl.uniform4f(gl.getUniformLocation(program, 'uCrop'), 0, 0, 1, 1)
    gl.uniform1i(gl.getUniformLocation(program, 'uTex'), 0)
    gl.uniform1i(gl.getUniformLocation(program, 'uPrev'), 1)
    return program
  }

  private set(program: WebGLProgram, name: string, ...v: number[]): void {
    const gl = this.gl
    let loc = this.uniforms.get(name)
    if (loc === undefined) this.uniforms.set(name, (loc = gl.getUniformLocation(program, name)))
    if (v.length === 1) gl.uniform1f(loc, v[0])
    else if (v.length === 2) gl.uniform2f(loc, v[0], v[1])
    else gl.uniform3f(loc, v[0], v[1], v[2])
  }

  /** Uploads every uniform except time. Call when options change, not per frame. */
  configure({ opts: o, quality, scale, motion }: FrameParams): void {
    const gl = this.gl
    const program = this.effectProgram(quality)
    const tint = TINT_COLORS[o.tint.preset] ?? [0, 0, 0]
    const set = (name: string, ...v: number[]) => this.set(program, name, ...v)
    this.persist = motion ? o.persistence.strength * 1.8 : 0
    gl.useProgram(program)
    set('uCurv', o.curvature * 0.12)
    set('uVig', o.vignette * 0.85)
    set('uScanA', o.scanlines.intensity * 0.75)
    set('uScanGap', scanlineGeometry(o.scanlines.gap, scale).gap * scale)
    set('uTint', tint[0] / 255, tint[1] / 255, tint[2] / 255)
    const bg = parseColor(o.background)
    set('uBg', bg[0] / 255, bg[1] / 255, bg[2] / 255)
    set('uTintA', o.tint.preset === 'default' ? 0 : o.tint.strength * 0.85)
    set('uBloom', o.bloom.radius * scale, o.bloom.enabled ? o.bloom.strength : 0, o.bloom.threshold)
    set('uAberr', o.chromaticAberration.intensity * scale)
    set('uNoise', o.noise.enabled ? o.noise.static * 1.5 : 0)
    set('uPersist', this.persist)
    set('uFlicker', motion && o.scanlines.flicker && quality !== 'low' ? 1 : 0)
  }

/**
   * How the source fills the buffer, in the spirit of CSS object-fit. Source and target sizes are
   * in any consistent unit; only their aspect ratios matter.
   */
  setFit(fit: 'fill' | 'cover' | 'contain', sourceW: number, sourceH: number): void {
    const program = this.effect?.program
    if (!program || !sourceW || !sourceH) return
    const ratio = (sourceW / sourceH) / (this.canvas.width / this.canvas.height)
    let [sx, sy] = [1, 1]
    if (fit === 'cover') ratio > 1 ? (sx = 1 / ratio) : (sy = ratio)
    if (fit === 'contain') ratio > 1 ? (sy = ratio) : (sx = 1 / ratio)
    this.gl.useProgram(program)
    this.gl.uniform4f(this.gl.getUniformLocation(program, 'uCrop'), (1 - sx) / 2, (1 - sy) / 2, sx, sy)
  }

  render(source: TextureSource, time: number): void {
    const gl = this.gl
    const program = this.effect?.program
    if (!program) return
    const { width: w, height: h } = this.canvas
    if (!this.targets.length) this.resize(w, h)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.source)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)

    gl.useProgram(program)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    this.set(program, 'uRes', w, h)
    this.set(program, 'uTime', time)

    const persisting = this.persist > 0
    const out = this.targets[this.front]
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, persisting ? this.targets[1 - this.front].tex : this.blank)
    gl.bindFramebuffer(gl.FRAMEBUFFER, persisting ? out.fb : null)
    gl.viewport(0, 0, w, h)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    if (persisting) this.present(out.tex)
    this.front = 1 - this.front
  }

  private present(tex: WebGLTexture): void {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.useProgram(this.copy)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  destroy(): void {
    this.gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
