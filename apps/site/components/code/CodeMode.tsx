'use client'
import { CRTScreen } from '@retro-crt/react'
import { useState } from 'react'
import { AppShell } from '../AppShell'
import { PrimaryAction, Sidebar } from '../Sidebar'
import { CodeIcon } from '../ui/icons'
import { Segmented } from '../ui/Segmented'
import { useCrt } from '../useCrt'
import { ExportModal } from './ExportModal'
import { PREVIEWS, PreviewContent, type Preview } from './previews'

export function CodeMode() {
  const crt = useCrt()
  const [preview, setPreview] = useState<Preview>('text')
  const [exporting, setExporting] = useState(false)

  return (
    <AppShell
      stage={
        // Landscape on a desktop stage, portrait on a phone: a CRT wrapping a real app takes the
        // shape of its viewport, so the preview shows the one you would actually ship.
        <div className="aspect-[9/16] max-h-full w-full max-w-[min(100%,calc((58dvh-150px)*9/16))] lg:aspect-[4/3] lg:max-w-[min(100%,calc((100dvh-180px)*4/3))]">
          {/* Remounting per preview lets the renderer re-resolve for the new content. */}
          <CRTScreen key={preview} className="size-full rounded-sm" {...crt.options} onRendererChange={crt.onRendererChange}>
            <PreviewContent kind={preview} />
          </CRTScreen>
        </div>
      }
      controls={
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-300">Preview</span>
          <Segmented label="Preview content" variant="bare" value={preview} options={PREVIEWS} onChange={setPreview} />
        </div>
      }
      sidebar={
        <Sidebar
          store={crt}
          action={
            <>
              <PrimaryAction icon={<CodeIcon />} label="Export" onClick={() => setExporting(true)} />
              <ExportModal open={exporting} onClose={() => setExporting(false)} options={crt.options} />
            </>
          }
        />
      }
    />
  )
}
