import {
  Rejection,
  checkDeclaredType,
  checkDimensions,
  checkDuration,
  checkSignature,
  checkSize,
  imageDimensions,
  kindOf,
  type Format,
  type Kind,
} from './validate'

export interface Media {
  kind: Kind
  format: Format
  url: string
  width: number
  height: number
  duration: number
}

const HEADER_BYTES = 512 * 1024

function loadVideoMetadata(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.onloadedmetadata = () => resolve(video)
    video.onerror = () =>
      reject(new Rejection('This browser can’t decode the video’s codec. Re-export it as MP4 (H.264) or WebM (VP9).'))
    video.src = url
  })
}

function decodeImage(url: string): Promise<void> {
  const img = new Image()
  img.src = url
  return img.decode().catch(() => {
    throw new Rejection('The image couldn’t be decoded. It may be corrupted.')
  })
}

/**
 * Runs the §8.2 checks in order, cheapest first. The object URL is only created once the bytes and
 * header dimensions have passed, and it is revoked here on any later failure.
 */
export async function inspect(file: File): Promise<Media> {
  const format = checkDeclaredType(file.name, file.type)
  const kind = kindOf(format)
  const head = new Uint8Array(await file.slice(0, kind === 'image' ? HEADER_BYTES : 64).arrayBuffer())
  checkSignature(head, format)
  checkSize(file.size, kind)

  let width = 0
  let height = 0
  if (kind === 'image') {
    const dims = imageDimensions(head, format)
    if (!dims) throw new Rejection('Couldn’t read the image header. The file may be corrupted.')
    ;({ width, height } = dims)
    checkDimensions(width, height, kind)
  }

  const url = URL.createObjectURL(file)
  try {
    let duration = 0
    if (kind === 'video') {
      const video = await loadVideoMetadata(url)
      duration = video.duration
      width = video.videoWidth
      height = video.videoHeight
      video.removeAttribute('src')
      video.load()
      checkDuration(duration)
      checkDimensions(width, height, kind)
    } else await decodeImage(url)
    return { kind, format, url, width, height, duration }
  } catch (err) {
    URL.revokeObjectURL(url)
    throw err instanceof Rejection ? err : new Rejection('The file couldn’t be read. It may be corrupted.')
  }
}
