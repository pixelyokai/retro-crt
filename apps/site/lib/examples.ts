/**
 * The bundled sample media. Image mode opens on the still so the effect is visible before anything
 * is uploaded; the code previews show the same two files.
 */
export const EXAMPLE_IMAGE = '/example.webp'
export const EXAMPLE_VIDEO = '/example.mp4'

const EXAMPLES = {
  image: { url: EXAMPLE_IMAGE, name: 'example.webp', type: 'image/webp' },
  video: { url: EXAMPLE_VIDEO, name: 'example.mp4', type: 'video/mp4' },
} as const

export type ExampleKind = keyof typeof EXAMPLES

/** Fetched as a File so the example takes exactly the same validate → inspect path as an upload. */
export async function loadExample(kind: ExampleKind, signal?: AbortSignal): Promise<File> {
  const { url, name, type } = EXAMPLES[kind]
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Could not load the example ${kind}.`)
  return new File([await response.blob()], name, { type })
}
