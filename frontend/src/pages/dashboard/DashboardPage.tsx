import AppShell from '@/components/layout/AppShell'
import TopBar from '@/components/layout/TopBar'

export default function DashboardPage() {
  return (
    <AppShell>
      <TopBar title="Dashboard" />
      <div className="flex-1 p-6 overflow-auto">
        <p className="text-gray-500 dark:text-gray-400">Coming soon</p>
      </div>
    </AppShell>
  )
}
