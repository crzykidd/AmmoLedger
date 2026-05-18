import { useEffect, useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { photoSrc } from '@/api/firearmPhotos'
import type { FirearmPhoto } from '@/types'

interface Props {
  photos: FirearmPhoto[]
  initialIndex: number
  open: boolean
  onClose: () => void
}

export default function PhotoLightbox({ photos, initialIndex, open, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex)

  useEffect(() => {
    if (open) setIndex(initialIndex)
  }, [open, initialIndex])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') setIndex((i) => (i - 1 + photos.length) % photos.length)
      else if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % photos.length)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, photos.length, onClose])

  if (!open || photos.length === 0) return null
  const photo = photos[Math.min(index, photos.length - 1)]
  if (!photo) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        type="button"
        className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full bg-black/40 hover:bg-black/60"
        onClick={(e) => { e.stopPropagation(); onClose() }}
        aria-label="Close"
      >
        <X className="w-6 h-6" />
      </button>

      {photos.length > 1 && (
        <>
          <button
            type="button"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-2 rounded-full bg-black/40 hover:bg-black/60"
            onClick={(e) => {
              e.stopPropagation()
              setIndex((i) => (i - 1 + photos.length) % photos.length)
            }}
            aria-label="Previous"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            type="button"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-2 rounded-full bg-black/40 hover:bg-black/60"
            onClick={(e) => {
              e.stopPropagation()
              setIndex((i) => (i + 1) % photos.length)
            }}
            aria-label="Next"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      <img
        src={photoSrc(photo.url)}
        alt={photo.original_name ?? 'firearm photo'}
        className="max-w-[90vw] max-h-[90vh] object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      {photos.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/80 text-sm bg-black/40 rounded-full px-3 py-1">
          {index + 1} / {photos.length}
        </div>
      )}
    </div>
  )
}
