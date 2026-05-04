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
  community_key?: string | null
  is_imported: boolean
  usage_count: number
}

export interface LocationItem {
  id: number
  name: string
  notes: string | null
  is_active: boolean
  source: string
  usage_count: number
}

export interface ContainerItem {
  id: number
  name: string
  location_id: number | null
  notes: string | null
  is_active: boolean
  source: string
  usage_count: number
}

export interface ManufacturerItem {
  id: number
  name: string
  url: string | null
  is_active: boolean
  source: string
  community_key?: string | null
  is_imported: boolean
  usage_count: number
}

export interface DealerItem {
  id: number
  name: string
  url: string | null
  is_active: boolean
  source: string
  community_key?: string | null
  is_imported: boolean
  types?: string | null
  country?: string | null
  state?: string | null
  is_standard_geo: boolean
  usage_count: number
}

export interface CommunityTableStatus {
  total: number
  imported: number
  pending: number
  hidden: number
  last_synced: string | null
}

export interface CommunityStatus {
  dealers: CommunityTableStatus
  manufacturers: CommunityTableStatus
  calibers: CommunityTableStatus
  ammo_types: CommunityTableStatus
}

export interface CommunityContribute {
  yaml: string
  count: number
  github_url: string
}

// ---------------------------------------------------------------------------
// Threshold types (server-side API)
// ---------------------------------------------------------------------------

export interface CaliberStatus {
  caliber_id: number
  caliber_name: string
  rounds_on_hand: number
  threshold: number
  is_low: boolean
  is_override: boolean
}

export interface LocationStatus {
  location_id: number
  location_name: string
  rounds_on_hand: number
  threshold: number
  is_low: boolean
}

export interface ThresholdStatusResponse {
  calibers: CaliberStatus[]
  locations: LocationStatus[]
  default_rounds: number
}

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
  product_id: number | null
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
  location_id: number | null
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

export interface ResetTokenInfo {
  source: 'db' | 'config'
  user_id: number | null
  email: string | null
  first_name: string | null
  last_name: string | null
}

export interface RecentExpenditure {
  id: number
  ammo_box_id: number
  caliber_name: string
  manufacturer_name: string
  product_name: string | null
  rounds_used: number
  date: string
  logged_by_name: string
  notes: string | null
}

export interface AmmoBoxCreate {
  caliber_id: number
  manufacturer_id: number
  product_id?: number | null
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
  location_id?: number
  container_id?: number
  legacy_id?: string
  notes?: string
}

export interface AmmoBoxUpdate {
  caliber_id?: number
  manufacturer_id?: number
  product_id?: number | null
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
  location_id?: number
  container_id?: number
  legacy_id?: string
  notes?: string
  is_archived?: boolean
  archive_reason?: string
}

// ---------------------------------------------------------------------------
// Bulk update types — mirrors backend schemas.py
// ---------------------------------------------------------------------------

export interface BulkAmmoUpdate {
  manufacturer_id?: number | null
  type_id?: number | null
  category_id?: number | null
  ammo_condition_id?: number | null
  dealer_id?: number | null
  location_id?: number | null
  container_id?: number | null
  is_shared?: boolean | null
  cost_per_round?: number | null
  notes?: string | null
}

export interface BulkUpdateRequest {
  ids: number[]
  updates: BulkAmmoUpdate
  notes_mode: 'replace' | 'append'
}

export interface BulkUpdateResponse {
  updated: number
  failed: number
}

// ---------------------------------------------------------------------------
// Product catalog types
// ---------------------------------------------------------------------------

export interface ProductRead {
  id: number
  name: string
  caliber_id: number
  manufacturer_id: number
  product_name: string | null
  gr_oz: number | null
  weight_unit: string | null
  type_id: number | null
  category_id: number | null
  ammo_condition_id: number | null
  default_cost: number | null
  upc: string | null
  image_path: string | null
  notes: string | null
  owner_id: number
  is_shared: boolean
  created_at: string
  updated_at: string
  caliber_name: string | null
  manufacturer_name: string | null
  type_name: string | null
  category_name: string | null
  condition_name: string | null
  usage_count: number
}

export interface ProductCreate {
  caliber_id: number
  manufacturer_id: number
  product_name?: string | null
  gr_oz?: number | null
  weight_unit?: string | null
  type_id?: number | null
  category_id?: number | null
  ammo_condition_id?: number | null
  default_cost?: number | null
  upc?: string | null
  notes?: string | null
  is_shared?: boolean
}

export interface ProductUpdate {
  caliber_id?: number
  manufacturer_id?: number
  product_name?: string | null
  gr_oz?: number | null
  weight_unit?: string | null
  type_id?: number | null
  category_id?: number | null
  ammo_condition_id?: number | null
  default_cost?: number | null
  upc?: string | null
  notes?: string | null
  is_shared?: boolean
}

export interface AutoGenerateResponse {
  products_created: number
  boxes_linked: number
  boxes_unlinked: number
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

export interface SimilarityMatch {
  field: string
  csv_value: string
  existing_value: string
  table_key: string
  default_action: 'use_existing' | 'import_new'
}

export interface ImportValidationResult {
  valid: boolean
  total_rows: number
  importable_rows: number
  error_rows: number
  warning_count: number
  new_values: Record<string, string[]>
  similarity_matches: SimilarityMatch[]
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

// ---------------------------------------------------------------------------
// Task types
// ---------------------------------------------------------------------------

export interface TaskHistory {
  id: number
  task_name: string
  started_at: string
  ended_at: string | null
  duration_ms: number | null
  status: 'running' | 'ok' | 'failed' | 'skipped'
  error_message: string | null
  details: string | null
  triggered_by: 'scheduler' | 'manual'
}

export interface TaskRegistry {
  id: number
  task_key: string
  name: string
  description: string | null
  interval_type: 'hours' | 'daily' | 'cron'
  interval_value: string
  enabled: boolean
  last_run_at: string | null
  last_status: string | null
  last_duration_ms: number | null
  next_run_at: string | null
  created_at: string
  warnings?: string[] | null
}

export interface TaskConstraints {
  allowed_modes: ('hours' | 'daily')[]
  min_hours?: number
  max_hours?: number
  requires_exclusive?: boolean
}
