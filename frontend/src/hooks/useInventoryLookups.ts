import { useQuery } from '@tanstack/react-query'
import {
  getCalibersLookup,
  getManufacturers,
  getAmmoTypes,
  getAmmoConditions,
  getCategories,
  getDealers,
  getLocations,
  getContainers,
} from '@/api/lookups'

const STALE = 5 * 60 * 1000

export function useInventoryLookups() {
  const calibers = useQuery({ queryKey: ['calibers'], queryFn: getCalibersLookup, staleTime: STALE })
  const manufacturers = useQuery({ queryKey: ['manufacturers'], queryFn: getManufacturers, staleTime: STALE })
  const ammoTypes = useQuery({ queryKey: ['ammo-types'], queryFn: getAmmoTypes, staleTime: STALE })
  const ammoConditions = useQuery({ queryKey: ['ammo-conditions'], queryFn: getAmmoConditions, staleTime: STALE })
  const categories = useQuery({ queryKey: ['categories'], queryFn: getCategories, staleTime: STALE })
  const dealers = useQuery({ queryKey: ['dealers'], queryFn: getDealers, staleTime: STALE })
  const locations = useQuery({ queryKey: ['locations'], queryFn: getLocations, staleTime: STALE })
  const containers = useQuery({ queryKey: ['containers'], queryFn: getContainers, staleTime: STALE })

  return {
    calibers: calibers.data ?? [],
    manufacturers: manufacturers.data ?? [],
    ammoTypes: ammoTypes.data ?? [],
    ammoConditions: ammoConditions.data ?? [],
    categories: categories.data ?? [],
    dealers: dealers.data ?? [],
    locations: locations.data ?? [],
    containers: containers.data ?? [],
    isLoading:
      calibers.isLoading ||
      manufacturers.isLoading ||
      ammoTypes.isLoading ||
      ammoConditions.isLoading ||
      categories.isLoading ||
      dealers.isLoading ||
      locations.isLoading ||
      containers.isLoading,
  }
}
