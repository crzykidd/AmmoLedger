import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard,
  Package,
  FileUp,
  SlidersHorizontal,
  User,
  Users,
  Mail,
  DatabaseBackup,
  List,
  Info,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { UserProfileDrawer } from '@/components/UserProfileDrawer'
import { getSystemVersion } from '@/api/system'
import logoFull from '@/assets/brand/logo-full-dark.png'
import logoCircle from '@/assets/brand/logo-circle-dark.png'

const STORAGE_KEY = 'sidebar_collapsed'

interface NavItem {
  label: string
  icon: React.ElementType
  href: string
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
      { label: 'Inventory', icon: Package, href: '/inventory' },
      { label: 'Import', icon: FileUp, href: '/import' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { label: 'Profile', icon: User, href: '/settings/profile' },
      { label: 'Thresholds', icon: SlidersHorizontal, href: '/settings/thresholds' },
    ],
  },
  {
    label: 'Admin',
    adminOnly: true,
    items: [
      { label: 'Users', icon: Users, href: '/admin/users' },
      { label: 'Invitations', icon: Mail, href: '/admin/invites' },
      { label: 'Backup', icon: DatabaseBackup, href: '/admin/backup' },
      { label: 'Lookups', icon: List, href: '/admin/lookups' },
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
  const versionLabel = (() => {
    if (!versionData) return null
    const { version, build_sha } = versionData
    const isDev = !!build_sha || version.includes('dev')
    if (isDev && build_sha) return `dev · ${build_sha.slice(0, 7)}`
    if (isDev) return 'dev'
    return `v${version}`
  })()

  const shaLink = versionData?.build_sha
    ? `https://github.com/crzykidd/AmmoLedger/commit/${versionData.build_sha}`
    : null

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
                  {section.items.map((item) => {
                    const active = isActive(item.href, location.pathname)
                    const Icon = item.icon
                    return (
                      <Link
                        key={item.href}
                        to={item.href}
                        className={cn(
                          'flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-colors',
                          active
                            ? 'bg-gold/20 text-gold'
                            : 'text-white/60 hover:text-white hover:bg-white/10',
                          collapsed && 'justify-center',
                        )}
                        title={collapsed ? item.label : undefined}
                      >
                        <Icon className="w-5 h-5 shrink-0" />
                        {!collapsed && <span>{item.label}</span>}
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

        {/* About link */}
        <div className="px-2 border-t border-white/10 py-1">
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
          {!collapsed && versionLabel && (
            <div className="mt-2 px-2 text-center">
              {shaLink ? (
                <a
                  href={shaLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-white/25 hover:text-white/40 transition-colors"
                >
                  {versionLabel}
                </a>
              ) : (
                <span className="text-xs text-white/25">{versionLabel}</span>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
