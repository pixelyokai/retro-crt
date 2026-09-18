import { useSyncExternalStore } from 'react'

const noop = () => () => {}

/** False during SSR and hydration, true after: portals must not render until then. */
export const useMounted = () => useSyncExternalStore(noop, () => true, () => false)
