import { useQuery } from '@tanstack/react-query'
import { getSplitParents } from '@/api/ammo'

export function useSplitParents() {
  return useQuery({
    queryKey: ['ammo', 'split-parents'],
    queryFn: getSplitParents,
    staleTime: 30_000,
  })
}
