export type Role = 'admin' | 'member' | 'read_only'

export interface User {
  id: number
  email: string
  first_name: string
  last_name: string
  role: Role
  is_active: boolean
}

export interface ApiError {
  detail: string
}

export type MeResponse = User | { first_run: true }

// ---------------------------------------------------------------------------
// Lookup types
// ---------------------------------------------------------------------------

export interface LookupItem {
  id: number
  name: string
  is_active: boolean
  source: string
}

export interface LocationItem {
  id: number
  name: string
  notes: string | null
}

export interface ContainerItem {
  id: number
  name: string
  location_id: number | null
  notes: string | null
}

export interface DealerItem {
  id: number
  name: string
  url: string | null
  is_active: boolean
  source: string
}

// ---------------------------------------------------------------------------
// Threshold types (stored client-side in localStorage)
// ---------------------------------------------------------------------------

export interface ThresholdConfig {
  default_rounds: number
  default_boxes: number
  caliber_overrides: Record<string, { rounds?: number; boxes?: number }>
}

export interface CaliberSummary {
  caliber_id: number
  caliber_name: string
  total_rounds: number
  box_count: number
  is_low: boolean
}

// ---------------------------------------------------------------------------
// Expenditure types — mirrors backend schemas.py
// ---------------------------------------------------------------------------

export interface ExpendRequest {
  rounds_used: number
  date: string            // YYYY-MM-DD
  notes?: string | null
}

export interface ExpenditureRead {
  id: number
  ammo_box_id: number
  logged_by: number
  rounds_used: number
  date: string            // YYYY-MM-DD
  log_type: string
  related_ids: string | null
  notes: string | null
  created_at: string      // ISO datetime
}

export interface ExpendResponse {
  box: AmmoBoxRead
  log_entry: ExpenditureRead
}

// ---------------------------------------------------------------------------
// Ammo box types — mirrors backend schemas.py
// ---------------------------------------------------------------------------

export interface AmmoBoxRead {
  id: number
  owner_id: number
  is_shared: boolean
  caliber_id: number
  manufacturer_id: number
  product_name: string | null
  gr_oz: number | null
  weight_unit: string | null
  type_id: number | null
  category_id: number | null
  qty_original: number
  qty_remaining: number
  purchase_date: string | null   // ISO date string
  cost_per_round: number | null
  dealer_id: number | null
  container_id: number | null
  legacy_id: string | null
  notes: string | null
  split_from_id: number | null
  is_archived: boolean
  archive_reason: string | null
  created_at: string
  updated_at: string
}

export interface AmmoListResponse {
  boxes: AmmoBoxRead[]
  total_boxes: number
  total_rounds: number
  total_value: number | null
}

export interface AmmoBoxCreate {
  caliber_id: number
  manufacturer_id: number
  qty_original: number
  product_name?: string
  qty_remaining?: number
  is_shared?: boolean
  gr_oz?: number
  weight_unit?: string
  type_id?: number
  category_id?: number
  purchase_date?: string
  cost_per_round?: number
  dealer_id?: number
  container_id?: number
  legacy_id?: string
  notes?: string
}

export interface AmmoBoxUpdate {
  caliber_id?: number
  manufacturer_id?: number
  product_name?: string
  qty_original?: number
  qty_remaining?: number
  is_shared?: boolean
  gr_oz?: number
  weight_unit?: string
  type_id?: number
  category_id?: number
  purchase_date?: string
  cost_per_round?: number
  dealer_id?: number
  container_id?: number
  legacy_id?: string
  notes?: string
  is_archived?: boolean
  archive_reason?: string
}
