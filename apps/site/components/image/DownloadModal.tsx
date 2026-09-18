'use client'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import type { BurnConfig } from '@/lib/burn'
import { Cancelled, detectVideoPath, exportImage, exportMediaRecorder, exportWebCodecs, fileName, type VideoPath } from '@/lib/export'
import type { Media } from '@/lib/inspect'
import { EASE_OUT, SPRING_GLIDE } from '@/lib/motion'
import { DownloadIcon } from '../ui/icons'
import { Modal } from '../ui/Modal'
import { Pressable } from '../ui/Pressable'
import { Segmented } from '../ui/Segmented'
import { useToast } from '../ui/Toast'
import { useReduceMotion } from '../ui/useReduceMotion'

type Job = { state: 'idle' } | { state: 'running'; progress: number } | { state: 'error'; message: string }
type ImageType = 'image/png' | 'image/webp'

const PATH_COPY: Record<VideoPath, string> = {
  webcodecs: 'WebCodecs: encodes faster than real time.',
  mediarecorder: 'MediaRecorder: records in real time, so this takes about as long as the clip. Keep the tab visible.',
  none: 'This browser can’t encode video. Try a recent Chrome, Edge, Firefox or Safari.',
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  Object.assign(document.createElement('a'), { href: url, download: name }).click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

interface Props {
  open: boolean
  onClose: () => void
  media: Media
  file: File
  image: () => HTMLImageElement | null
  config: () => BurnConfig
}

export function DownloadModal({ open, onClose, media, file, image, config }: Props) {
  const [job, setJob] = useState<Job>({ state: 'idle' })
  const [path, setPath] = useState<VideoPath | null>(null)
  const [type, setType] = useState<ImageType>('image/png')
  const abort = useRef<AbortController | null>(null)
  const toast = useToast()
  const reduce = useReduceMotion()
  const video = media.kind === 'video'

  useEffect(() => {
    if (!video) return
    let live = true
    detectVideoPath(media.width, media.height).then((p) => live && setPath(p))
    return () => {
      live = false
      abort.current?.abort()
    }
  }, [media, video])

  const running = job.state === 'running'
  const close = () => {
    abort.current?.abort()
    onClose()
  }

  const run = async () => {
    const controller = new AbortController()
    abort.current = controller
    setJob({ state: 'running', progress: 0 })
    try {
      const cfg = config()
      if (video) {
        const exporter = path === 'webcodecs' ? exportWebCodecs : exportMediaRecorder
        const onProgress = (progress: number) => setJob({ state: 'running', progress })
        const { blob, ext } = await exporter({ file, url: media.url, duration: media.duration, cfg, signal: controller.signal, onProgress })
        save(blob, fileName(ext))
      } else {
        const img = image()
        if (!img) throw new Error('The preview isn’t ready yet.')
        save(await exportImage(img, cfg, type), fileName(type === 'image/png' ? 'png' : 'webp'))
      }
      setJob({ state: 'idle' })
      toast('success', `Saved a ${cfg.width}×${cfg.height} ${media.kind}.`)
      onClose()
    } catch (err) {
      if (err instanceof Cancelled) return setJob({ state: 'idle' })
      const message = err instanceof Error ? err.message : 'Export failed.'
      setJob({ state: 'error', message })
      toast('error', message)
    }
  }

  const blocked = video && (path === null || path === 'none')
  const progress = job.state === 'running' ? job.progress : 0

  return (
    <Modal
      open={open}
      onClose={close}
      title={video ? 'Download video' : 'Download image'}
      description={video ? 'Your clip with the effect burnt in. Audio isn’t included.' : 'Your image with the effect burnt in, at the selected aspect ratio.'}
    >
      <div className="flex flex-col gap-4 rounded-sm bg-neutral-800 p-4 outline outline-1 -outline-offset-1 outline-white/10">
        {video ? (
          <p className={`text-xs ${path === 'none' ? 'text-signal-red' : 'text-neutral-300'}`}>{path ? PATH_COPY[path] : 'Checking which encoder this browser supports…'}</p>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-neutral-400">Format</span>
            <Segmented
              label="Image format"
              variant="bare"
              value={type}
              onChange={setType}
              options={[
                { value: 'image/png', label: 'PNG' },
                { value: 'image/webp', label: 'WebP' },
              ]}
            />
          </div>
        )}

        <AnimatePresence initial={false}>
          {running && video && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: EASE_OUT }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-3 pt-1">
                <div role="progressbar" aria-label="Export progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <motion.div className="h-full origin-left rounded-full bg-crt" animate={{ scaleX: progress }} transition={reduce ? { duration: 0 } : SPRING_GLIDE} />
                </div>
                <span className="w-[4ch] text-right text-xs text-neutral-300 tabular-nums">{Math.round(progress * 100)}%</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {job.state === 'error' && (
          <p role="alert" className="text-xs text-signal-red">
            {job.message}
          </p>
        )}

        <div className="flex justify-end gap-2">
          {running && video && (
            <Pressable onClick={() => abort.current?.abort()} className="h-8 rounded-sm bg-white/8 px-3 text-xs text-neutral-200 transition-colors hover:bg-white/12">
              Cancel
            </Pressable>
          )}
          <Pressable
            data-autofocus
            onClick={run}
            disabled={running || blocked}
            className="flex h-8 items-center gap-1.5 rounded-xs bg-crt px-3 text-xs font-semibold text-crt-ink transition-[filter,opacity] hover:brightness-110 disabled:opacity-40"
          >
            <DownloadIcon />
            {running ? 'Exporting…' : `Download ${media.kind}`}
          </Pressable>
        </div>
      </div>
    </Modal>
  )
}
