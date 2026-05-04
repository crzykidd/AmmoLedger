import { useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import TopBar from '@/components/layout/TopBar'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

interface HelpItem {
  id: string
  q: string
  a: string
}

interface HelpSection {
  id: string
  title: string
  items: HelpItem[]
}

const HELP_CONTENT: HelpSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    items: [
      {
        id: 'add-first-box',
        q: 'How do I add my first ammo box?',
        a: 'Go to Inventory and click Add Box in the top-right corner. Fill in at minimum a Caliber, Manufacturer, and Qty Original — all other fields are optional. Click Add Box to save. The box appears immediately in your inventory with its remaining count equal to the original quantity.',
      },
      {
        id: 'import',
        q: 'How do I import from another app?',
        a: 'Go to Import in the sidebar and upload a CSV file. AmmoLedger validates the file and shows a preview of what will be imported, including any unrecognized lookup values that will be created automatically. Review the results and click Confirm Import to add all rows to your inventory.',
      },
      {
        id: 'getting-started-checklist',
        q: 'What is the Getting Started checklist?',
        a: 'The Getting Started checklist appears on the Dashboard when you first set up AmmoLedger. It tracks key setup steps — adding a box, inviting a user, configuring thresholds, and so on. Dismiss individual items as you complete them; the checklist disappears once all steps are done.',
      },
    ],
  },
  {
    id: 'inventory',
    title: 'Inventory',
    items: [
      {
        id: 'columns',
        q: 'What does each column mean?',
        a: 'The inventory table shows Caliber and Manufacturer (with product name as a subtitle), bullet weight (Gr/Oz), Type, Category, Remaining rounds, the value of remaining rounds at cost per round, and whether the box is Shared. Click a row to expand it and see full details including purchase date, container, notes, and expenditure history.',
      },
      {
        id: 'expend',
        q: 'How do I expend rounds at the range?',
        a: 'Click the Remaining value in any row to open the Quick Expend popover. Enter the number of rounds used, select the date (defaults to today), add optional notes, and click Log. The remaining count updates immediately and the expenditure is recorded in the box\'s history.',
      },
      {
        id: 'shared-private',
        q: 'What does "Shared" vs "Private" mean?',
        a: 'Shared boxes are visible to all users — admin, member, and read-only. Private boxes are only visible to the owner and admins. Use Shared for household ammo that everyone should see; use Private for personally-owned stock.',
      },
      {
        id: 'group-by-filters',
        q: 'How do Group By and filters work?',
        a: 'The Group By dropdown in the toolbar organizes rows into collapsible groups by caliber, manufacturer, location, container, or other fields. The per-column filter row below the table header lets you narrow results further — type text to match, or use operators like <50, >100, or 10-50 for numeric columns. Toolbar stats update to reflect filtered rows only.',
      },
      {
        id: 'bulk-edit',
        q: 'How do I bulk edit multiple boxes?',
        a: 'Check the boxes you want to edit using the checkbox column on the left. An amber toolbar appears showing how many are selected. Click Edit Selected to open the Bulk Edit panel where you can update fields like manufacturer, type, category, container, cost, or notes across all selected boxes at once.',
      },
      {
        id: 'empty-archived',
        q: 'What are empty vs archived boxes?',
        a: 'Empty boxes have zero rounds remaining and are hidden by default — check Show Empty in the toolbar to reveal them. Archived boxes have been removed from active tracking via the row action menu and are hidden unless you check Archived. Archive a box when you\'ve finished its ammo and no longer need it in your active inventory.',
      },
    ],
  },
  {
    id: 'thresholds',
    title: 'Stock Thresholds',
    items: [
      {
        id: 'how-thresholds-work',
        q: 'How do thresholds work?',
        a: 'Thresholds trigger a "Running Low" alert on the Dashboard. AmmoLedger compares the total rounds across all boxes for each caliber (and all rounds in each storage location) against your configured threshold. When a total falls below its threshold it appears in the Running Low section on the Dashboard.',
      },
      {
        id: 'default-threshold',
        q: 'What is the default threshold?',
        a: 'The global default threshold applies to every caliber and location that doesn\'t have its own specific threshold. Go to Settings → Thresholds to change it. The factory default is 200 rounds.',
      },
      {
        id: 'caliber-threshold',
        q: 'How do I set a caliber threshold?',
        a: 'Go to Settings → Thresholds and scroll to Per-Caliber Thresholds. Select a caliber from the dropdown, enter the round count that should trigger an alert, and click Add. This overrides the global default for that caliber only.',
      },
      {
        id: 'location-threshold',
        q: 'How do I monitor a location?',
        a: 'Go to Settings → Thresholds and scroll to Per-Location Thresholds. Select a storage location, enter the total round count that should trigger a low-stock alert across all calibers in that location, and click Add. Useful for tracking overall readiness at a specific safe or storage area.',
      },
    ],
  },
  {
    id: 'import-section',
    title: 'Import',
    items: [
      {
        id: 'csv-format',
        q: 'What CSV format does AmmoLedger use?',
        a: 'AmmoLedger expects a CSV with columns matching its field names (caliber, manufacturer, product_name, qty_original, qty_remaining, etc.). Click Download Template on the Import page to get a properly formatted blank template with all supported columns.',
      },
      {
        id: 'template',
        q: 'How do I download the import template?',
        a: 'Go to Import in the sidebar and click Download Template. This gives you a CSV file with all supported column headers and an example row. Delete the example row, fill in your data, and upload the file to validate it.',
      },
      {
        id: 'legacy-id-mode',
        q: 'What is Legacy ID mode?',
        a: 'If your CSV has a legacy_id column containing numeric values from a previous tracking system, AmmoLedger can use those numbers as the actual box IDs. This keeps labels and references from your old system valid. The option only appears when all legacy IDs are positive integers with no conflicts against existing boxes.',
      },
      {
        id: 'new-values',
        q: 'What happens to unrecognized values?',
        a: 'If your CSV contains calibers, manufacturers, or other lookup values that don\'t exist in AmmoLedger, they are created automatically during import. The validation step shows you exactly which new values will be added so you can review them before confirming.',
      },
    ],
  },
  {
    id: 'backup',
    title: 'Backup & Restore',
    items: [
      {
        id: 'how-to-backup',
        q: 'How do I back up my data?',
        a: 'Go to Admin → Backup and click Backup Now. This creates an immediate JSON export of all your data. You can also download the most recent backup from the same page.',
      },
      {
        id: 'how-to-restore',
        q: 'How do I restore from a backup?',
        a: 'Go to Admin → Backup and click Import Backup. Upload a JSON backup file previously created by AmmoLedger. A confirmation dialog will warn you that this replaces all current data before proceeding.',
      },
      {
        id: 'scheduled-backup',
        q: 'How does scheduled backup work?',
        a: 'AmmoLedger automatically backs up your data every night at the time set in config.yaml (default: 03:00 server time). Go to Admin → Backup to see when the last backup ran and to change the schedule or retention period. Backups older than the configured retention days are pruned automatically.',
      },
      {
        id: 'json-vs-sqlite',
        q: 'What is JSON export vs SQLite backup?',
        a: 'JSON export captures your inventory and expenditure data in a portable format that can be re-imported into AmmoLedger. SQLite backup is the raw database file — useful for developer recovery but not used by the restore UI. Use JSON export for routine backups.',
      },
    ],
  },
  {
    id: 'users',
    title: 'User Management',
    items: [
      {
        id: 'invite',
        q: 'How do I invite a family member?',
        a: 'Go to Admin → Invitations and click New Invite. Choose a role (Member or Read Only for most household users), optionally enter their email as a hint, and copy the generated link. Send it to them — the link expires after 72 hours by default. They click the link and create their own account with a password of their choosing.',
      },
      {
        id: 'roles',
        q: 'What are the three roles?',
        a: 'Admin can manage users, invitations, backups, and datasets in addition to full inventory access. Member can add, edit, and expend ammo. Read Only can view the inventory and dashboard but cannot make any changes.',
      },
      {
        id: 'reset-password',
        q: 'How do I reset someone\'s password?',
        a: 'Go to Admin → Users and click the link icon next to the user. Copy the generated reset link and send it to the user — it expires in 24 hours and can only be used once. Alternatively, click the key icon to set a new password directly; the user will be prompted to change it on next login.',
      },
      {
        id: 'recover-admin',
        q: 'How do I recover my admin password?',
        a: 'If you\'re locked out of your admin account, edit config.yaml inside the container, set security.reset_token to a random string, restart the backend, and visit /reset?token=your-value. Enter your admin email and set a new password. Remove the token from config.yaml immediately after use. See the Installation Guide for step-by-step instructions.',
      },
    ],
  },
  {
    id: 'about',
    title: 'About',
    items: [
      {
        id: 'updates',
        q: 'How do I check for updates?',
        a: 'AmmoLedger automatically checks for updates on startup and every 24 hours if check_for_updates: true is set in config.yaml. An "Update available" badge appears in the sidebar when a newer version is detected. Go to About to see the current version and release notes from GitHub.',
      },
      {
        id: 'bugs',
        q: 'Where do I report bugs?',
        a: 'Open an issue at github.com/crzykidd/AmmoLedger/issues. Include your AmmoLedger version (visible in the sidebar or About page), what you expected to happen, and what actually happened. Screenshots are helpful for visual issues.',
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-gold/30 text-inherit rounded-sm px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {highlight(text.slice(idx + query.length), query)}
    </>
  )
}

export default function HelpPage() {
  const [search, setSearch] = useState('')
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(HELP_CONTENT.map((s) => s.id)),
  )
  const [openItems, setOpenItems] = useState<Set<string>>(new Set())
  const mainRef = useRef<HTMLDivElement>(null)

  const query = search.trim().toLowerCase()

  const filtered = useMemo(() => {
    if (!query) return HELP_CONTENT
    return HELP_CONTENT.map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          item.q.toLowerCase().includes(query) || item.a.toLowerCase().includes(query),
      ),
    })).filter((s) => s.items.length > 0)
  }, [query])

  function toggleSection(id: string) {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleItem(id: string) {
    setOpenItems((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function isSectionOpen(id: string) {
    return openSections.has(id)
  }

  function isItemOpen(id: string) {
    return query ? true : openItems.has(id)
  }

  function scrollToSection(sectionId: string) {
    const el = mainRef.current?.querySelector(`#section-${sectionId}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <AppShell>
      <TopBar title="Help" />
      <div className="flex-1 overflow-y-auto">
        <div className="flex h-full">
          {/* TOC sidebar — desktop only */}
          <aside className="hidden lg:flex flex-col w-48 shrink-0 border-r border-gray-200 dark:border-gray-800 py-6 px-3 sticky top-0 self-start max-h-[calc(100vh-56px)] overflow-y-auto">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3 px-2">
              Contents
            </p>
            <nav className="space-y-0.5">
              {HELP_CONTENT.map((section) => (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={cn(
                    'w-full text-left text-sm px-2 py-1.5 rounded-lg transition-colors',
                    'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800',
                  )}
                >
                  {section.title}
                </button>
              ))}
            </nav>
          </aside>

          {/* Main content */}
          <main ref={mainRef} className="flex-1 px-4 sm:px-8 py-6 max-w-3xl">
            {/* Search */}
            <div className="relative mb-8">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <input
                type="search"
                placeholder="Search help…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 h-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent"
              />
            </div>

            {filtered.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-12">
                No results for "{search}"
              </p>
            ) : (
              <div className="space-y-6">
                {filtered.map((section) => (
                  <section key={section.id} id={`section-${section.id}`}>
                    {/* Section heading */}
                    <button
                      type="button"
                      onClick={() => toggleSection(section.id)}
                      className="flex items-center gap-2 w-full text-left mb-3 group"
                    >
                      {isSectionOpen(section.id) ? (
                        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                      )}
                      <h2 className="text-base font-semibold text-gray-900 dark:text-white group-hover:text-gold transition-colors">
                        {section.title}
                      </h2>
                    </button>

                    {isSectionOpen(section.id) && (
                      <div className="ml-6 space-y-1">
                        {section.items.map((item) => (
                          <div
                            key={item.id}
                            className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden"
                          >
                            <button
                              type="button"
                              onClick={() => toggleItem(item.id)}
                              className="flex items-center gap-2 w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                            >
                              {isItemOpen(item.id) ? (
                                <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              )}
                              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                {highlight(item.q, search.trim())}
                              </span>
                            </button>
                            {isItemOpen(item.id) && (
                              <div className="px-4 pb-3 pt-0 border-t border-gray-100 dark:border-gray-800">
                                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed pt-3">
                                  {highlight(item.a, search.trim())}
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
    </AppShell>
  )
}
