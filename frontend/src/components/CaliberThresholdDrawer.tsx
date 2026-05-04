import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createCaliberThreshold, deleteCaliberThreshold } from '@/api/thresholds'
import type { CaliberStatus } from '@/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  caliber: CaliberStatus | null
  isAdmin: boolean
  defaultRounds: number
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{value}</span>
    </div>
  )
}

export function CaliberThresholdDrawer({ open, onOpenChange, caliber, isAdmin, defaultRounds }: Props) {
  const qc = useQueryClient()
  const [roundsInput, setRoundsInput] = useState('')
  const [saved, setSaved] = useState(false)

  const saveMutation = useMutation({
    mutationFn: ({ caliber_id, rounds }: { caliber_id: number; rounds: number }) =>
      createCaliberThreshold(caliber_id, rounds),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['thresholds', 'status'] })
      void qc.invalidateQueries({ queryKey: ['thresholds', 'calibers'] })
      void qc.invalidateQueries({ queryKey: ['thresholds', 'low-stock'] })
      setSaved(true)
      setTimeout(() => {
        setSaved(false)
        onOpenChange(false)
      }, 800)
    },
  })

  const resetMutation = useMutation({
    mutationFn: (caliber_id: number) => deleteCaliberThreshold(caliber_id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['thresholds', 'status'] })
      void qc.invalidateQueries({ queryKey: ['thresholds', 'calibers'] })
      void qc.invalidateQueries({ queryKey: ['thresholds', 'low-stock'] })
      onOpenChange(false)
    },
  })

  if (!caliber) return null

  const currentInput = roundsInput !== '' ? roundsInput : String(caliber.threshold)

  const handleSave = () => {
    const rounds = parseInt(currentInput, 10)
    if (isNaN(rounds) || rounds < 0) return
    saveMutation.mutate({ caliber_id: caliber.caliber_id, rounds })
  }

  const handleClose = (o: boolean) => {
    if (!o) setRoundsInput('')
    onOpenChange(o)
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent title={caliber.caliber_name} description="Caliber threshold settings">
        <SheetHeader>
          <SheetTitle>{caliber.caliber_name}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-auto px-6 py-6 space-y-6">
          {/* Info rows */}
          <div>
            <InfoRow label="Rounds on Hand" value={caliber.rounds_on_hand.toLocaleString()} />
            <InfoRow label="Threshold" value={caliber.threshold.toLocaleString()} />
            <InfoRow
              label="Source"
              value={caliber.is_override ? 'Per-Caliber Override' : `Global Default (${defaultRounds.toLocaleString()})`}
            />
          </div>

          {/* Admin edit controls */}
          {isAdmin && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                Admin Controls
              </p>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Custom threshold for {caliber.caliber_name}
              </label>
              <Input
                type="number"
                min={0}
                value={currentInput}
                onChange={(e) => setRoundsInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
            </div>
          )}
        </div>

        {isAdmin && (
          <SheetFooter>
            {caliber.is_override && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => resetMutation.mutate(caliber.caliber_id)}
                disabled={resetMutation.isPending || saveMutation.isPending}
              >
                Reset to Default
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saveMutation.isPending || saved}
            >
              {saved ? (
                <><Check className="h-3.5 w-3.5 mr-1" /> Saved</>
              ) : (
                saveMutation.isPending ? 'Saving…' : 'Save'
              )}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
