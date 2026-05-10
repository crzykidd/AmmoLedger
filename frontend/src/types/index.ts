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
  /** JSON-encoded array, e.g. '["ammo"]' or '["ammo","firearm"]'. Parse via parseManufacturerTypes(). */
  types: string | null
  usage_count: number
}

export type ManufacturerDomain = 'ammo' | 'firearm'

/** Parse manufacturers.types JSON column. NULL → ["ammo"] (matches the migration backfill). */
export function parseManufacturerTypes(raw: string | null | undefined): ManufacturerDomain[] {
  if (raw === null || raw === undefined || raw === '') return ['ammo']
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is ManufacturerDomain => v === 'ammo' || v === 'firearm')
  } catch {
    return []
  }
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

// ---------------------------------------------------------------------------
// Firearm lookup types (P1a — firearm itself ships in P1b)
// ---------------------------------------------------------------------------

export interface FirearmActionTypeItem {
  id: number
  name: string
  is_active: boolean
  source: string
  community_key?: string | null
  is_imported: boolean
  usage_count: number
}

export interface FirearmModelItem {
  id: number
  manufacturer_id: number
  name: string
  default_caliber_id: number | null
  default_action_type_id: number | null
  /** Standard production barrel length (inches). Drives the firearm form
   *  drawer's auto-fill cascade alongside caliber + action type. */
  default_barrel_length_in: number | null
  is_active: boolean
  source: string
  community_key?: string | null
  is_imported: boolean
  manufacturer_name: string | null
  default_caliber_name: string | null
  default_action_type_name: string | null
  usage_count: number
}

/** Common shape for the four physical-attribute community lookups
 *  (frame size, optic cut, rail type, finish). All share the
 *  FirearmActionType pattern. */
export interface FirearmAttributeLookupItem {
  id: number
  name: string
  is_active: boolean
  source: string
  community_key?: string | null
  is_imported: boolean
  usage_count: number
}

export type FirearmFrameSizeItem = FirearmAttributeLookupItem
export type FirearmOpticCutItem = FirearmAttributeLookupItem
export type FirearmRailTypeItem = FirearmAttributeLookupItem
export type FirearmFinishItem = FirearmAttributeLookupItem

export interface FirearmComplianceTagItem {
  id: number
  name: string
  description: string | null
  jurisdiction: string | null
  is_active: boolean
  source: string
  community_key?: string | null
  is_imported: boolean
  usage_count: number
}

export interface FirearmUserTagItem {
  id: number
  owner_id: number
  name: string
  color: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Firearm registry types (P1b)
// ---------------------------------------------------------------------------

export type FirearmType = 'pistol' | 'rifle' | 'shotgun' | 'other'
export type FirearmEventType = 'cleaning' | 'service' | 'note'
export type CleaningStatus = 'ok' | 'due_soon' | 'overdue'

export interface FirearmRead {
  id: number
  owner_id: number
  is_shared: boolean

  manufacturer_id: number
  manufacturer_name: string | null
  firearm_model_id: number | null
  firearm_model_name: string | null
  custom_model_name: string | null
  /** firearm_model_name OR custom_model_name — frontend display convenience. */
  display_model: string

  firearm_type: FirearmType
  action_type_id: number | null
  action_type_name: string | null

  caliber_id: number
  caliber_name: string | null
  caliber_notes: string | null

  serial: string | null
  barrel_length_in: number | null
  // Physical attribute FKs (v0.3.0 — replaces free-text finish). Resolved
  // name fields populated by the router.
  frame_size_id: number | null
  frame_size_name: string | null
  optic_cut_id: number | null
  optic_cut_name: string | null
  rail_type_id: number | null
  rail_type_name: string | null
  finish_id: number | null
  finish_name: string | null
  standard_capacity: number | null
  purchase_date: string | null
  purchase_price: number | null
  dealer_id: number | null
  dealer_name: string | null
  notes: string | null

  rounds_lifetime: number
  rounds_since_clean: number
  last_cleaned_at: string | null
  service_interval_rounds: number | null
  service_interval_days: number | null
  cleaning_status: CleaningStatus

  compliance_tags: FirearmComplianceTagItem[]
  user_tags: FirearmUserTagItem[]

  created_at: string
  updated_at: string
}

export interface FirearmCreate {
  is_shared?: boolean
  manufacturer_id: number
  firearm_model_id?: number | null
  custom_model_name?: string | null
  firearm_type: FirearmType
  action_type_id?: number | null
  caliber_id: number
  caliber_notes?: string | null
  serial?: string | null
  barrel_length_in?: number | null
  frame_size_id?: number | null
  optic_cut_id?: number | null
  rail_type_id?: number | null
  finish_id?: number | null
  standard_capacity?: number | null
  purchase_date?: string | null
  purchase_price?: number | null
  dealer_id?: number | null
  notes?: string | null
  service_interval_rounds?: number | null
  service_interval_days?: number | null
  compliance_tag_ids?: number[]
  user_tag_ids?: number[]
}

export interface FirearmUpdate {
  is_shared?: boolean
  manufacturer_id?: number
  firearm_model_id?: number | null
  custom_model_name?: string | null
  firearm_type?: FirearmType
  action_type_id?: number | null
  caliber_id?: number
  caliber_notes?: string | null
  serial?: string | null
  barrel_length_in?: number | null
  frame_size_id?: number | null
  optic_cut_id?: number | null
  rail_type_id?: number | null
  finish_id?: number | null
  standard_capacity?: number | null
  purchase_date?: string | null
  purchase_price?: number | null
  dealer_id?: number | null
  notes?: string | null
  service_interval_rounds?: number | null
  service_interval_days?: number | null
  /** If provided, replaces the full set of compliance tag links (no delta). */
  compliance_tag_ids?: number[]
  /** If provided, replaces the full set of user tag links (no delta). */
  user_tag_ids?: number[]
}

export interface FirearmListFilters {
  firearm_type?: FirearmType
  manufacturer_id?: number
  caliber_id?: number
  /** Single status, OR comma-separated list of statuses (e.g. 'due_soon,overdue'). */
  cleaning_status?: CleaningStatus | string
  compliance_tag_id?: number
  user_tag_id?: number
}

export interface FirearmLogRead {
  id: number
  firearm_id: number
  event_type: FirearmEventType
  event_date: string
  rounds_at_event: number
  notes: string | null
  logged_by: number
  logged_by_name: string
  created_at: string
}

export interface FirearmLogCreate {
  event_type: FirearmEventType
  event_date: string
  /** Defaults server-side to firearm.rounds_lifetime when omitted. */
  rounds_at_event?: number | null
  notes?: string | null
}

export interface FirearmLogUpdate {
  event_type?: FirearmEventType
  event_date?: string
  rounds_at_event?: number | null
  notes?: string | null
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
  firearm_action_types?: CommunityTableStatus
  firearm_models?: CommunityTableStatus
  firearm_compliance_tags?: CommunityTableStatus
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
  archive_reason?: string | null
}

// ---------------------------------------------------------------------------
// Bulk update types — mirrors backend schemas.py
// ---------------------------------------------------------------------------

export interface BulkAmmoUpdate {
  product_id?: number | null
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

export interface ProductUpdateResponse {
  product: ProductRead
  boxes_updated: number
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
  archived_imported: number
  skipped: number
  new_lookup_values_created: number
  pre_import_backup: string
  legacy_id_mode_used: boolean
  autoincrement_reset_to?: number
  warnings: { row: number | null; field: string; message: string }[]
}

// ---------------------------------------------------------------------------
// Firearms import types — parallel to the ammo import shape, with two
// firearms-specific extras: similarity matches may include a
// `manufacturer_context` (cascading model lookups), and `new_values` may
// carry a `firearm_models_by_manufacturer: {mfr: [models]}` group instead
// of a flat list.
// ---------------------------------------------------------------------------

export interface FirearmsImportSimilarityMatch {
  field: string
  csv_value: string
  existing_value: string
  table_key: string
  /** Set only for cascading model matches — names the manufacturer the model is scoped under. */
  manufacturer_context?: string
  default_action: 'use_existing' | 'import_new'
}

export interface FirearmsImportValidationResult {
  valid: boolean
  total_rows: number
  importable_rows: number
  error_rows: number
  warning_count: number
  /** Flat lookup table → unmatched values, plus the special key
   *  "firearm_models_by_manufacturer" which maps manufacturer name → unmatched models. */
  new_values: Record<string, string[] | Record<string, string[]>>
  similarity_matches: FirearmsImportSimilarityMatch[]
  errors: { row: number; field: string; message: string }[]
  warnings: { row: number | null; field: string; message: string }[]
  validation_token: string
  token_expires_at: string
}

export interface FirearmsImportConfirmResult {
  success: boolean
  imported: number
  skipped: number
  new_lookup_values_created: number
  synthetic_log_entries_created: number
  pre_import_backup: string
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

// ---------------------------------------------------------------------------
// Split parent lookup type — mirrors backend SplitParentRead
// ---------------------------------------------------------------------------

export interface SplitParentRead {
  id: number
  caliber_id: number
  manufacturer_id: number
  product_name: string | null
  qty_original: number
  qty_remaining: number
  is_archived: boolean
  archive_reason: string | null
  notes: string | null  // null when not visible to current user
  purchase_date: string | null
  created_at: string
  updated_at: string
  caliber_name: string
  manufacturer_name: string
}

// ---------------------------------------------------------------------------
// Split types — mirrors backend schemas.py
// ---------------------------------------------------------------------------

export interface SplitChildSpec {
  qty_original: number
}

export interface SplitRequest {
  split_type: 'full' | 'partial'
  children: SplitChildSpec[]
}

export interface SplitResponse {
  parent: AmmoBoxRead
  children: AmmoBoxRead[]
  log_entry: ExpenditureRead
}

// ---------------------------------------------------------------------------
// Range session types — mirrors backend schemas.py
// ---------------------------------------------------------------------------

export interface RangeSessionLineRead {
  id: number
  session_id: number
  firearm_id: number | null
  firearm_display: string | null
  ammo_box_id: number | null
  ammo_box_display: string | null
  rounds_fired: number
  notes: string | null
  created_at: string
}

export interface RangeSessionLineCreate {
  firearm_id?: number | null
  ammo_box_id?: number | null
  rounds_fired: number
  notes?: string | null
}

export interface RangeSessionLineUpdate {
  firearm_id?: number | null
  ammo_box_id?: number | null
  rounds_fired?: number
  notes?: string | null
}

export interface RangeSessionRead {
  id: number
  owner_id: number
  owner_name: string
  is_shared: boolean
  date: string            // YYYY-MM-DD
  location_name: string | null
  notes: string | null
  lines: RangeSessionLineRead[]
  total_rounds: number
  distinct_firearms: number
  distinct_boxes: number
  created_at: string
  updated_at: string
}

export interface RangeSessionCreate {
  is_shared?: boolean
  date: string            // YYYY-MM-DD
  location_name?: string | null
  notes?: string | null
  lines: RangeSessionLineCreate[]
}

export interface RangeSessionUpdate {
  is_shared?: boolean
  date?: string           // YYYY-MM-DD
  location_name?: string | null
  notes?: string | null
}

export interface RangeSessionListItem {
  id: number
  date: string            // YYYY-MM-DD
  location_name: string | null
  owner_id: number
  owner_name: string
  is_shared: boolean
  total_rounds: number
  distinct_firearms: number
  distinct_boxes: number
  line_count: number
  /** Populated only when the list is filtered by firearm_id — sum of
   *  rounds_fired across this session's lines that reference the filter
   *  firearm. Powers per-firearm totals on the firearm detail Sessions tab. */
  rounds_for_filter_firearm: number | null
}

export interface RangeSessionListFilters {
  firearm_id?: number
  after?: string          // YYYY-MM-DD
  before?: string         // YYYY-MM-DD
  limit?: number
}
