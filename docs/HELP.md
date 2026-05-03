# AmmoLedger Help

## Getting Started

### How do I add my first ammo box?

Go to **Inventory** and click **Add Box** in the top-right corner. Fill in at minimum a Caliber, Manufacturer, and Qty Original — all other fields are optional. Click **Add Box** to save. The box appears immediately in your inventory with its remaining count equal to the original quantity.

### How do I import from another app?

Go to **Import** in the sidebar and upload a CSV file. AmmoLedger validates the file and shows a preview of what will be imported, including any unrecognized lookup values that will be created automatically. Review the results and click **Confirm Import** to add all rows to your inventory.

### What is the Getting Started checklist?

The Getting Started checklist appears on the Dashboard when you first set up AmmoLedger. It tracks key setup steps — adding a box, inviting a user, configuring thresholds, and so on. Dismiss individual items as you complete them; the checklist disappears once all steps are done.

## Inventory

### What does each column mean?

The inventory table shows Caliber and Manufacturer (with product name as a subtitle), bullet weight (Gr/Oz), Type, Category, Remaining rounds, the value of remaining rounds at cost per round, and whether the box is Shared. Click a row to expand it and see full details including purchase date, container, notes, and expenditure history.

### How do I expend rounds at the range?

Click the **Remaining** value in any row to open the Quick Expend popover. Enter the number of rounds used, select the date (defaults to today), add optional notes, and click **Log**. The remaining count updates immediately and the expenditure is recorded in the box's history.

### What does "Shared" vs "Private" mean?

Shared boxes are visible to all users — admin, member, and read-only. Private boxes are only visible to the owner and admins. Use Shared for household ammo that everyone should see; use Private for personally-owned stock.

### How do Group By and filters work?

The **Group By** dropdown in the toolbar organizes rows into collapsible groups by caliber, manufacturer, location, container, or other fields. The per-column filter row below the table header lets you narrow results further — type text to match, or use operators like `<50`, `>100`, or `10-50` for numeric columns. Toolbar stats update to reflect filtered rows only.

### How do I bulk edit multiple boxes?

Check the boxes you want to edit using the checkbox column on the left. An amber toolbar appears showing how many are selected. Click **Edit Selected** to open the Bulk Edit panel where you can update fields like manufacturer, type, category, container, cost, or notes across all selected boxes at once.

### What are empty vs archived boxes?

Empty boxes have zero rounds remaining and are hidden by default — check **Show Empty** in the toolbar to reveal them. Archived boxes have been removed from active tracking via the row action menu and are hidden unless you check **Archived**. Archive a box when you've finished its ammo and no longer need it in your active inventory.

## Stock Thresholds

### How do thresholds work?

Thresholds trigger a "Running Low" alert on the Dashboard. AmmoLedger compares the total rounds across all boxes for each caliber (and all rounds in each storage location) against your configured threshold. When a total falls below its threshold it appears in the Running Low section on the Dashboard.

### What is the default threshold?

The global default threshold applies to every caliber and location that doesn't have its own specific threshold. Go to **Settings → Thresholds** to change it. The default is 200 rounds.

### How do I set a caliber threshold?

Go to **Settings → Thresholds** and scroll to **Per-Caliber Thresholds**. Select a caliber from the dropdown, enter the round count that should trigger an alert, and click **Add**. This overrides the global default for that caliber only.

### How do I monitor a location?

Go to **Settings → Thresholds** and scroll to **Per-Location Thresholds**. Select a storage location, enter the total round count that should trigger a low-stock alert across all calibers in that location, and click **Add**. Useful for tracking overall readiness at a specific safe or storage area.

## Products

### What are products?

Products are reusable templates for ammo boxes. Each product stores a caliber, manufacturer, product name, bullet weight, type, category, condition, default cost, and an optional photo. When you add a new box, you can select a product to auto-fill those fields instantly instead of typing them each time.

### How do I create a product?

Go to **Products** in the sidebar and click **Add Product**. Fill in at minimum a caliber — all other fields are optional. You can also upload a product image (jpg, png, or webp, up to 5 MB) by clicking the image area or dragging a file onto it.

### How do I add a box from a product?

On the Products page, find the product card and click **Add Box**. This opens the Add Box form in Inventory with all matching fields pre-filled from the product. Adjust any values as needed and save.

### Can I auto-fill a product when adding a box manually?

Yes. In the Add Box form, a product selector appears at the top. Type part of the caliber, manufacturer, or product name to search your product catalog. Select a match and all compatible fields fill automatically. You can also click **Enter details manually** to skip the selector and fill the form yourself.

### What is "Save as Template"?

When you add a box manually without selecting a product, AmmoLedger offers to save those details as a new product after you click Add Box. Click **Save as Template** in the dialog to create a product from the box you just added, or **Skip** to continue without creating one.

### What is Auto-Generate?

Auto-Generate (admin only, via the **Auto-Generate** button on the Products page) scans your existing inventory and creates a product for each unique combination of caliber, manufacturer, product name, bullet weight, and type. It also links any matching boxes to the new products automatically. Use it to bootstrap your product catalog from existing inventory.

### Can products be shared or private?

Yes — the same shared/private ownership model applies to products. Shared products are visible to all users; private products are only visible to the owner and admins. The Shared toggle appears in the Add/Edit Product form.

## Import

### What CSV format does AmmoLedger use?

AmmoLedger expects a CSV with columns matching its field names (caliber, manufacturer, product_name, qty_original, qty_remaining, etc.). Click **Download Template** on the Import page to get a properly formatted blank template with all supported columns.

### How do I download the import template?

Go to **Import** in the sidebar and click **Download Template**. This gives you a CSV file with all supported column headers and an example row. Delete the example row, fill in your data, and upload the file to validate it.

### What is Legacy ID mode?

If your CSV has a `legacy_id` column containing numeric values from a previous tracking system, AmmoLedger can use those numbers as the actual box IDs. This keeps labels and references from your old system valid. The option only appears when all legacy IDs are positive integers with no conflicts against existing boxes.

### What happens to unrecognized values?

If your CSV contains calibers, manufacturers, or other lookup values that don't exist in AmmoLedger, they are created automatically during import. The validation step shows you exactly which new values will be added so you can review them before confirming.

### How do I export my inventory to CSV?

In the Inventory toolbar, click **Export CSV**. A confirmation dialog shows how many boxes will be included, then downloads a CSV file with all visible boxes (filtered by your current search and toggles). To export everything including archived boxes, check **Archived** first. Admins can also export all boxes including archived ones via **Admin → Backup → Export All to CSV**.

### Can I reimport a CSV export?

Yes. The CSV export includes `owner`, `created_at`, and `updated_at` columns which the importer understands. On import, the `owner` column sets each box's owner by username (falls back to your user if the username doesn't exist). Timestamps are preserved as-is if they are valid ISO datetimes. This makes CSV a round-trip format — you can export, edit rows in a spreadsheet, and import back.

### What happens to the owner field on import?

If the CSV `owner` column contains a username that exists in AmmoLedger, the imported box is assigned to that user. If the username is blank or not found, the box is assigned to the user performing the import and a warning is added to the import result.

## Backup & Restore

### How do I back up my data?

Go to **Admin → Backup** and click **Backup Now**. This creates an immediate JSON export of all your data. You can also download the most recent backup from the same page.

### How do I restore from a backup?

Go to **Admin → Backup** and click **Import Backup**. Upload a JSON backup file previously created by AmmoLedger. A confirmation dialog will warn you that this replaces all current data before proceeding.

### How does scheduled backup work?

AmmoLedger automatically backs up your data every night at the time set in `config.yaml` (default: 03:00 server time). Go to **Admin → Backup** to see when the last backup ran and to change the schedule or retention period. Backups older than the configured retention days are pruned automatically.

### What is JSON export vs SQLite backup?

JSON export captures your inventory and expenditure data in a portable format that can be re-imported into AmmoLedger. SQLite backup is the raw database file — useful for developer recovery but not used by the restore UI. Use JSON export for routine backups.

## Admin Tasks

### What are scheduled tasks?

AmmoLedger runs several background jobs automatically on a configurable schedule. Go to **Admin → Tasks** to see all registered tasks, their next scheduled run, last run status, and full execution history. Tasks include version checks, scheduled backups, backup cleanup, and database maintenance.

### How do I manually run a task?

Go to **Admin → Tasks** and click **Run Now** on any task row. The task runs immediately in the background — the status badge updates to show it is running, then flips to OK or Failed when it finishes. History is updated automatically without needing to refresh.

### How do I change the backup schedule?

Go to **Admin → Tasks**, find the **Scheduled Backup** row, and edit the interval field. Enter a number of hours (e.g. `24`) or a daily time in `HH:MM` format (e.g. `03:00`). Click **Save** to apply. The next scheduled run updates immediately.

### What if a task fails?

The task row shows a red **Failed** badge and the last error message. Click anywhere on the history row in the Recent History table to expand the full error detail. You can click **Run Now** to retry the task immediately. If a task fails repeatedly, check the Admin → Tasks history for the error and review your `config.yaml` settings (especially backup paths and retention values).

## User Management

### How do I invite a family member?

Go to **Admin → Invitations** and click **New Invite**. Choose a role (Member or Read Only for most household users), optionally enter their email as a hint, and copy the generated link. Send it to them — the link expires after 72 hours by default. They click the link and create their own account with a password of their choosing.

### What are the three roles?

**Admin** can manage users, invitations, backups, and lookups in addition to full inventory access. **Member** can add, edit, and expend ammo. **Read Only** can view the inventory and dashboard but cannot make any changes.

### How do I reset someone's password?

Go to **Admin → Users** and click the link icon next to the user. Copy the generated reset link and send it to the user — it expires in 24 hours and can only be used once. Alternatively, click the key icon to set a new password directly; the user will be prompted to change it on next login.

### How do I recover my admin password?

If you're locked out of your admin account, edit `config.yaml` inside the container, set `security.reset_token` to a random string, restart the backend, and visit `/reset?token=your-value`. Enter your admin email and set a new password. Remove the token from `config.yaml` immediately after use. See the Installation Guide for step-by-step instructions.

## Community Lookup Data

### What is community lookup data?

AmmoLedger maintains a shared dataset of dealers, manufacturers, calibers, and ammo types that is synced automatically from the project's GitHub repository. This means your lookup tables stay current with new dealers and manufacturers without any manual data entry.

### How does the sync work?

On every startup, AmmoLedger fetches the latest community YAML files from GitHub. New entries are added as **pending** — they do not appear in form dropdowns until an admin reviews and imports them. If GitHub is unreachable, the app falls back to the YAML files bundled inside the Docker image.

### Where do I review pending community entries?

Go to **Admin → Lookups**. Any lookup section that has pending community entries shows a yellow banner with the count of new items. Click **Review & Import** to open a checklist of pending entries — check the ones you want to import and uncheck any you want to hide. Click **Import Selected** to apply your choices.

### How do I trigger a manual sync?

On the **Admin → Lookups** page, click **Check for Updates** in the top-right toolbar. This immediately pulls the latest community YAML files from GitHub and shows how many new entries are available across all four tables. The pending count badge updates in real time.

### What do the colored badges on lookup entries mean?

- **Blue** — community-maintained entry synced from GitHub
- **Gold** — entry you created manually in AmmoLedger
- **Gray** — entry seeded from the built-in `defaults.yaml` file

### How do I contribute a new dealer or manufacturer to the community list?

On the **Admin → Lookups** page, expand the Dealers or Manufacturers section and click **Contribute**. This generates a YAML snippet of all your user-created entries and provides a link to open a pull request on GitHub. Copy the YAML into the pull request and the maintainers will review it. See [CONTRIBUTING.md](https://github.com/crzykidd/AmmoLedger/blob/main/CONTRIBUTING.md) for the full contribution guide.

## About

### How do I check for updates?

AmmoLedger automatically checks for updates on startup and every 24 hours if `check_for_updates: true` is set in `config.yaml`. An "Update available" badge appears in the sidebar when a newer version is detected. Go to **About** to see the current version and release notes from GitHub.

### Where do I report bugs?

Open an issue at `https://github.com/crzykidd/AmmoLedger/issues`. Include your AmmoLedger version (visible in the sidebar or About page), what you expected to happen, and what actually happened. Screenshots are helpful for visual issues.
