<!-- This document is part of the AmmoLedger PRD. See ../PRD.md for the master document. -->

# Tagging — Physical Tokens, Labels, NFC, and Scan Modes

**Status:** Design committed at the architectural level. Implementation work not yet scheduled to a release. Forward-looking subsections (mobile companion app, networked scanners) are explicitly marked.

**Scope:** This document specifies how AmmoLedger associates physical real-world objects (ammo boxes, containers, locations, firearms, future accessories) with digital records, using printed QR codes, NFC tags, and an associated scan-driven workflow system.

**Cross-references:**
- Ownership model and RBAC: see `../PRD.md` §3 and §5.
- Existing label printing concept this supersedes: previously `../PRD.md` §10.7 Bulk Label Printing.
- Hardware build information for USB readers, ESP32 devices, ESPHome configs: see `../hardware/`.

---

## 1. Overview

### 1.1 The problem

AmmoLedger tracks ammunition at the box level — each physical box of ammo is a row in the database with a Box ID, a remaining quantity, and a history of expenditures. In practice, the user needs to repeatedly find the right database row when standing in front of a physical box (in the safe, at the range, at the reloading bench). Today this requires either typing the Box ID, searching by attributes, or visual inspection of hand-written labels.

This document specifies a system for **physical tokens** — opaque identifiers bound to inventory entities, encoded as scannable QR codes and/or NFC tags — and a **scan mode** system that determines what AmmoLedger does when a scan resolves.

### 1.2 The design at a glance

Five conceptual layers, each independently useful:

1. **Tokens** — opaque slugs in a `physical_tokens` table, each bound to one inventory entity. The `/t/{token}` URL is the universal scan target.
2. **Label templates** — user-designed label layouts supporting Avery sheets, Brother P-touch tape, and DYMO LabelWriter formats. Multiple named templates per user, picked at print time.
3. **Tag programming** — writing token URLs to NFC tags. Primary path is a desktop USB NFC reader driven via WebUSB/WebHID from a Chromium browser. Mobile companion app is documented but deferred.
4. **Scan modes** — per-user state that determines behavior after a scan resolves. Range Day mode attaches scans to a session; Intake mode moves scanned boxes to a target location; Default mode shows the standard entity detail page. Modes apply broadly to all expenditure and movement actions, not only scan-originated ones.
5. **Networked scanners** — future-state architecture for ESP32-based scanner devices that post scan events to an API endpoint. AmmoLedger publishes the API spec and example ESPHome configurations; no hardware is sold or supported beyond reference documentation.

### 1.3 Why decouple token from entity primary key

A token is not the entity's database ID. The decoupling matters for several concrete reasons:

- **Containers and locations hold changing contents.** Tagging an ammo can with a URL that hard-codes box #1147 welds the can to one specific box. With a token that resolves to "this container," the can's detail page shows whatever boxes are currently inside.
- **A single physical item can carry multiple encodings.** A printed QR label and a separate NFC inlay on the same ammo can should resolve identically. The token system supports this naturally.
- **Tokens can be retired without altering the underlying entity.** A damaged or compromised tag is revoked at the token level. The entity continues to exist with the same database ID.
- **The same resolver endpoint serves all entity types.** The `/t/{token}` URL doesn't need to encode the target type. Boxes, containers, locations, and firearms are all reached through one endpoint.

---

## 2. Data model

### 2.1 `physical_tokens` table

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `token` | TEXT | Opaque slug, format `tok_` + 8 chars from a URL-safe alphabet excluding visually ambiguous characters (`0`, `O`, `l`, `1`, `I`). ~47 bits of entropy. **UNIQUE.** |
| `kind` | TEXT | Informational: `qr`, `nfc`, or `both`. Describes how the user encoded this token. The resolver does not branch on this field. |
| `nfc_uid` | TEXT | Hardware UID of the bound NFC tag, nullable. **UNIQUE WHERE NOT NULL.** Enables UID-based lookup for the optional Web NFC fast-scan path on Chrome/Android. |
| `target_type` | TEXT | One of: `ammo_box`, `container`, `location`, `firearm`, `accessory` (the last reserved for v3.0 Accessories work). |
| `target_id` | INTEGER | Soft FK to the target row in the table determined by `target_type`. No DB-level constraint because the target table varies; application-layer enforcement. |
| `owner_id` | INTEGER | FK to `users.id`. Inherited from the target entity at mint time. Used for RBAC. |
| `label` | TEXT | Optional human note ("Top of can, red sticker"). Nullable. |
| `is_active` | BOOLEAN | Soft-delete flag. Preserves history for retired tokens. |
| `created_at` | DATETIME | |
| `created_by` | INTEGER | FK to `users.id`. Who minted the token. |
| `deactivated_at` | DATETIME | Nullable. |
| `deactivated_by` | INTEGER | FK to `users.id`. Nullable. |

**Indexes:**
- `UNIQUE (token)`
- `UNIQUE (nfc_uid) WHERE nfc_uid IS NOT NULL`
- `INDEX (target_type, target_id)`
- `INDEX (owner_id)`

**Cardinality:** Multiple active tokens may target the same entity. This supports a single physical item carrying both a printed QR label and an NFC inlay, backup or supplementary labels, and replacement of damaged labels without first retiring the surviving one.

**Soft FK rationale:** `target_id` references rows across multiple parent tables (`ammo_box`, `container`, `location`, `firearm`, future `accessory`). A hard foreign key isn't feasible across multiple parent tables. Referential integrity is enforced in the router layer: lookups dispatch through `target_type` to the right table, and orphaned tokens (target deleted) are treated as retired by the resolver.

**Token format:** `tok_` prefix plus 8 characters from the URL-safe alphabet. The prefix makes tokens visually distinguishable from box IDs in logs and URLs. 47 bits of entropy is well above what's needed for any reasonable per-install token population (a billion tokens would have a one-in-a-million collision probability with this entropy).

### 2.2 `label_templates` table

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `name` | TEXT | User-supplied name. Unique per owner. |
| `owner_id` | INTEGER | FK to `users.id`. |
| `is_shared` | BOOLEAN | If true, all admins can use this template; otherwise only the owner. |
| `target_type` | TEXT | Which entity type this template formats: `ammo_box`, `container`, `location`, `firearm`. Templates are entity-type-specific because the available fields differ. |
| `label_format` | TEXT | The physical format identifier: see §3.2 for the supported set (Avery sheet sizes, Brother P-touch tape widths, DYMO LabelWriter sizes). |
| `fields_json` | JSON | Ordered list of field descriptors. Each descriptor: `{field_name, size: "large" \| "normal"}`. |
| `qr_enabled` | BOOLEAN | Whether to render a QR code encoding the token URL. |
| `nfc_icon_enabled` | BOOLEAN | Whether to render the NFC Forum N-mark icon. |
| `nfc_mode` | TEXT | When `nfc_icon_enabled` is true: `tag_bound` (the icon promises a bound tag exists), `separate_sticker` (the icon reminds the user to stick a separate NFC inlay near the printed label), or `integrated_label` (the printed label stock has an embedded NFC inlay). |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

**Indexes:**
- `UNIQUE (owner_id, name)`
- `INDEX (target_type)`

### 2.3 `user_scan_modes` (server-side mode state)

| Column | Type | Notes |
|---|---|---|
| `user_id` | INTEGER | Primary key. One row per user. |
| `current_mode` | TEXT | One of: `default`, `range_day`, `intake`, `cleanup`, `audit`. Future modes may be added. |
| `mode_context_json` | JSON | Mode-specific parameters. For `range_day`: `{range_session_id, default_firearm_id}`. For `intake`: `{target_location_id}`. For `cleanup`: `{target_location_id}` (or `null` for "return to prior location"). Empty object for `default`. |
| `activated_at` | DATETIME | When the current mode was entered. |
| `auto_expires_at` | DATETIME | Nullable. Currently unused; reserved for future "expire at end of day" behavior. Range Day mode does not use this — it auto-exits when its linked range session is closed. |

**Mode is server-side state** (not browser localStorage) so that networked devices (future §6) can read the same mode the browser uses. Browser may cache mode locally for snappy UI but the server is the source of truth.

### 2.4 `scan_events` (audit and history)

A new audit table records every successful token resolution. Used for history, troubleshooting, and the future networked-scanner audit trail.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `token_id` | INTEGER | FK to `physical_tokens.id`. Null if the scan was unresolvable (unknown token). |
| `raw_token` | TEXT | The token string as received from the scan. Always populated, even for unresolvable scans. |
| `nfc_uid_seen` | TEXT | The NFC UID if the scan came via the UID-based fast-scan path. Nullable. |
| `user_id` | INTEGER | FK to `users.id`. Who performed the scan. |
| `device_id` | INTEGER | FK to a future `devices` table for networked-scanner attribution. Nullable. Browser scans leave this null. |
| `mode_at_scan` | TEXT | Snapshot of the user's `current_mode` at scan time. |
| `mode_context_at_scan_json` | JSON | Snapshot of `mode_context_json` at scan time. |
| `action_taken` | TEXT | What the resolver did: `redirected`, `auto_moved`, `auto_expended`, `unauthorized`, `unknown_token`, `target_archived`, etc. |
| `created_at` | DATETIME | |

**Retention:** Indefinite. This is an audit log; entries are never deleted, only summarized in old data if size becomes a concern.

### 2.5 Ownership and RBAC

Tokens inherit `owner_id` from their target at mint time. The token's effective visibility is **whatever the target's visibility is**, computed at scan resolution time (not cached). This matters because if a box's `is_shared` flag flips, every existing token on that box immediately reflects the new visibility on next scan.

**Permission summary (full grid in `../PRD.md` §5.2):**

| Action | Admin | Member | Read-Only |
|---|---|---|---|
| Mint token on own private entity | ✓ | ✓ | ✗ |
| Mint token on shared entity | ✓ | ✓ | ✗ |
| Mint token on another user's private entity | ✗ | ✗ | ✗ |
| Bind NFC tag (write token to physical tag) | Same as mint | Same as mint | ✗ |
| Retire / re-bind a token | Own or shared targets only (admin: any) | Own or shared targets only | ✗ |
| Scan a token | Always allowed; result respects target visibility | Same | Same — Read-Only users see entity details but cannot trigger write actions from the scan landing page |
| Manage own scan mode | ✓ | ✓ | ✓ (limited to read-only modes) |
| Design label templates | ✓ | ✓ | ✗ |

---

## 3. Label templates and printing

### 3.1 Goals

The label printing system replaces the simpler concept previously sketched in `../PRD.md` §10.7. Goals:

- Support a meaningful range of real-world label hardware, not just Avery sheets.
- Let users design and save multiple templates, picked at print time.
- Render a live preview at the actual physical size during design.
- Optionally include a scannable QR code encoding the token URL.
- Optionally include an NFC indicator icon with documented semantics.
- Generate output appropriate to the format: PDF for Avery sheets, streamed instructions for Brother P-touch and DYMO LabelWriter.

### 3.2 Supported label formats

**Avery sheet labels (printed on standard letter or A4 sheets via inkjet/laser printer):**
- Avery 5160 — 1" x 2-5/8", 30/sheet
- Avery 5163 — 2" x 4", 10/sheet
- Avery 5164 — 3-1/3" x 4", 6/sheet
- Avery 5167 — 1/2" x 1-3/4", 80/sheet

**Brother P-touch tape (continuous-feed thermal printer, requires Brother PT-* series):**
- 12mm tape
- 18mm tape
- 24mm tape

**DYMO LabelWriter (continuous-feed thermal printer, requires DYMO LabelWriter 450/550/etc.):**
- 30334 — Multi-purpose 2-1/4" x 1-1/4"
- 30336 — Multi-purpose 1" x 2-1/8"
- 30252 — Address label 1-1/8" x 3-1/2"
- 30330 — Return address 3/4" x 2"

**Custom format (advanced):** user-specified dimensions in millimeters, used to generate PDF output. No thermal printer support for custom dimensions in v1.

Each `label_format` identifier in the `label_templates.label_format` column corresponds to one of the above. The application maintains a registry mapping format to physical dimensions and field-area constraints.

### 3.3 Template designer

The designer is a single-page UI that lets a user create or edit a template. Components:

- **Format picker** — dropdown listing all supported formats grouped by family (Avery / Brother / DYMO / Custom). Selecting a format determines the canvas dimensions for the rest of the designer.
- **Target type picker** — `ammo_box`, `container`, `location`, `firearm`. Determines which fields are available in the field selector.
- **Field selector** — checkbox list of available fields for the selected target type. Selected fields appear in the layout area below.
- **Field ordering and sizing** — drag-and-drop reordering. Each selected field has a "size" toggle (Large / Normal).
- **QR toggle** — when enabled, a QR code occupies a configurable corner of the label. Size is auto-calculated for scannability based on the format's dimensions and the available fields.
- **NFC icon toggle** — when enabled, the NFC Forum N-mark icon appears in a configurable corner. The user selects the `nfc_mode` from a dropdown with three options (see §3.4).
- **Live preview** — renders the template at actual physical size, with sample data from a real entity if available. Updates as fields are toggled or reordered.
- **Save dialog** — name the template, optionally mark it shared. Saved templates appear in the user's template list and can be picked at print time.

**Field size and overflow:** if selected fields plus QR plus NFC icon do not fit the format's dimensions, the preview shows a warning ("Content exceeds label area — consider removing fields or choosing a larger format"). The save action is not blocked but the print preview is annotated.

### 3.4 NFC icon semantics (`nfc_mode`)

When `nfc_icon_enabled` is true on a template, the user picks one of three semantic interpretations. The icon is the same in all three cases (NFC Forum N-mark); the meaning is recorded in the template and drives the post-print workflow.

- **`tag_bound`** — The icon indicates that this label is associated with a bound NFC tag. When this template is used to print labels, the print flow automatically advances into the Bind Tags workflow (§4) after printing. The implication for the reader of the printed label: tap the icon's general area, you'll get a response.

- **`separate_sticker`** — The icon reminds the user to physically stick a separate NFC inlay near the printed label after applying it. The print flow does *not* automatically advance to binding — the user binds the separate stickers later, on their own time. The implication for the reader: an NFC tag should be nearby; tap-test as needed.

- **`integrated_label`** — The label stock itself has an embedded NFC inlay (e.g., Avery's NFC-integrated label products). The print flow advances into Bind Tags by tapping the *printed labels* themselves on the desktop USB reader. The implication for the reader: tap the label.

These are user-facing distinctions, not internal implementation differences. The token data model is identical across all three; only the workflow choreography differs.

### 3.5 Print flow

1. User selects N entities from an inventory list (boxes, containers, etc.).
2. User clicks **Print Labels**.
3. Picker shows their available templates for the matching target type. User selects one.
4. Preview renders the first label and shows "N labels will be printed" with format-appropriate options:
   - For Avery: page count, starting position on sheet (so partially-used sheets aren't wasted).
   - For Brother/DYMO: which connected printer to use (if multiple).
   - Custom PDF: page size confirmation.
5. User confirms. System:
   - Mints N tokens (one per entity that doesn't already have an active token for this template's purpose).
   - Generates output: PDF for Avery and custom; streamed print instructions for Brother and DYMO.
6. Output is delivered to the user (PDF download / direct print).
7. If template's `nfc_mode` is `tag_bound` or `integrated_label`, the UI advances to the Bind Tags workflow (§4). If `separate_sticker` or no NFC icon, the flow ends here with a success summary.

**Idempotency:** if an entity already has an active token of matching kind (e.g., a token marked `qr` already exists), the print flow reuses it rather than minting a new one. This means printing replacement labels for a damaged sticker does not invalidate the original — the URL stays the same.

### 3.6 Printer connectivity and direct-print protocol

AmmoLedger supports two delivery models for printed labels, complementary rather than alternatives:

- **PDF download** — the user downloads a PDF and prints it through their normal OS print flow. Always supported, regardless of label format. Required for Avery sheet labels (which are printed on a generic inkjet/laser). Optional for label-printer formats (Brother / DYMO / network thermal).

- **Direct print** — AmmoLedger connects to a network-attached label printer and sends print jobs directly. The user clicks Print Labels in the web UI; the labels emerge from the configured printer with no intermediate PDF, no OS print dialog, no user intervention.

For direct print, **v1 commits to Raw 9100 (JetDirect / RAW socket) with ESC/POS as the supported protocol**. Rationale:

- Universally supported by network-attached thermal label printers across vendors (Rollo, Munbyn, Phomemo, Zebra, Brother network variants, DYMO LabelWriter network variants, generic Chinese thermal printers).
- Trivially driven from Python via standard libraries (`socket` directly or `python-printer-escpos`); requires no vendor-specific drivers or SDKs.
- Doesn't depend on host-OS-installed print drivers, which matters because AmmoLedger runs in Docker.
- Stable, frozen protocol — works on any thermal printer made in the last 15+ years and any reasonable future printer.

**Note on wire formats over Raw 9100:** the protocol commitment is to the transport (Raw 9100 TCP socket), not to a single payload format. Some printer families carry vendor-specific raster languages over the same socket — notably the Brother QL series (QL-810W, QL-820NWB, QL-1100, etc.), which uses Brother's raster protocol rather than generic ESC/POS. Implementation is expected to dispatch by configured printer type and reuse mature open-source libraries per family (e.g., `brother_ql` for the Brother QL series, `python-printer-escpos` for generic ESC/POS thermal printers) rather than hand-rolling per-vendor protocol code.

**Out of scope for v1:**

- **IPP (Internet Printing Protocol)** — a richer, modern alternative with discovery, status, and metadata support. Documented as a future enhancement once direct-print is shipped and proven.
- **CUPS** as a print server target — incompatible with the self-hosted Docker-only model.
- **Vendor SDKs** (Brother b-PAC, DYMO Label Framework, etc.) — maintenance burden per vendor; Raw 9100 covers the same hardware without vendor lock-in.
- **Web-driver libraries** (Brother and DYMO JavaScript SDKs over WebUSB) — only useful for browser-driven printing on USB-attached printers; Raw 9100 covers the network case which is the more common deployment.

**Printer configuration** is per-installation. Users add printers in settings by IP address and port (default 9100), optionally naming each printer and setting a default media size. Label templates may target a specific printer or be printer-agnostic (user picks at print time). Full schema and UI deferred to the printing implementation work.

**Failure modes** for direct print (printer offline, network unreachable, out of media) must be surfaced to the user with actionable error messages and a fallback to PDF download. Detail deferred.

This subsection is a **protocol commitment only** — it locks in the v1 direct-print path so implementation work doesn't relitigate the decision. The full label-printing rework (PDF-vs-direct delivery model, `printers` table data model, per-template printer binding, print history and audit) is deferred to a separate effort scheduled when printing implementation is ready.

---

## 4. Tag programming (NFC binding)

### 4.1 Primary path — desktop USB NFC reader

The primary supported path for writing token URLs to NFC tags is a USB-connected NFC reader on the user's desktop, driven directly from the AmmoLedger web app via WebUSB or WebHID.

**Supported hardware:** see `../hardware/usb-nfc-reader.md` for the current reference list. The reference reader is the ACR122U (PC/SC-compliant, OS-agnostic, widely available). Any PC/SC-compliant NFC reader supporting NTAG21x tags should work via the same code path.

**Supported tags:** NTAG213 (144 bytes) is the minimum. NTAG215 (504 bytes) and NTAG216 (888 bytes) are also supported. The token URL fits comfortably in 144 bytes; higher-capacity tags offer no functional advantage for this use.

**Browser compatibility:** WebUSB and WebHID are supported in Chromium-based browsers (Chrome, Edge, Brave, Opera). They are **not** supported in Firefox or Safari. This is a real constraint and is documented in the UI.

**Fallback for non-Chromium browsers:** AmmoLedger may publish a small local helper service (a Python or Node executable) that the user runs on their machine. The helper exposes the reader over HTTP locally; the web app calls the helper instead of going direct to WebUSB. This is documented as a fallback path but not a primary supported configuration in v1.

### 4.2 Bulk Bind workflow

The marquee workflow. Triggered automatically after a print job whose template specifies `nfc_mode = tag_bound` or `integrated_label`. Also accessible standalone from a "Bind NFC tag" action on any entity detail page.

Choreography:

1. User has just printed N labels (or is starting standalone for one entity).
2. UI shows a queue: a list of the N entities in print order, each with status (pending, bound, skipped, failed).
3. The reader is selected from a dropdown of detected WebUSB devices. If only one is connected, it's auto-selected.
4. The first pending entity is highlighted. A persistent "Place tag on reader" prompt is shown.
5. User places a blank NTAG sticker on the reader. The app:
   - Detects the tag, reads its UID.
   - Writes an NDEF URL record containing `{base_url}/t/{token}` for the current entity.
   - Verifies the write by reading back.
   - Records the `nfc_uid` on the token row.
   - Marks the entity bound (✓) and advances to the next.
6. Repeat for each entity. User can pause, skip, retry, or re-bind.
7. On completion, a summary screen lists bound / skipped / failed entities and offers a print receipt.

**Re-binding:** if the user accidentally places a tag that's already bound to a different entity, the workflow detects this and prompts: "This tag is currently bound to [box 1147]. Re-bind to [box 1148]?" Confirmation required. The original token's `nfc_uid` is cleared on confirmation; the new token's `nfc_uid` is set.

**Mistake recovery:** the workflow supports going back to a previously-bound entity and re-binding to a different physical tag (e.g., the first sticker was placed crooked and the user wants to redo it with a fresh sticker).

### 4.3 Mobile companion app (deferred)

A native mobile app on iOS and Android could allow tap-to-write binding in the field, using each platform's NFC writing APIs (Core NFC on iOS, NfcAdapter on Android). This would benefit users without a USB reader, or users binding tags to fixed locations (e.g., a tag stuck to the safe shelf, easier to bind in situ than at a desk).

**Decision:** deferred indefinitely. Reasons:
- The desktop USB path covers the high-volume bulk-binding use case efficiently.
- The future networked-scanner ESP32 path (§6) covers the "bind in situ" use case for users willing to build a device.
- A native app introduces app store deployment, code signing, OS version compatibility, and ongoing maintenance burden disproportionate to the value for a small self-hosted-app user base.

If user demand later warrants, the mobile app is a clean addition — it consumes the same token API as the rest of the system and requires no changes to the data model or resolver. This deferral does not foreclose the option.

### 4.4 Web NFC (Chrome on Android) — optional fast scan

Chromium on Android supports the Web NFC API, which lets a web page read NFC tags from within an open browser session (no native app required). AmmoLedger may optionally expose a "Scan Mode" toggle on mode-active pages (e.g., the At Range page in Range Day mode) that opens a persistent NDEFReader session and processes taps without redirecting through the `/t/{token}` URL flow.

This is a *convenience* enhancement for one specific user group (Android Chrome users actively using the app). It is not the primary scan path — the universal scan path is the URL redirect, which works on iOS Safari, Android Chrome, and every other modern mobile browser. Web NFC is an opt-in fast path layered on top.

---

## 5. The `/t/{token}` resolver and scan landing

### 5.1 The resolver

Single endpoint: `GET /t/{token}`.

Behavior:

1. Look up the token in `physical_tokens` by `token` slug.
2. If not found — render a friendly "unknown tag" page. The page is intentionally not authenticated — anyone scanning an unknown tag sees a generic helpful message rather than being prompted to log in. Log a `scan_events` row with `action_taken = unknown_token`.
3. If found but `is_active = false` — render a "retired tag" page. Log `action_taken = target_archived` or `retired` as appropriate.
4. If found and active — dispatch by `target_type` to the appropriate downstream page (§5.2 below). Apply RBAC based on the requesting user's relationship to the target. Log a `scan_events` row with the resolved action.

**Unauthenticated scans:** if the user is not logged in, redirect to login with `?next=/t/{token}` so they return to the resolver after authentication. This preserves the scan intent across the auth flow.

**RBAC denial:** if the user is logged in but lacks visibility on the target (private entity owned by someone else), render a "not visible to you" page rather than a 404. This avoids leaking whether a token exists.

### 5.2 Mode-aware landing

The resolver's output depends on the user's current scan mode (§6 below) and the target type.

**Default mode, target = `ammo_box`:** standard mobile-optimized box detail page with quick-expend buttons (Shot All / Shot 50 / Shot 25 / Shot 10 / Shot 5), notes, history, edit, and a "Start range session against this box" CTA.

**Default mode, target = `container`:** container detail page listing the boxes inside with quick-expend buttons inline. "Start range session from this container" CTA.

**Default mode, target = `location`:** location detail page listing boxes and containers at this location.

**Default mode, target = `firearm`:** firearm detail page showing range history, current cleaning status, custom tags.

**Range Day mode, target = `ammo_box`:** simplified expend UI prefilled to log against the active range session and selected firearm. Big "Shot All" button. Quick amount buttons. "View box details for this scan only" link (per-scan override). "Exit Range Day mode" link (mode exit). Mode banner persists.

**Range Day mode, target = `container`:** container's box list, each row showing a one-tap expend button that logs against the session. "View container details for this scan only" link.

**Intake mode, target = `ammo_box` or `container`:** brief confirmation page — "Moving box #1147 to Range Bag" — with a 2-second auto-dismiss and explicit confirm button. Logs the move, advances to a ready-for-next-scan state.

**Cleanup mode:** mirror of Intake.

**Audit mode:** marks the scanned entity "seen," advances a counter ("17 of 50 scanned"), shows remaining unscanned items.

**Per-scan override:** every mode-active landing page has a small "View details" icon (or link) that re-renders the page as if the user were in Default mode, *for this scan only*. The mode does not change; the next scan returns to mode-active behavior. This is the "leave Range mode active but go see details about this box" capability.

**Mode exit:** every mode-active landing page has an "Exit [mode name] mode" link that returns the user to Default mode for all subsequent scans and actions.

---

## 6. Scan modes

### 6.1 What modes are

Scan modes are **per-user state** that determines what AmmoLedger does after a scan resolves, and that also influences non-scan actions (e.g., clicking the Crosshair quick-expend icon on the inventory list).

A mode has:
- A name (`range_day`, `intake`, `cleanup`, `audit`, `default`).
- A context (mode-specific parameters — e.g., which range session, which target location).
- An activation timestamp.
- An optional auto-expiry rule (typically tied to a related entity's lifecycle, e.g., Range Day exits when its range session is closed).

**Modes apply broadly.** If Range Day mode is active and the user logs an expenditure by any means (scan, At Range page, inventory crosshair icon, REST API), the expenditure is attributed to the mode's session and firearm. Modes are about *what activity is happening*, not about how individual actions are triggered.

### 6.2 Mode entry surfaces

A user can enter a mode from any of:

- **Dashboard quick actions** — "Start Range Day" tile (matches Phase 8.15 Quick Actions row).
- **Box detail page** — "Start range session against this box" CTA. Includes a "Start and log expenditure" option that opens the session and immediately presents the simplified expend UI for the initiating box.
- **Container detail page** — "Start range session from this container's contents."
- **Firearm detail page** — "Start range session with this firearm."
- **Scan landing page in Default mode** — same entry CTAs as the corresponding detail page above. Entering a mode from a scan landing page is a natural workflow ("I just scanned my first box of the day").
- **Top-level mode picker** — a header dropdown or settings page for explicit mode entry without an entity context.
- **Networked scanner triggering** — future-state; an ESP32 device in a special "session-starter" role can trigger mode entry on first scan (e.g., scan a box at the safe — automatically open a session and switch to Range Day mode on the user's web app).

### 6.3 Mode exit

A mode is exited by:

- The persistent banner's "End [mode] mode" link.
- Closing or saving the linked range session (auto-exit for `range_day`).
- An explicit reset action in settings.
- Server-side timeout (currently unused; reserved).

When a mode exits, `current_mode` reverts to `default` and `mode_context_json` is cleared (or archived if the audit log needs it).

### 6.4 Mode UI

A persistent banner is rendered at the top of every page when a non-default mode is active. The banner:
- Is color-coded by mode (Range Day = red, Intake = blue, Cleanup = green, Audit = amber, default = no banner).
- Shows mode name and salient context (session ID, firearm name, target location).
- Offers inline actions (change firearm, view session, end mode).
- Is unmissable — not a subtle pill, an actual horizontal strip.

### 6.5 Mode interaction with non-scan actions

A user in Range Day mode who logs an expenditure from the inventory list (clicking the Crosshair icon, bypassing the scan flow entirely) still has that expenditure attributed to the active session and firearm. The mode is *the* attribution context.

The per-scan override does **not** apply to non-scan actions — a user wanting to log an expenditure without session attribution either uses the At Range page's session-attribution dropdown (which can be set to "None"), or temporarily exits mode.

### 6.6 Multi-mode is not supported

A user has one active mode at a time. The Audit mode + Range Day mode combination is not coherent (auditing the contents of a container while also recording everything as an expenditure?) and is explicitly disallowed. Entering a new mode while one is active prompts the user to end the previous mode first.

---

## 7. Networked scanners (future state)

### 7.1 What this is

A future-state architecture for ESP32-based scanner devices that read NFC tags and post scan events to AmmoLedger over HTTP. This enables ambient automation scenarios:

- A reader at the safe door, in Intake mode, automatically moves boxes to "Range Bag" as they pass it.
- A reader at the reloading bench logs expenditures against a configured session.
- A bulk-programmer reader at the user's desk writes blank tags as an alternative to the WebUSB ACR122U path.

**Status:** future state, no commitment to a release. The data model and API surface in §2 and §5 are designed to support this from day one — adding networked scanners later does not require schema changes. This forward-compatibility is the reason for the §2.4 `scan_events.device_id` column and §2.3 `user_scan_modes` being server-side.

### 7.2 Support model

AmmoLedger publishes:
- The scan event API specification (this document).
- Example ESPHome YAML configurations in `../hardware/esphome-configs/`.
- Reference build notes for an ESP32 + NFC reader in `../hardware/esp32-scanner.md`.

AmmoLedger does **not** publish:
- Manufactured hardware.
- A recommended specific board / chip / case combination as a "product."
- Custom firmware (the ESPHome path is the supported model).

Users build their own devices using the published references and contribute new configurations back as PRs to the hardware folder.

### 7.3 Architectural options

Two viable architectures, documented here so that whichever is chosen at implementation time has a clear rationale:

**Option A — Pure ESPHome.** The device's action is baked into firmware via YAML config. AmmoLedger exposes one simple endpoint (`POST /api/scan`) that receives `{token, timestamp, device_token, optional context}` and dispatches based on a device-supplied `action` field. Changing what a device does means editing the YAML and re-flashing (OTA: ~30 seconds).

- Pros: smallest possible AmmoLedger subsystem; matches "API spec only" support model; ESPHome users have OTA, Home Assistant integration, and the full ecosystem already.
- Cons: no "my devices" page in AmmoLedger; revoking a device means revoking its API token at the API level, not toggling it off in a UI.

**Option B — Hybrid.** A `devices` table in AmmoLedger with `name`, `api_token`, `current_mode`. ESPHome firmware polls `/api/devices/me` periodically and dispatches scans based on the returned mode. User changes mode from the web app; device picks it up on next poll.

- Pros: web-UI mode switching matches the user-facing scan modes story; visible device registry with last-seen and revoke; cleaner audit trail attribution.
- Cons: real new subsystem in AmmoLedger (device auth, polling, mode UI, lifecycle); polling cadence is a tradeoff.

**Recommended v1 (when this work is scheduled):** Option A (pure ESPHome). Migration to Option B is clean — pure ESPHome devices keep working when the hybrid registry ships; they just don't take advantage of the new capability. Starting simple and growing into hybrid is lower risk than the reverse.

### 7.4 Scan event API

`POST /api/scan`

Request body:
```json
{
  "token": "tok_a8K2nQ",
  "nfc_uid": "04:A3:B2:91:E2:80:00",
  "timestamp": "2026-01-15T14:23:00Z",
  "device_token": "dev_xxxxxxxx",
  "action": "auto_expend",
  "context": {
    "rounds": 20
  }
}
```

- `token` — the slug embedded in the NFC tag's NDEF URL, parsed by the device firmware before sending. Optional if `nfc_uid` is provided.
- `nfc_uid` — the hardware UID of the scanned tag. Optional if `token` is provided. If both are sent, server prefers `token` and uses `nfc_uid` for verification.
- `device_token` — long-lived API token identifying the device. Required.
- `action` — what the device wants done. In pure-ESPHome mode this comes from the device. In hybrid mode this may be ignored in favor of the server-stored device mode.
- `context` — action-specific parameters.

Response:
```json
{
  "result": "ok",
  "target_type": "ammo_box",
  "target_id": 1147,
  "action_taken": "auto_expended",
  "details": {
    "rounds_logged": 20,
    "remaining": 30,
    "session_id": 4291
  }
}
```

On the device side, the firmware uses the response to drive feedback (LED color, beeper, display).

### 7.5 Device authentication

Each device has a long-lived API token (`device_token`) scoped to a single user (the device's owner). Tokens are minted via a one-time pairing flow:

- User clicks "Pair new device" in AmmoLedger settings.
- AmmoLedger generates a pairing code (6 digits, expires in 5 minutes).
- User enters the code into the device (via its serial console, captive WiFi portal, or static config). The device sends the code to `POST /api/devices/pair`, receives back a `device_token`, and stores it.
- The token is durable across reboots and firmware updates.
- The user can revoke a device's token from the settings page.

In pure-ESPHome mode, the `device_token` may also be baked directly into the YAML at flash time, bypassing the pairing flow. This is documented as the simpler initial path.

---

## 8. Open questions and deferred decisions

- **Pure ESPHome vs. hybrid networked scanners** — recommended pure for v1, hybrid added later if/when user demand warrants. Final decision deferred to implementation time.
- **Brother and DYMO SDK integration** — v1 of label printing uses native print drivers (PDF or system print queue). Direct SDK integration is a future enhancement.
- **Web NFC fast-scan on Chrome/Android** — optional convenience layer, not in v1 scope.
- **Mobile companion app** — deferred indefinitely; revisit only if user demand warrants.
- **The At Range page / Range Sessions / Scan Modes triple-overlap** — three features describe overlapping workflows. Rationalization deferred; modes coexist with existing features in v1 without refactoring them. See `../PRD.md` §10.8 (Deferred Items) for the broader merge discussion.

---

## 9. Glossary

- **Token** — an opaque slug (`tok_a8K2nQ`) in the `physical_tokens` table, bound to one inventory entity.
- **Tag** — a physical NFC sticker or label. Distinct from "tag" in the firearms feature (custom tag categories).
- **Label** — a printed sticker, optionally with a QR code and/or NFC indicator icon.
- **Bind** — to write a token URL to a physical NFC tag.
- **Mint** — to create a new token row.
- **Retire** — to soft-delete a token (set `is_active = false`).
- **Re-bind** — to point an existing physical NFC tag at a different entity (clears `nfc_uid` from the old token, sets it on a new token).
- **Mode** — per-user activity state that influences scan resolution and other actions.
- **Resolver** — the `/t/{token}` endpoint that turns a scan into a redirect.

---

## Revision history

- **2026-05-18** — Initial draft. Establishes the data model, label template system, NFC binding workflow, scan modes, and forward-compatible architecture for networked scanners.
