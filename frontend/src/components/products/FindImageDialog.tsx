import { useEffect, useState } from 'react'
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChevronLeft, Loader2, Search } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import {
  commitProductImageFromSearch,
  previewProductImage,
  searchProductImages,
  type ImageSearchResultDto,
} from '@/api/products'
import type { ProductRead } from '@/types'

type Pane = 'search' | 'crop' | 'saving'

interface FindImageDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  productId: number
  defaultQuery: string
  onImageSaved: (product: ProductRead) => void
}

export function FindImageDialog({
  open,
  onOpenChange,
  productId,
  defaultQuery,
  onImageSaved,
}: FindImageDialogProps) {
  const [pane, setPane] = useState<Pane>('search')
  const [query, setQuery] = useState(defaultQuery)
  const [page, setPage] = useState(0)
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<ImageSearchResultDto[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewToken, setPreviewToken] = useState<string | null>(null)
  const [previewDims, setPreviewDims] = useState<{ w: number; h: number } | null>(null)
  const [crop, setCrop] = useState<Crop>()
  const [pixelCrop, setPixelCrop] = useState<PixelCrop | null>(null)

  useEffect(() => {
    if (open) {
      setPane('search')
      setQuery(defaultQuery)
      setPage(0)
      setResults([])
      setSearchError(null)
      setPreviewUrl(null)
      setPreviewToken(null)
      setPreviewDims(null)
      setCrop(undefined)
      setPixelCrop(null)
    }
  }, [open, defaultQuery])

  const runSearch = async (newPage = 0) => {
    if (!query.trim()) return
    setSearching(true)
    setSearchError(null)
    try {
      const res = await searchProductImages(productId, query.trim(), newPage)
      setResults(res.results)
      setPage(res.page)
    } catch (e: unknown) {
      const detail = (e as { detail?: string })?.detail ?? 'Search failed'
      setSearchError(detail)
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  const handleThumbClick = async (result: ImageSearchResultDto) => {
    setPane('crop')
    setPreviewUrl(null)
    setPreviewToken(null)
    setPreviewDims(null)
    try {
      const preview = await previewProductImage(productId, result.url)
      setPreviewUrl(preview.preview_url)
      setPreviewToken(preview.preview_token)
      setPreviewDims({ w: preview.width, h: preview.height })
      const size = Math.min(preview.width, preview.height)
      const x = (preview.width - size) / 2
      const y = (preview.height - size) / 2
      setCrop({
        unit: '%',
        x: (x / preview.width) * 100,
        y: (y / preview.height) * 100,
        width: (size / preview.width) * 100,
        height: (size / preview.height) * 100,
      })
    } catch (e: unknown) {
      const detail = (e as { detail?: string })?.detail ?? 'Could not load image'
      toast({ title: 'Image preview failed', description: detail, variant: 'destructive' })
      setPane('search')
    }
  }

  const handleCommit = async (useFullImage: boolean) => {
    if (!previewToken) return
    setPane('saving')
    try {
      const cropPayload = useFullImage || !pixelCrop ? null : {
        x: Math.round(pixelCrop.x),
        y: Math.round(pixelCrop.y),
        width: Math.round(pixelCrop.width),
        height: Math.round(pixelCrop.height),
      }
      const saved = await commitProductImageFromSearch(productId, previewToken, cropPayload)
      toast({ title: 'Product image updated' })
      onImageSaved(saved)
      onOpenChange(false)
    } catch (e: unknown) {
      const detail = (e as { detail?: string })?.detail ?? 'Could not save image'
      toast({ title: 'Save failed', description: detail, variant: 'destructive' })
      setPane('crop')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {pane === 'crop' ? 'Crop image' : pane === 'saving' ? 'Saving…' : 'Find image online'}
          </DialogTitle>
        </DialogHeader>

        {pane === 'search' && (
          <div className="flex flex-col gap-4">
            <form
              className="flex gap-2"
              onSubmit={(e) => { e.preventDefault(); void runSearch(0) }}
            >
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search query"
                autoFocus
              />
              <Button type="submit" disabled={searching || !query.trim()}>
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                <span className="ml-1.5">Search</span>
              </Button>
            </form>

            {searchError && (
              <p className="text-sm text-red-500">{searchError}</p>
            )}

            {results.length === 0 && !searching && !searchError && (
              <p className="text-sm text-gray-500 text-center py-8">
                Enter a search query and click Search to find product images.
              </p>
            )}

            {results.length > 0 && (
              <>
                <div className="grid grid-cols-5 gap-3">
                  {results.map((r, i) => (
                    <button
                      key={`${r.url}-${i}`}
                      type="button"
                      onClick={() => void handleThumbClick(r)}
                      className="aspect-square rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:border-gold focus:border-gold focus:outline-none transition-colors"
                      title={r.title ?? ''}
                    >
                      <img
                        src={r.thumbnail_url}
                        alt={r.title ?? ''}
                        className="w-full h-full object-contain"
                        referrerPolicy="no-referrer"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
                <div className="flex justify-between items-center pt-2">
                  <Button
                    variant="secondary"
                    onClick={() => void runSearch(Math.max(0, page - 1))}
                    disabled={page === 0 || searching}
                  >
                    ← Previous
                  </Button>
                  <span className="text-sm text-gray-500">Page {page + 1}</span>
                  <Button
                    variant="secondary"
                    onClick={() => void runSearch(page + 1)}
                    disabled={searching || results.length === 0}
                  >
                    Next →
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {pane === 'crop' && (
          <div className="flex flex-col gap-4">
            {!previewUrl ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gold" />
              </div>
            ) : (
              <>
                <div className="flex justify-center bg-gray-50 dark:bg-gray-900 rounded-lg p-2 max-h-[60vh] overflow-auto">
                  <ReactCrop
                    crop={crop}
                    onChange={(c) => setCrop(c)}
                    onComplete={(c) => {
                      if (previewDims) {
                        // onComplete returns display-pixel coords; convert to source-image pixels via %
                        // When crop unit is '%', c is already in percent — convert using source dims
                        if (crop && crop.unit === '%') {
                          setPixelCrop({
                            unit: 'px',
                            x: (c.x / 100) * previewDims.w,
                            y: (c.y / 100) * previewDims.h,
                            width: (c.width / 100) * previewDims.w,
                            height: (c.height / 100) * previewDims.h,
                          })
                        } else {
                          setPixelCrop(c)
                        }
                      }
                    }}
                    aspect={1}
                    keepSelection
                  >
                    <img
                      src={previewUrl}
                      alt="Crop preview"
                      style={{ maxHeight: '60vh', objectFit: 'contain' }}
                    />
                  </ReactCrop>
                </div>
                <div className="flex justify-between gap-2">
                  <Button variant="secondary" onClick={() => setPane('search')}>
                    <ChevronLeft className="w-4 h-4 mr-1" /> Back to results
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => void handleCommit(true)}>
                      Use full image
                    </Button>
                    <Button onClick={() => void handleCommit(false)}>
                      Save cropped
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {pane === 'saving' && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gold" />
            <p className="text-sm text-gray-500">Saving…</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
