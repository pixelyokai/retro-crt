'use client'
import { CRTScreen } from '@retro-crt/react'
import { motion } from 'motion/react'
import { useCallback, useEffect, useId, useRef, useState, type DragEvent } from 'react'
import { loadExample } from '@/lib/examples'
import { Cancelled, detectVideoPath, exportImage, exportMediaRecorder, exportWebCodecs, fileName, imageExt, preferredContainer, type VideoPath } from '@/lib/export'
import { inspect, type Media } from '@/lib/inspect'
import { SPRING_SURFACE } from '@/lib/motion'
import { ACCEPT, Rejection, displayName } from '@/lib/validate'
import { AppShell } from '../AppShell'
import { PrimaryAction, Sidebar } from '../Sidebar'
import { DownloadIcon, UploadIcon } from '../ui/icons'
import { Pressable } from '../ui/Pressable'
import { Segmented } from '../ui/Segmented'
import { useToast } from '../ui/Toast'
import { useCrt } from '../useCrt'
import { useReduceMotion } from '../ui/useReduceMotion'

const RATIOS = [
  { value: '1:1' as const, label: '1:1' },
  { value: '4:3' as const, label: '4:3' },
  { value: '16:9' as const, label: '16:9' },
  { value: '9:16' as const, label: '9:16' },
]
type Ratio = (typeof RATIOS)[number]['value']

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)

/** Long enough that a still image never swaps the button label, short enough to catch a clip. */
const SLOW_AFTER_MS = 400

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  Object.assign(document.createElement('a'), { href: url, download: name }).click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

interface Loaded {
  media: Media
  file: File
  /** The bundled sample rather than something the visitor chose. */
  sample: boolean
}

type Download = { state: 'idle' } | { state: 'running'; progress: number }

export function ImageMode() {
  const crt = useCrt()
  const toast = useToast()
  const reduce = useReduceMotion()
  const [ratio, setRatio] = useState<Ratio>('16:9')
  // A phone stage is portrait, so 16:9 would letterbox down to a sliver. Applied after mount to
  // keep the server and the first client render identical.
  useEffect(() => {
    if (window.matchMedia('(max-width: 1023px)').matches) setRatio('9:16')
  }, [])
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [busy, setBusy] = useState(false)
  const [download, setDownload] = useState<Download>({ state: 'idle' })
  const [videoPath, setVideoPath] = useState<VideoPath | null>(null)
  // An image export finishes in a few frames. Swapping the label for that long only flickers, so
  // progress appears once an export is actually slow enough to be worth reporting.
  const [slow, setSlow] = useState(false)
  const slowTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(slowTimer.current), [])
  const box = useRef<HTMLDivElement>(null)
  const [areaSize, setAreaSize] = useState({ width: 0, height: 0 })
  const current = useRef<Media | null>(null)
  const inputId = useId()

  // A callback ref so the observer attaches the moment the stage exists, not a frame later.
  const area = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setAreaSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // One object URL alive at a time, revoked on replacement and on unmount (§8.2).
  const replace = useCallback((next: Loaded | null) => {
    if (current.current) URL.revokeObjectURL(current.current.url)
    current.current = next?.media ?? null
    setLoaded(next)
  }, [])
  useEffect(() => () => replace(null), [replace])

  // The sample opens the tab so the effect is visible before anything is uploaded.
  useEffect(() => {
    const controller = new AbortController()
    loadExample('image', controller.signal)
      .then(async (file) => {
        const media = await inspect(file)
        if (controller.signal.aborted) return URL.revokeObjectURL(media.url)
        replace({ media, file, sample: true })
      })
      .catch(() => {})
    return () => controller.abort()
  }, [replace])

  // Probed as soon as a video loads, not when the download starts, so the button can disable
  // itself up front rather than fail after a click.
  useEffect(() => {
    const media = loaded?.media
    if (!media || media.kind !== 'video') return setVideoPath(null)
    let live = true
    detectVideoPath(preferredContainer(media.format), media.width, media.height).then((p) => live && setVideoPath(p))
    return () => {
      live = false
    }
  }, [loaded?.media])

  const onFile = async (file: File) => {
    setBusy(true)
    try {
      replace({ media: await inspect(file), file, sample: false })
    } catch (err) {
      toast('error', err instanceof Rejection ? err.message : 'That file couldn’t be read.')
    } finally {
      setBusy(false)
    }
  }

  const pick = () => document.getElementById(inputId)?.click()
  const drop = (e: DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }

  const [rw, rh] = ratio.split(':').map(Number)
  // The largest box of the chosen ratio that fits the stage; animating it morphs between ratios.
  const fit = !areaSize.height
    ? { width: 0, height: 0 }
    : areaSize.width / areaSize.height > rw / rh
      ? { width: (areaSize.height * rw) / rh, height: areaSize.height }
      : { width: areaSize.width, height: (areaSize.width * rh) / rw }

  const burnConfig = () => {
    const media = loaded?.media
    const rect = box.current?.getBoundingClientRect()
    if (!media || !rect?.width) throw new Error('The preview isn’t ready yet.')
    const long = media.kind === 'image' ? Math.min(2048, Math.max(1080, media.width, media.height)) : Math.min(1280, Math.max(720, media.width, media.height))
    const width = even(rw >= rh ? long : (long * rw) / rh)
    const height = even(rw >= rh ? (long * rh) / rw : long)
    return { options: crt.options, engine: crt.active?.renderer === 'webgl' ? ('webgl' as const) : ('canvas' as const), width, height, scale: width / rect.width }
  }

  // Same format you uploaded comes back out: a PNG in is a PNG out, an MP4 in is an MP4 out where
  // the browser can encode it. No dialog — one click downloads.
  const runDownload = async () => {
    if (!loaded || download.state === 'running') return
    const { media, file } = loaded
    const controller = new AbortController()
    setDownload({ state: 'running', progress: 0 })
    slowTimer.current = setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    try {
      const cfg = burnConfig()
      if (media.kind === 'video') {
        const container = preferredContainer(media.format)
        const exporter = videoPath === 'webcodecs' ? exportWebCodecs : exportMediaRecorder
        const onProgress = (progress: number) => setDownload({ state: 'running', progress })
        const { blob, ext } = await exporter({ file, url: media.url, duration: media.duration, cfg, container, signal: controller.signal, onProgress })
        save(blob, fileName(ext))
      } else {
        const img = box.current?.querySelector('img')
        if (!img) throw new Error('The preview isn’t ready yet.')
        const format = media.format as 'jpeg' | 'png' | 'webp'
        save(await exportImage(img, cfg, format), fileName(imageExt[format]))
      }
      toast('success', `Saved a ${cfg.width}×${cfg.height} ${media.kind}.`)
    } catch (err) {
      if (err instanceof Cancelled) return
      toast('error', err instanceof Error ? err.message : 'Export failed.')
    } finally {
      clearTimeout(slowTimer.current)
      setSlow(false)
      setDownload({ state: 'idle' })
    }
  }

  const running = download.state === 'running'
  const blocked = loaded?.media.kind === 'video' && (videoPath === null || videoPath === 'none')
  const downloadLabel = running && slow ? `Exporting… ${Math.round(download.progress * 100)}%` : 'Download'

  return (
    <AppShell
      stage={
        <div onDragOver={(e) => e.preventDefault()} onDrop={drop} className="flex size-full flex-col items-center justify-center gap-2">
          <div ref={area} className="flex min-h-0 w-full flex-1 items-center justify-center">
            <motion.div ref={box} initial={false} animate={fit} transition={reduce ? { duration: 0 } : SPRING_SURFACE}>
              {loaded && (
                <CRTScreen key={loaded.media.url} className="size-full rounded-sm" {...crt.options} onRendererChange={crt.onRendererChange}>
                  {loaded.media.kind === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a local blob preview; next/image can't optimise it
                    <img src={loaded.media.url} alt={loaded.sample ? 'The bundled example still' : 'Your image'} className="block size-full object-cover" />
                  ) : (
                    <video src={loaded.media.url} className="block size-full object-cover" autoPlay muted loop playsInline aria-label={loaded.sample ? 'The bundled example clip' : 'Your video'} />
                  )}
                </CRTScreen>
              )}
            </motion.div>
          </div>
          <p className="min-h-5 text-xs text-neutral-500 tabular-nums">
            {loaded &&
              `${loaded.sample ? 'Example' : displayName(loaded.file.name)} · ${loaded.media.width}×${loaded.media.height}${
                loaded.media.kind === 'video' ? ` · ${loaded.media.duration.toFixed(1)}s` : ''
              }`}
          </p>
        </div>
      }
      controls={
        <div className="flex flex-wrap items-center gap-3">
          <Segmented label="Aspect ratio" variant="bare" value={ratio} options={RATIOS} onChange={setRatio} />
          <span aria-hidden className="h-5 w-px bg-white/16" />
          <input
            id={inputId}
            type="file"
            accept={ACCEPT}
            disabled={busy}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) onFile(file)
            }}
          />
          <Pressable
            onClick={pick}
            disabled={busy}
            className="chip-inset flex items-center gap-1 rounded-xs bg-neutral-800 py-0.5 pr-1.5 pl-2 text-xs text-neutral-300 transition-colors hover:bg-neutral-700 disabled:opacity-50"
          >
            <UploadIcon />
            <span className="px-0.5">{busy ? 'Checking…' : 'Replace'}</span>
          </Pressable>
        </div>
      }
      sidebar={
        <Sidebar
          store={crt}
          action={<PrimaryAction icon={<DownloadIcon />} label={downloadLabel} disabled={!loaded || running || blocked} onClick={runDownload} />}
        />
      }
    />
  )
}
