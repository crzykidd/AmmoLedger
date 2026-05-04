import { useQuery } from '@tanstack/react-query'
import { fetchThresholdStatus } from '@/api/thresholds'
import type { ThresholdStatusResponse } from '@/types'

const EMPTY: ThresholdStatusResponse = { calibers: [], locations: [], default_rounds: 200 }

export function useThresholdStatus() {
  const { data, isLoading } = useQuery({
    queryKey: ['thresholds', 'status'],
    queryFn: fetchThresholdStatus,
    staleTime: 30_000,
  })
  return { status: data ?? EMPTY, isLoading }
}
