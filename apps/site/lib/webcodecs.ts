import { ALL_FORMATS, BlobSource, BufferTarget, CanvasSink, CanvasSource, Input, Mp4OutputFormat, Output, QUALITY_HIGH, WebMOutputFormat, getFirstEncodableVideoCodec } from 'mediabunny'
import type { Burner } from './burn'
import type { BurnConfig } from './burn'
import { Cancelled, ExportError } from './export-errors'

export interface VideoResult {
  blob: Blob
  ext: string
}

/**
 * Decodes and encodes as fast as the hardware allows. Loaded on demand: mediabunny is by far the
 * heaviest thing the site can pull in, and only a video download needs it.
 */
export async function runWebCodecs(file: File, burner: Burner, cfg: BurnConfig, signal: AbortSignal, onProgress: (f: number) => void): Promise<VideoResult> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  try {
    return await encode(input, burner, cfg, signal, onProgress)
  } finally {
    input.dispose()
  }
}

async function encode(input: Input, burner: Burner, cfg: BurnConfig, signal: AbortSignal, onProgress: (f: number) => void): Promise<VideoResult> {
  const track = await input.getPrimaryVideoTrack()
  if (!track || !(await track.canDecode())) throw new ExportError('This browser can’t decode the video’s codec for export. Try Chrome, or re-export the clip as H.264 MP4.')
  const duration = await track.computeDuration()
  const codec = await getFirstEncodableVideoCodec(['avc', 'vp9', 'vp8'], { width: cfg.width, height: cfg.height })
  if (!codec) throw new ExportError('No supported video encoder was found.')
  const format = codec === 'avc' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat()
  const target = new BufferTarget()
  const output = new Output({ format, target })
  const source = new CanvasSource(burner.output, { codec, bitrate: QUALITY_HIGH })
  output.addVideoTrack(source)
  await output.start()
  try {
    for await (const frame of new CanvasSink(track, { poolSize: 1 }).canvases()) {
      if (signal.aborted) throw new Cancelled()
      burner.draw(frame.canvas, frame.canvas.width, frame.canvas.height, frame.timestamp)
      await source.add(frame.timestamp, frame.duration)
      onProgress(Math.min(1, (frame.timestamp + frame.duration) / duration))
    }
    await output.finalize()
  } catch (err) {
    await output.cancel()
    throw err
  }
  if (!target.buffer) throw new ExportError('The encoder produced no output.')
  return { blob: new Blob([target.buffer], { type: format.mimeType }), ext: format.fileExtension.slice(1) }
}
