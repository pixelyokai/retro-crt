import { defineComponent, h, onBeforeUnmount, onMounted, ref, shallowRef, watch, type PropType } from 'vue'
import { CRT, type CRTOptions, type CRTScreen as Screen } from 'retro-crt'

type O = CRTOptions
// Booleans default to `undefined`: Vue would otherwise coerce an absent prop to `false` and override core defaults.
const flag = { type: Boolean, default: undefined }

const optionProps = {
  renderer: String as PropType<O['renderer']>,
  background: String,
  curvature: Number,
  vignette: Number,
  scanlines: Object as PropType<O['scanlines']>,
  tint: Object as PropType<O['tint']>,
  bloom: Object as PropType<O['bloom']>,
  chromaticAberration: Object as PropType<O['chromaticAberration']>,
  noise: Object as PropType<O['noise']>,
  persistence: Object as PropType<O['persistence']>,
  bezel: Object as PropType<O['bezel']>,
  quality: String as PropType<O['quality']>,
  maxPixelRatio: Number,
  pauseWhenOffscreen: flag,
  respectReducedMotion: flag,
  respectSaveData: flag,
}
const KEYS = Object.keys(optionProps) as (keyof typeof optionProps)[]

export const CRTScreen = defineComponent({
  name: 'CRTScreen',
  props: { ...optionProps, options: Object as PropType<O> },
  emits: { rendererChange: (_screen: Pick<Screen, 'activeRenderer' | 'activeQuality'>) => true },
  setup(props, { slots, emit }) {
    const host = ref<HTMLElement>()
    const screen = shallowRef<Screen>()
    // A whole-config `options` object is what the site exports; individual props override it.
    const collect = (): O => ({ ...props.options, ...Object.fromEntries(KEYS.filter((k) => props[k] !== undefined).map((k) => [k, props[k]])) })

    onMounted(() => {
      if (!host.value) return
      const s = CRT.mount(host.value, collect())
      s.subscribe((next) => emit('rendererChange', next))
      emit('rendererChange', s)
      screen.value = s
    })
    watch(collect, (o) => screen.value?.set(o), { deep: true })
    onBeforeUnmount(() => screen.value?.destroy())

    return () => h('div', { ref: host }, [h('div', { 'data-rcrt-content': '' }, slots.default?.())])
  },
})

export type { CRTOptions }
