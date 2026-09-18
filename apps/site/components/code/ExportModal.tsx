'use client'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import type { CRTOptions } from 'retro-crt'
import { EASE_OUT } from '@/lib/motion'
import { installCommand, snippet, TARGETS, TARGET_LABELS, type Target } from '@/lib/snippets'
import { standaloneHtml } from '@/lib/standalone'
import { CopyButton } from '../ui/CopyButton'
import { Modal } from '../ui/Modal'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { useReduceMotion } from '../ui/useReduceMotion'

const TABS = TARGETS.map((value) => ({ value, label: TARGET_LABELS[value] }))

export function ExportModal({ open, onClose, options }: { open: boolean; onClose: () => void; options: CRTOptions }) {
  const [tab, setTab] = useState<Target>('react')
  const toast = useToast()
  const reduce = useReduceMotion()
  const code = useMemo(() => (tab === 'html' ? standaloneHtml(options) : snippet(tab, options)), [tab, options])
  const install = installCommand(tab)

  const report = (ok: boolean) => toast(ok ? 'success' : 'error', ok ? 'Code copied successfully.' : 'Failed to copy the code. Try again.')

  return (
    <Modal open={open} onClose={onClose} title="Export code" description="Drop-in snippet with your current settings.">
      <div className="flex items-center justify-between gap-2 rounded-sm bg-neutral-800 py-3 pr-3 pl-4 outline outline-1 -outline-offset-1 outline-white/10">
        <code className="min-w-0 flex-1 truncate font-mono text-sm text-crt">{install ?? 'No install needed — this page is self-contained.'}</code>
        {install && <CopyButton text={install} label="Copy install command" onResult={(ok) => toast(ok ? 'success' : 'error', ok ? 'Command copied successfully.' : 'Failed to copy. Try again.')} />}
      </div>

      <div className="flex min-h-[400px] min-w-0 flex-col rounded-sm bg-neutral-800 outline outline-1 -outline-offset-1 outline-white/10">
        <div className="flex items-start justify-between gap-2 border-b border-white/10 px-3">
          <Tabs label="Export format" value={tab} options={TABS} onChange={setTab} controls="export-code" />
          <span className="flex h-9 shrink-0 items-center">
            <CopyButton text={code} label="Copy code" onResult={report} />
          </span>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            id="export-code"
            role="tabpanel"
            initial={{ opacity: 0, y: reduce ? 0 : 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <pre tabIndex={0} className="scrollbar-thin max-h-[min(52dvh,420px)] min-h-0 flex-1 overflow-auto p-4 font-mono text-sm whitespace-pre text-neutral-200">
              {code}
            </pre>
          </motion.div>
        </AnimatePresence>
      </div>
    </Modal>
  )
}
