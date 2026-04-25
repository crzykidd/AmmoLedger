import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteAmmo } from '@/api/ammo'
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
import type { AmmoBoxRead } from '@/types'

interface Props {
  box: AmmoBoxRead | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function DeleteAmmoDialog({ box, open, onOpenChange }: Props) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => deleteAmmo(box!.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ammo'] })
      onOpenChange(false)
    },
  })

  const caliberLabel = box ? `Box #${box.id}` : ''

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {caliberLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the ammo box and cannot be undone.
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
          >
            {mutation.isPending ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
