import type { Metadata } from 'next'
import { ImageMode } from '@/components/image/ImageMode'

export const metadata: Metadata = {
  title: 'Image',
  description: 'Apply the CRT effect to your own image or video and download it. Everything runs in your browser; nothing is uploaded.',
}

export default function ImagePage() {
  return <ImageMode />
}
