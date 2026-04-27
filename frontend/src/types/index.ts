export type Role = 'admin' | 'member' | 'read_only'

export interface User {
  id: number
  email: string
  first_name: string
  last_name: string
  role: Role
  is_active: boolean
  must_change_password?: boolean
  created_at?: string
  last_login_at?: string | null
}

export interface UserRead {
  id: number
  email: string
  first_name: string
  last_name: string
  role: string
  is_active: boolean
  must_change_password: boolean
  created_at: string
  last_login_at: string | null
}

export interface InviteRead {
  id: number
  token: string
  created_by: number
  created_at: string
  expires_at: string
  used_at: string | null
  used_by: number | null
  role: string
  email_hint: string | null
  is_revoked: boolean
  status: 'valid' | 'expired' | 'used' | 'revoked'
  invite_url?: string | null
}

export interface InviteCreate {
  role: string
  email_hint?: string
  expires_hours?: number
}

export interface ApiError {
  detail: string | { error: boolean; code: string; message: string }
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

export interface ManufacturerItem {
  id: number
  name: string
  url: string | null
  is_active: boolean
  source: string
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
// Threshold types (server-side API)
// ---------------------------------------------------------------------------

export interface CaliberThreshold {
  id: number
  caliber_id: number
  caliber_name: string
  rounds: number
  rounds_on_hand: number
  is_low: boolean
}

export interface LocationThreshold {
  id: number
  location_id: number
  location_name: string
  rounds: number
  rounds_on_hand: number
  is_low: boolean
}

export interface LowStockCaliberItem {
  caliber_id: number
  caliber_name: string
  rounds_on_hand: number
  threshold: number
}

export interface LowStockLocationItem {
  location_id: number
  location_name: string
  rounds_on_hand: number
  threshold: number
}

export interface LowStockResponse {
  calibers: LowStockCaliberItem[]
  locations: LowStockLocationItem[]
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
  ammo_condition_id: number | null
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
  ammo_condition_id?: number
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
  ammo_condition_id?: number
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

// ---------------------------------------------------------------------------
// Import types
// ---------------------------------------------------------------------------

export interface LegacyIdMode {
  all_integers: boolean
  conflict_count: number
  conflicting_ids: number[]
  has_more_conflicts: boolean
  blank_count: number
  eligible: boolean
}

export interface ImportValidationResult {
  valid: boolean
  total_rows: number
  importable_rows: number
  error_rows: number
  warning_count: number
  new_values: Record<string, string[]>
  errors: { row: number; field: string; message: string }[]
  warnings: { row: number | null; field: string; message: string }[]
  legacy_id_mode: LegacyIdMode
  validation_token: string
  token_expires_at: string
}

export interface ImportConfirmResult {
  success: boolean
  imported: number
  skipped: number
  new_lookup_values_created: number
  pre_import_backup: string
  legacy_id_mode_used: boolean
  autoincrement_reset_to?: number
  warnings: { row: number | null; field: string; message: string }[]
}
