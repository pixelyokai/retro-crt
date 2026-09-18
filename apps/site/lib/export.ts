import { Burner, type BurnConfig } from './burn'
import { Cancelled, ExportError, asExportError } from './export-errors'
import type { Format } from './validate'
import type { VideoResult } from './webcodecs'

export { Cancelled }

export type VideoPath = 'webcodecs' | 'mediarecorder' | 'none'
/** The two containers WebCodecs can produce, in the order a given codec should be tried. */
export type VideoContainer = 'mp4' | 'webm'

export const fileName = (ext: string) => `retro-crt-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}.${ext}`

// Probed with the native API so detection never pulls the encoder library in.
const CODECS_BY_CONTAINER: Record<VideoContainer, string[]> = {
  mp4: ['avc1.42001f', 'vp09.00.10.08', 'vp8'],
  webm: ['vp09.00.10.08', 'vp8', 'avc1.42001f'],
}

/** mp4 for an mp4 upload, webm for a webm one — matches the source container when the browser allows it. */
export const preferredContainer = (format: Format): VideoContainer => (format === 'webm' ? 'webm' : 'mp4')

async function encodableCodec(container: VideoContainer, width: number, height: number): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined') return false
  for (const codec of CODECS_BY_CONTAINER[container]) {
    try {
      if ((await VideoEncoder.isConfigSupported({ codec, width, height })).supported) return true
    } catch {
      // An unsupported codec string throws rather than resolving false in some browsers.
    }
  }
  return false
}

const RECORDER_TYPES_BY_CONTAINER: Record<VideoContainer, string[]> = {
  mp4: ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'],
  webm: ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4;codecs=avc1', 'video/mp4'],
}

/** Feature-detected, never assumed (§2.3). */
export async function detectVideoPath(container: VideoContainer, width: number, height: number): Promise<VideoPath> {
  if (await encodableCodec(container, width, height)) return 'webcodecs'
  const canCapture = typeof HTMLCanvasElement.prototype.captureStream === 'function'
  if (canCapture && typeof MediaRecorder !== 'undefined' && RECORDER_TYPES_BY_CONTAINER[container].some((t) => MediaRecorder.isTypeSupported(t))) return 'mediarecorder'
  return 'none'
}

function withBurner<T>(cfg: BurnConfig, run: (b: Burner) => Promise<T>): Promise<T> {
  let burner: Burner
  try {
    burner = new Burner(cfg)
  } catch (err) {
    return Promise.reject(asExportError(err))
  }
  return run(burner).catch((err) => Promise.reject(asExportError(err))).finally(() => burner.destroy())
}

const IMAGE_TYPE: Record<'jpeg' | 'png' | 'webp', string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
export const imageExt: Record<'jpeg' | 'png' | 'webp', string> = { jpeg: 'jpg', png: 'png', webp: 'webp' }

/** Encodes back to the format the image was uploaded as — a PNG in, a PNG out. */
export function exportImage(img: HTMLImageElement, cfg: BurnConfig, format: 'jpeg' | 'png' | 'webp'): Promise<Blob> {
  return withBurner(cfg, (burner) => {
    burner.draw(img, img.naturalWidth, img.naturalHeight, 0)
    return new Promise<Blob>((resolve, reject) =>
      burner.output.toBlob((blob) => (blob ? resolve(blob) : reject(new ExportError('The browser couldn’t encode the image.'))), IMAGE_TYPE[format], 0.95),
    )
  })
}

interface VideoJob {
  file: File
  url: string
  duration: number
  cfg: BurnConfig
  container: VideoContainer
  signal: AbortSignal
  onProgress: (fraction: number) => void
}

/** Thin wrapper: the encoder library is pulled in only once a video export actually starts. */
export function exportWebCodecs({ file, cfg, container, signal, onProgress }: VideoJob): Promise<VideoResult> {
  return withBurner(cfg, async (burner) => {
    const { runWebCodecs } = await import('./webcodecs')
    return runWebCodecs(file, burner, cfg, CODECS_BY_CONTAINER[container], signal, onProgress)
  })
}

/** Real-time capture: the clip plays once while the canvas is recorded. Main thread only (§2.3). */
export function exportMediaRecorder({ url, duration, cfg, container, signal, onProgress }: VideoJob): Promise<VideoResult> {
  return withBurner(cfg, (burner) => {
    const mimeType = RECORDER_TYPES_BY_CONTAINER[container].find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
    const video = Object.assign(document.createElement('video'), { muted: true, playsInline: true, src: url })
    const recorder = new MediaRecorder(burner.output.captureStream(30), { mimeType, videoBitsPerSecond: 8_000_000 })
    const chunks: Blob[] = []
    let frame = 0

    return new Promise<VideoResult>((resolve, reject) => {
      let failure: Error | null = null
      const stop = (err: Error | null) => {
        failure = err
        cancelAnimationFrame(frame)
        video.pause()
        if (recorder.state !== 'inactive') recorder.stop()
      }
      const onHidden = () => document.hidden && stop(new ExportError('Export stopped because the tab was hidden. Keep this tab visible while a real-time export runs.'))
      const onAbort = () => stop(new Cancelled())
      const cleanup = () => {
        document.removeEventListener('visibilitychange', onHidden)
        signal.removeEventListener('abort', onAbort)
        video.removeAttribute('src')
        video.load()
      }
      document.addEventListener('visibilitychange', onHidden)
      signal.addEventListener('abort', onAbort)

      const tick = () => {
        burner.draw(video, video.videoWidth, video.videoHeight, video.currentTime)
        onProgress(Math.min(1, video.currentTime / duration))
        frame = requestAnimationFrame(tick)
      }
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      recorder.onstop = () => {
        cleanup()
        if (failure) return reject(failure)
        const type = recorder.mimeType || mimeType || 'video/webm'
        resolve({ blob: new Blob(chunks, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm' })
      }
      video.onended = () => stop(null)
      video.onerror = () => stop(new ExportError('A frame couldn’t be decoded partway through. The file may be damaged.'))
      recorder.start(1000)
      video.play().then(tick, () => stop(new ExportError('The browser refused to play the clip for recording.')))
    })
  })
}
