import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { dismissUpgrade, getChangelog, getSystemVersion } from '@/api/system'

// ---------------------------------------------------------------------------
// Minimal changelog markdown renderer — handles ### headings and - bullets
// ---------------------------------------------------------------------------

function ChangelogBody({ body }: { body: string }) {
  const elements: React.ReactNode[] = []
  let listItems: string[] = []
  let key = 0

  const flushList = () => {
    if (listItems.length === 0) return
    elements.push(
      <ul key={key++} className="list-disc list-inside space-y-0.5 ml-1 mb-2">
        {listItems.map((item, i) => (
          <li key={i} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {item}
          </li>
        ))}
      </ul>,
    )
    listItems = []
  }

  for (const line of body.split('\n')) {
    if (line.startsWith('### ')) {
      flushList()
      elements.push(
        <h4 key={key++} className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mt-3 mb-1 first:mt-0">
          {line.slice(4)}
        </h4>,
      )
    } else if (line.startsWith('- ')) {
      listItems.push(line.slice(2))
    } else if (line.trim() === '') {
      flushList()
    }
  }
  flushList()

  return <>{elements}</>
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export default function WhatsNewModal() {
  const queryClient = useQueryClient()

  const { data: versionData } = useQuery({
    queryKey: ['system-version'],
    queryFn: getSystemVersion,
    retry: false,
  })

  const upgradedFrom = versionData?.upgraded_from ?? null
  const currentVersion = versionData?.version ?? null

  const { data: changelog } = useQuery({
    queryKey: ['changelog', upgradedFrom, currentVersion],
    queryFn: () => getChangelog(upgradedFrom, currentVersion),
    enabled: !!upgradedFrom,
    retry: false,
  })

  const dismissMut = useMutation({
    mutationFn: dismissUpgrade,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-version'] })
    },
  })

  if (!upgradedFrom) return null

  const sections = changelog?.sections ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              What's New in v{currentVersion}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Upgraded from v{upgradedFrom}
            </p>
          </div>
          <button
            onClick={() => dismissMut.mutate()}
            className="mt-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          {!changelog || changelog.source === 'unavailable' || sections.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Release notes are not available. See the{' '}
              <a
                href="https://github.com/crzykidd/AmmoLedger/releases"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 underline"
              >
                GitHub releases page
              </a>{' '}
              for details.
            </p>
          ) : (
            sections.map((section) => (
              <div key={section.version} className="mb-5 last:mb-0">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="font-semibold text-gray-900 dark:text-white text-sm">
                    v{section.version}
                  </span>
                  {section.date && (
                    <span className="text-xs text-gray-400">{section.date}</span>
                  )}
                </div>
                <ChangelogBody body={section.body} />
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-800 flex justify-end">
          <button
            onClick={() => dismissMut.mutate()}
            disabled={dismissMut.isPending}
            className="px-4 py-2 text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
