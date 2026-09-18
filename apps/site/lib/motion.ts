/**
 * Motion tokens copied from the components this project was asked to move like: interior.dev
 * (segmented control, modal, copy button, tooltip group, dropdown, sticky header) and beui.dev
 * (underline tabs, range slider). Values only — neither library is a dependency.
 */

/** interior.dev's enter curve; beUI uses the same one. */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const
/** interior.dev's exit curve: linear-in so a closing surface leaves without lingering. */
export const EASE_LEAVE = [0.4, 0, 1, 1] as const

// interior.dev
export const SPRING_CELL = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const
export const SPRING_CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const
export const SPRING_SURFACE = { type: 'spring', stiffness: 420, damping: 36, mass: 0.9 } as const
export const SPRING_RISE = { type: 'spring', stiffness: 560, damping: 34, mass: 0.6 } as const
export const SPRING_WARM = { type: 'spring', stiffness: 900, damping: 48, mass: 0.5 } as const
/** The glide a tooltip surface takes when it moves between triggers in the same group. */
export const SPRING_TIP_GLIDE = { type: 'spring', stiffness: 520, damping: 40, mass: 0.75 } as const
export const SPRING_SLIDE = { type: 'spring', stiffness: 700, damping: 46, mass: 0.5 } as const
export const SPRING_SMOOTH = { stiffness: 240, damping: 44, mass: 0.6 } as const

// beui.dev
export const SPRING_TABS = { type: 'spring', stiffness: 170, damping: 30, mass: 1.2 } as const
export const SPRING_GLIDE = { type: 'spring', stiffness: 700, damping: 50, mass: 0.5 } as const
export const SPRING_PRESS = { type: 'spring', stiffness: 500, damping: 30, mass: 0.6 } as const
export const SPRING_BOUNCY = { type: 'spring', stiffness: 500, damping: 14, mass: 0.7 } as const
/** A click somewhere else on the track: the handle travels there and settles with one small bounce. */
export const SPRING_TOSS = { type: 'spring', stiffness: 420, damping: 22, mass: 0.7 } as const

export const DRAW = { duration: 0.26, ease: EASE_OUT } as const
export const INSTANT = { duration: 0 } as const

/** interior.dev's tooltip group timings: one cold wait, then neighbours open instantly. */
export const TOOLTIP_OPEN_MS = 200
export const TOOLTIP_CLOSE_MS = 120
export const TOOLTIP_SKIP_MS = 400
