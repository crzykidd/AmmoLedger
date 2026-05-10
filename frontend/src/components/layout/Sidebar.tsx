import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard,
  BookOpen,
  FileUp,
  SlidersHorizontal,
  User,
  Users,
  DatabaseBackup,
  Database,
  ClipboardList,
  Info,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Crosshair,
} from 'lucide-react'
import CartridgeIcon from '@/components/icons/CartridgeIcon'
import FirearmIcon from '@/components/icons/FirearmIcon'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { getCommunityStatus } from '@/api/community'
import { UserProfileDrawer } from '@/components/UserProfileDrawer'
import { getSystemVersion } from '@/api/system'
import logoFull from '@/assets/brand/logo-full-dark.png'
import logoCircle from '@/assets/brand/logo-circle-dark.png'

const STORAGE_KEY = 'sidebar_collapsed'

interface NavItem {
  label: string
  icon: React.ElementType
  href: string
  readOnlyHidden?: boolean
}

interface NavSection {
  label?: string
  adminOnly?: boolean
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
      { label: 'Ammo', icon: CartridgeIcon, href: '/ammo' },
      { label: 'Products', icon: BookOpen, href: '/products' },
      { label: 'Firearms', icon: FirearmIcon, href: '/firearms' },
      { label: 'At Range', icon: Crosshair, href: '/at-range', readOnlyHidden: true },
    ],
  },
  {
    label: 'Settings',
    items: [
      { label: 'Profile', icon: User, href: '/settings/profile' },
      { label: 'Thresholds', icon: SlidersHorizontal, href: '/settings/thresholds' },
      { label: 'Import', icon: FileUp, href: '/import' },
    ],
  },
  {
    label: 'Admin',
    adminOnly: true,
    items: [
      { label: 'Users', icon: Users, href: '/admin/users' },
      { label: 'Backup', icon: DatabaseBackup, href: '/admin/backup' },
      { label: 'Datasets', icon: Database, href: '/admin/datasets' },
      { label: 'Tasks', icon: ClipboardList, href: '/admin/tasks' },
    ],
  },
]

const ROLE_META: Record<string, { label: string; className: string }> = {
  admin: { label: 'Admin', className: 'bg-gold/20 text-gold' },
  member: { label: 'Member', className: 'bg-blue-500/20 text-blue-400' },
  read_only: { label: 'Read Only', className: 'bg-gray-500/20 text-gray-400' },
}

function isActive(href: string, pathname: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/'
  if (href === '/settings/profile') return pathname === '/settings/profile'
  if (href === '/settings/thresholds') return pathname === '/settings/thresholds'
  if (href === '/firearms') return pathname === '/firearms' || pathname.startsWith('/firearms/')
  return pathname === href
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(STORAGE_KEY) === 'true',
  )
  const [profileOpen, setProfileOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const { data: versionData } = useQuery({
    queryKey: ['system-version'],
    queryFn: getSystemVersion,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const { data: communityStatus } = useQuery({
    queryKey: ['community-status'],
    queryFn: getCommunityStatus,
    refetchInterval: 60_000,
    enabled: user?.role === 'admin',
  })
  const pendingTotal = communityStatus
    ? Object.values(communityStatus).reduce((sum, s) => sum + (s as { pending: number }).pending, 0)
    : 0

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const roleMeta = ROLE_META[user?.role ?? 'member'] ?? ROLE_META.member

  // Build the version display string
  const isDev = versionData?.build?.is_dev ?? false
  const shortSha = versionData?.build?.sha ?? null
  const fullSha = versionData?.build?.full_sha ?? null
  const shaLink = fullSha && fullSha !== 'unknown'
    ? `https://github.com/crzykidd/AmmoLedger/commit/${fullSha}`
    : null
  const releaseUrl = !isDev && versionData?.version
    ? `https://github.com/crzykidd/AmmoLedger/releases/tag/v${versionData.version}`
    : null

  const versionLabel = (() => {
    if (!versionData) return null
    if (isDev && shortSha && shortSha !== 'unknown') return shortSha
    if (isDev) return 'dev'
    return versionData.display_version ?? `v${versionData.version}`
  })()

  return (
    <>
      <UserProfileDrawer open={profileOpen} onClose={() => setProfileOpen(false)} />

      <aside
        className={cn(
          'flex flex-col h-screen bg-navy border-r border-white/10 transition-all duration-200 ease-in-out shrink-0',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        {/* Logo */}
        <div
          className={cn(
            'flex items-center justify-center border-b border-white/10',
            collapsed ? 'py-3' : 'p-4',
          )}
        >
          {collapsed ? (
            <img src={logoCircle} alt="AmmoLedger" className="w-10 h-10" />
          ) : (
            <img
              src={logoFull}
              alt="AmmoLedger"
              className="max-h-[120px] w-auto"
            />
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {NAV_SECTIONS.map((section, si) => {
            if (section.adminOnly && user?.role !== 'admin') return null
            return (
              <div key={si} className={si > 0 ? 'mt-4' : ''}>
                {section.label && !collapsed && (
                  <p className="px-4 mb-1 text-xs font-semibold uppercase tracking-widest text-white/30">
                    {section.label}
                  </p>
                )}
                <div className="px-2 space-y-1">
                  {section.items.filter((item) => !(item.readOnlyHidden && user?.role === 'read_only')).map((item) => {
                    const active = isActive(item.href, location.pathname)
                    const Icon = item.icon
                    return (
                      <Link
                        key={item.href}
                        to={item.href}
                        className={cn(
                          'relative flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-colors',
                          active
                            ? 'bg-gold/20 text-gold'
                            : 'text-white/60 hover:text-white hover:bg-white/10',
                          collapsed && 'justify-center',
                        )}
                        title={collapsed ? item.label : undefined}
                      >
                        <Icon className="w-5 h-5 shrink-0" />
                        {!collapsed && <span>{item.label}</span>}
                        {item.href === '/admin/datasets' && pendingTotal > 0 && (
                          collapsed
                            ? <span className="absolute top-0.5 right-0.5 bg-amber-500 w-2 h-2 rounded-full" />
                            : <span className="bg-amber-500 text-white text-xs font-bold min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full leading-none">{pendingTotal}</span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={toggle}
          className={cn(
            'flex items-center gap-3 px-2 py-2 mx-2 rounded-lg text-xs text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors',
            collapsed && 'justify-center',
          )}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span>Collapse</span>
            </>
          )}
        </button>

        {/* About + Help links */}
        <div className="px-2 border-t border-white/10 py-1 space-y-0.5">
          <Link
            to="/about"
            className={cn(
              'flex items-center gap-3 px-2 py-2 rounded-lg text-xs text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors',
              isActive('/about', location.pathname) && 'bg-gold/10 text-gold/70',
              collapsed && 'justify-center',
            )}
            title={collapsed ? 'About' : undefined}
          >
            <Info className="w-4 h-4 shrink-0" />
            {!collapsed && <span>About</span>}
          </Link>
          <Link
            to="/help"
            className={cn(
              'flex items-center gap-3 px-2 py-2 rounded-lg text-xs text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors',
              isActive('/help', location.pathname) && 'bg-gold/10 text-gold/70',
              collapsed && 'justify-center',
            )}
            title={collapsed ? 'Help' : undefined}
          >
            <HelpCircle className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Help</span>}
          </Link>
        </div>

        {/* User + Logout */}
        <div className="border-t border-white/10 p-3">
          {!collapsed && user && (
            <button
              onClick={() => setProfileOpen(true)}
              className="w-full text-left mb-2 px-1 py-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer group"
              title="View profile"
            >
              <p className="text-white text-sm font-medium truncate group-hover:text-white/90">
                {user.first_name} {user.last_name}
              </p>
              <span
                className={cn(
                  'inline-block text-xs px-2 py-0.5 rounded-full mt-1',
                  roleMeta.className,
                )}
              >
                {roleMeta.label}
              </span>
            </button>
          )}
          <button
            onClick={() => void handleLogout()}
            className={cn(
              'flex items-center gap-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg px-2 py-2 w-full transition-colors text-sm',
              collapsed && 'justify-center',
            )}
            title={collapsed ? 'Sign out' : undefined}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>

          {/* Version display — expanded only */}
          {!collapsed && versionData && (
            <div className="mt-2 px-2 text-center text-xs text-white/25">
              {!isDev && releaseUrl ? (
                // Release: whole label links to release page
                <a href={releaseUrl} target="_blank" rel="noopener noreferrer" className="hover:text-white/40 transition-colors">
                  {versionLabel}
                </a>
              ) : isDev && shortSha && shortSha !== 'unknown' && shaLink ? (
                // Dev: "dev · " plain, SHA linked
                <span>
                  {'dev · '}
                  <a href={shaLink} target="_blank" rel="noopener noreferrer" className="hover:text-white/40 transition-colors">
                    {shortSha}
                  </a>
                </span>
              ) : isDev ? (
                // Local dev: plain "dev" or label
                <span>{versionLabel ?? 'dev'}</span>
              ) : null}
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
