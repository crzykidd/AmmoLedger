import { useMutation, useQueryClient } from '@tanstack/react-query'
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
import { deleteFirearm } from '@/api/firearms'
import { toast } from '@/hooks/use-toast'
import type { FirearmRead } from '@/types'

interface Props {
  firearm: FirearmRead | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}

export default function DeleteFirearmDialog({ firearm, open, onOpenChange, onDeleted }: Props) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => deleteFirearm(firearm!.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['firearms'] })
      toast({ title: 'Firearm deleted' })
      onOpenChange(false)
      onDeleted?.()
    },
    onError: (e: unknown) => {
      const msg = (e as { detail?: string })?.detail ?? 'Delete failed'
      toast({ title: 'Error', description: msg, variant: 'destructive' })
    },
  })

  const name = firearm
    ? `${firearm.manufacturer_name ?? ''} ${firearm.display_model}`.trim()
    : ''

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name || 'firearm'}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>This will permanently delete the firearm record.</p>
              <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 space-y-1">
                <li>All log entries (cleaning, service, notes) will be deleted.</li>
                <li>Tag links will be removed (the tags themselves remain).</li>
                <li>This cannot be undone.</li>
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              mutation.mutate()
            }}
            disabled={mutation.isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            {mutation.isPending ? 'Deleting…' : 'Delete Firearm'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
