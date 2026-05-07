import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpCircle, CheckCircle, ExternalLink, RefreshCw } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import TopBar from '@/components/layout/TopBar'
import logoFull from '@/assets/brand/logo-full-dark.png'
import { forceVersionCheck, getSystemVersion } from '@/api/system'
import { useAuth } from '@/contexts/AuthContext'

const GH_BASE = 'https://github.com/crzykidd/AmmoLedger'

const LINKS = [
  { label: 'GitHub Repository', href: GH_BASE },
  { label: 'Report an Issue', href: `${GH_BASE}/issues` },
  { label: 'Changelog', href: `${GH_BASE}/blob/main/CHANGELOG.md` },
  { label: 'Documentation', href: `${GH_BASE}/blob/main/docs/PRD.md` },
]

function formatLastChecked(iso: string | null): string {
  if (!iso) return 'Never'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export default function AboutPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = user?.role === 'admin'

  const { data: versionData } = useQuery({
    queryKey: ['system-version'],
    queryFn: getSystemVersion,
    retry: false,
  })

  const checkMut = useMutation({
    mutationFn: forceVersionCheck,
    onSuccess: (data) => {
      queryClient.setQueryData(['system-version'], data)
    },
  })

  const isDev = versionData?.build?.is_dev ?? false
  const displayVersion = versionData?.display_version ?? '…'
  const branch = versionData?.build?.branch
  const showBranch = isDev && !!branch && branch !== 'unknown'
  const shortSha = versionData?.build?.sha ?? null
  const fullSha = versionData?.build?.full_sha ?? null
  const commitUrl = fullSha && fullSha !== 'unknown' ? `${GH_BASE}/commit/${fullSha}` : null
  const releaseUrl = !isDev && versionData?.version
    ? `${GH_BASE}/releases/tag/v${versionData.version}`
    : null

  return (
    <AppShell>
      <TopBar title="About" />
      <div className="flex-1 overflow-y-auto px-4 py-8 flex justify-center">
        <div className="w-full max-w-md space-y-6">

          {/* Logo + name + tagline */}
          <div className="text-center">
            <img
              src={logoFull}
              alt="AmmoLedger"
              className="w-[200px] mx-auto mb-5"
            />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              AmmoLedger
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1.5 text-sm">
              Track Inventory. Log Usage. Stay Prepared.
            </p>
          </div>

          {/* Version card */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">Version</span>
              <span className="text-sm font-mono font-semibold text-gray-900 dark:text-white">
                {!isDev && releaseUrl ? (
                  <a href={releaseUrl} target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">
                    {displayVersion}
                  </a>
                ) : isDev && shortSha && commitUrl ? (
                  <>
                    {`v${versionData!.version}-dev (`}
                    <a href={commitUrl} target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">
                      {shortSha}
                    </a>
                    {')'}
                  </>
                ) : (
                  displayVersion
                )}
              </span>
            </div>

            {showBranch && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Branch</span>
                <span className="text-sm font-mono text-gray-600 dark:text-gray-400">
                  {branch}
                </span>
              </div>
            )}

            {isDev && shortSha && commitUrl && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Commit</span>
                <a
                  href={commitUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-mono text-gold hover:underline"
                >
                  {shortSha}
                </a>
              </div>
            )}

            {isDev && (versionData?.dev_behind_by ?? 0) > 0 ? (
              <div className="flex flex-col gap-1.5 text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <ArrowUpCircle className="h-4 w-4 shrink-0" />
                  <span className="flex-1">
                    {versionData!.dev_behind_by} new commit{versionData!.dev_behind_by === 1 ? '' : 's'} on dev since this build
                  </span>
                  {fullSha && fullSha !== 'unknown' && (
                    <a
                      href={`${GH_BASE}/compare/${fullSha}...dev`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs underline hover:no-underline shrink-0"
                    >
                      View changes
                    </a>
                  )}
                </div>
                {versionData?.dev_latest_message && (
                  <div className="text-xs text-emerald-700/80 dark:text-emerald-400/80 truncate pl-6">
                    Latest: {versionData.dev_latest_message}
                  </div>
                )}
              </div>
            ) : isDev && versionData?.dev_behind_by === 0 ? (
              <div className="flex items-center gap-2.5 text-sm text-gray-500 dark:text-gray-400">
                <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />
                <span>Up to date with dev</span>
              </div>
            ) : isDev ? (
              null
            ) : versionData?.update_available && versionData.latest_version ? (
              <div className="flex items-center gap-2.5 text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-lg px-3 py-2.5">
                <ArrowUpCircle className="h-4 w-4 shrink-0" />
                <span className="flex-1">
                  v{versionData.latest_version} available
                </span>
                <a
                  href={`${GH_BASE}/releases`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs underline hover:no-underline shrink-0"
                >
                  View on GitHub
                </a>
              </div>
            ) : versionData?.latest_version ? (
              <div className="flex items-center gap-2.5 text-sm text-gray-500 dark:text-gray-400">
                <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />
                <span>Up to date</span>
              </div>
            ) : null}

            {/* Last checked + Check Now */}
            <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-800">
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Last checked: {formatLastChecked(versionData?.last_checked ?? null)}
              </span>
              {isAdmin && (
                <button
                  onClick={() => checkMut.mutate()}
                  disabled={checkMut.isPending}
                  className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${checkMut.isPending ? 'animate-spin' : ''}`} />
                  {checkMut.isPending ? 'Checking…' : 'Check Now'}
                </button>
              )}
            </div>
          </div>

          {/* Links */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
            {LINKS.map(({ label, href }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group"
              >
                <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                  {label}
                </span>
                <ExternalLink className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              </a>
            ))}
          </div>

          {/* License */}
          <p className="text-center text-xs text-gray-400 dark:text-gray-600 pb-4">
            Released under the MIT License
          </p>

        </div>
      </div>
    </AppShell>
  )
}
