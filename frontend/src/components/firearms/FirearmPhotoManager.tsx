import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Star, Trash2, Upload, GripVertical, Loader2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  deleteFirearmPhoto,
  listFirearmPhotos,
  photoSrc,
  reorderPhotos,
  setDefaultPhoto,
  uploadFirearmPhoto,
} from '@/api/firearmPhotos'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { FirearmPhoto } from '@/types'

const MAX_PHOTOS = 5

interface Props {
  firearmId: number
  open: boolean
  onOpenChange: (o: boolean) => void
}

export default function FirearmPhotoManager({ firearmId, open, onOpenChange }: Props) {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadingCount, setUploadingCount] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<FirearmPhoto | null>(null)
  const [draggedId, setDraggedId] = useState<number | null>(null)
  const [dragOverId, setDragOverId] = useState<number | null>(null)
  const [localOrder, setLocalOrder] = useState<number[] | null>(null)

  const photosQuery = useQuery({
    queryKey: ['firearm-photos', firearmId],
    queryFn: () => listFirearmPhotos(firearmId),
    enabled: open,
  })
  const serverPhotos = photosQuery.data ?? []

  const orderedPhotos = useMemo(() => {
    if (!localOrder) return serverPhotos
    const byId = new Map(serverPhotos.map((p) => [p.id, p]))
    const inOrder = localOrder
      .map((id) => byId.get(id))
      .filter((p): p is FirearmPhoto => p != null)
    // Append any new server photos not in localOrder
    for (const p of serverPhotos) {
      if (!localOrder.includes(p.id)) inOrder.push(p)
    }
    return inOrder
  }, [serverPhotos, localOrder])

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['firearm-photos', firearmId] })
    void qc.invalidateQueries({ queryKey: ['firearm', firearmId] })
    void qc.invalidateQueries({ queryKey: ['firearms'] })
  }

  const setDefaultMutation = useMutation({
    mutationFn: (photoId: number) => setDefaultPhoto(firearmId, photoId),
    onSuccess: () => {
      invalidate()
      toast({ title: 'Default photo updated' })
    },
    onError: (e: unknown) => {
      const msg = (e as { detail?: string })?.detail ?? 'Could not set default'
      toast({ title: 'Error', description: msg, variant: 'destructive' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (photoId: number) => deleteFirearmPhoto(firearmId, photoId),
    onSuccess: () => {
      invalidate()
      setDeleteTarget(null)
      setLocalOrder(null)
      toast({ title: 'Photo deleted' })
    },
    onError: (e: unknown) => {
      const msg = (e as { detail?: string })?.detail ?? 'Delete failed'
      toast({ title: 'Error', description: msg, variant: 'destructive' })
    },
  })

  const reorderMutation = useMutation({
    mutationFn: (items: { photo_id: number; sort_order: number }[]) =>
      reorderPhotos(firearmId, items),
    onSuccess: () => {
      invalidate()
      setLocalOrder(null)
    },
    onError: (e: unknown) => {
      const msg = (e as { detail?: string })?.detail ?? 'Reorder failed'
      toast({ title: 'Error', description: msg, variant: 'destructive' })
      setLocalOrder(null)
    },
  })

  const handleUploadFiles = async (files: FileList | File[]) => {
    setUploadError(null)
    const arr = Array.from(files)
    const remainingSlots = Math.max(0, MAX_PHOTOS - serverPhotos.length)
    if (remainingSlots === 0) {
      setUploadError(`This firearm already has ${MAX_PHOTOS} photos.`)
      return
    }
    const toUpload = arr.slice(0, remainingSlots)
    if (arr.length > remainingSlots) {
      toast({
        title: 'Some files skipped',
        description: `Only ${remainingSlots} of ${arr.length} files uploaded — limit is ${MAX_PHOTOS}.`,
      })
    }
    setUploadingCount(toUpload.length)
    let succeeded = 0
    for (const f of toUpload) {
      try {
        await uploadFirearmPhoto(firearmId, f)
        succeeded += 1
      } catch (e: unknown) {
        const msg = (e as { message?: string })?.message ?? 'Upload failed'
        setUploadError(msg)
        break
      } finally {
        setUploadingCount((c) => Math.max(0, c - 1))
      }
    }
    invalidate()
    if (succeeded > 0) {
      toast({ title: `${succeeded} photo${succeeded === 1 ? '' : 's'} uploaded` })
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Drag-and-drop reordering (vanilla HTML5 DnD).
  const handleDragStart = (id: number) => setDraggedId(id)
  const handleDragOver = (e: React.DragEvent, id: number) => {
    e.preventDefault()
    if (draggedId !== null && id !== draggedId) setDragOverId(id)
  }
  const handleDragLeave = () => setDragOverId(null)
  const handleDrop = (e: React.DragEvent, targetId: number) => {
    e.preventDefault()
    setDragOverId(null)
    if (draggedId === null || draggedId === targetId) return
    const ids = orderedPhotos.map((p) => p.id)
    const fromIdx = ids.indexOf(draggedId)
    const toIdx = ids.indexOf(targetId)
    if (fromIdx < 0 || toIdx < 0) return
    const next = [...ids]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    setLocalOrder(next)
    setDraggedId(null)
    reorderMutation.mutate(
      next.map((id, i) => ({ photo_id: id, sort_order: i })),
    )
  }
  const handleDragEnd = () => {
    setDraggedId(null)
    setDragOverId(null)
  }

  const photoCount = serverPhotos.length
  const atCap = photoCount >= MAX_PHOTOS

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Manage Photos</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Upload zone */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  void handleUploadFiles(e.target.files)
                }
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={atCap || uploadingCount > 0}
              className={cn(
                'w-full rounded-xl border-2 border-dashed transition-colors',
                'flex flex-col items-center justify-center gap-2 p-6',
                atCap
                  ? 'border-gray-200 dark:border-gray-800 text-gray-400 cursor-not-allowed'
                  : 'border-gray-300 dark:border-gray-700 hover:border-gold hover:bg-gold/5 text-gray-600 dark:text-gray-300',
              )}
            >
              {uploadingCount > 0 ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <p className="text-sm font-medium">Uploading…</p>
                </>
              ) : (
                <>
                  <Upload className="w-6 h-6" />
                  <p className="text-sm font-medium">
                    {atCap ? 'Maximum reached' : 'Click to upload photos'}
                  </p>
                  <p className="text-xs text-gray-500">JPEG / PNG / WebP · max 10 MB each</p>
                </>
              )}
            </button>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {photoCount} of {MAX_PHOTOS} used
            </p>
            {uploadError && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">{uploadError}</p>
            )}
          </div>

          {/* Photo grid */}
          {photosQuery.isLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : orderedPhotos.length === 0 ? (
            <p className="text-sm text-gray-400 italic">
              No photos yet. Upload up to {MAX_PHOTOS} — the first becomes the default.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {orderedPhotos.map((p) => (
                <div
                  key={p.id}
                  draggable
                  onDragStart={() => handleDragStart(p.id)}
                  onDragOver={(e) => handleDragOver(e, p.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, p.id)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    'relative rounded-lg border bg-white dark:bg-gray-900 overflow-hidden group',
                    'border-gray-200 dark:border-gray-800',
                    dragOverId === p.id && 'ring-2 ring-gold',
                    draggedId === p.id && 'opacity-50',
                  )}
                >
                  <div className="aspect-square bg-gray-100 dark:bg-gray-800">
                    <img
                      src={photoSrc(p.thumb_url)}
                      alt={p.original_name ?? 'firearm photo'}
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  </div>
                  <div className="absolute top-1 left-1 cursor-grab text-white drop-shadow">
                    <GripVertical className="w-4 h-4" />
                  </div>
                  {p.is_default && (
                    <div className="absolute top-1 right-1 inline-flex items-center gap-1 rounded-full bg-gold text-navy px-2 py-0.5 text-[10px] font-semibold shadow">
                      <Star className="w-3 h-3" />
                      Default
                    </div>
                  )}
                  <div className="p-2 flex gap-1">
                    {!p.is_default && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2 text-xs flex-1"
                        onClick={() => setDefaultMutation.mutate(p.id)}
                        disabled={setDefaultMutation.isPending}
                      >
                        <Star className="w-3 h-3 mr-1" />
                        Default
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 w-7 p-0 hover:bg-red-500/10 hover:text-red-500"
                      onClick={() => setDeleteTarget(p)}
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete photo?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.is_default
                ? 'This is the default photo. The next photo by sort order will become the default.'
                : 'This photo will be permanently removed.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
              }}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  )
}
