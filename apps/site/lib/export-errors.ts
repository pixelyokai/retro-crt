/** Shared by the eager export module and the lazily-loaded WebCodecs one. */
export class ExportError extends Error {}
export class Cancelled extends Error {}

export function asExportError(err: unknown): Error {
  if (err instanceof Cancelled || err instanceof ExportError) return err
  const text = err instanceof Error ? `${err.name} ${err.message}` : ''
  if (/memory|allocation|RangeError|QuotaExceeded/i.test(text))
    return new ExportError('The device ran out of memory. Try a smaller aspect ratio, a shorter clip, or close other tabs.')
  if (/decod/i.test(text)) return new ExportError('A frame couldn’t be decoded partway through. The file may be damaged; try re-exporting it.')
  return new ExportError('Export failed unexpectedly. Try again, or try a different browser.')
}
