const SAMPLE_MS = 2000
/** Median frame time above this means we're not holding ~45fps: time to shed cost (§3.3). */
const BUDGET_MS = 22

/**
 * Samples rAF intervals for ~2s and reports whether the median blew the budget.
 * Samples go into a preallocated buffer; nothing allocates per frame.
 */
export function sampleFrames(onResult: (overBudget: boolean) => void): () => void {
  const times = new Float64Array(240)
  let count = 0
  let last = 0
  let started = 0
  let frame = requestAnimationFrame(function tick(now) {
    if (last) times[count++ % times.length] = now - last
    else started = now
    last = now
    if (now - started < SAMPLE_MS) {
      frame = requestAnimationFrame(tick)
      return
    }
    const sorted = times.subarray(0, Math.min(count, times.length)).sort()
    onResult(sorted.length > 10 && sorted[sorted.length >> 1] > BUDGET_MS)
  })
  return () => cancelAnimationFrame(frame)
}
