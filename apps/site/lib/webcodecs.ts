import { ALL_FORMATS, BlobSource, BufferTarget, CanvasSink, CanvasSource, Input, Mp4OutputFormat, Output, QUALITY_HIGH, WebMOutputFormat, getFirstEncodableVideoCodec } from 'mediabunny'
import type { Burner, BurnConfig } from './burn'
import { Cancelled, ExportError } from './export-errors'

export interface VideoResult {
  blob: Blob
  ext: string
}

// mediabunny names codecs by family ('avc', 'vp9', 'vp8'), not by the codec string VideoEncoder
// probes with, so the container preference is translated once here.
const FAMILY: Record<string, 'avc' | 'vp9' | 'vp8'> = { avc1: 'avc', vp09: 'vp9', vp8: 'vp8' }
const familyOf = (codec: string) => FAMILY[codec.split(/[.]/)[0]]

/**
 * Decodes and encodes as fast as the hardware allows. Loaded on demand: mediabunny is by far the
 * heaviest thing the site can pull in, and only a video download needs it.
 */
export async function runWebCodecs(file: File, burner: Burner, cfg: BurnConfig, codecOrder: string[], signal: AbortSignal, onProgress: (f: number) => void): Promise<VideoResult> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  try {
    return await encode(input, burner, cfg, codecOrder, signal, onProgress)
  } finally {
    input.dispose()
  }
}

async function encode(input: Input, burner: Burner, cfg: BurnConfig, codecOrder: string[], signal: AbortSignal, onProgress: (f: number) => void): Promise<VideoResult> {
  const track = await input.getPrimaryVideoTrack()
  if (!track || !(await track.canDecode())) throw new ExportError('This browser can’t decode the video’s codec for export. Try Chrome, or re-export the clip as H.264 MP4.')
  const duration = await track.computeDuration()
  const families = [...new Set(codecOrder.map(familyOf))]
  const codec = await getFirstEncodableVideoCodec(families, { width: cfg.width, height: cfg.height })
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
