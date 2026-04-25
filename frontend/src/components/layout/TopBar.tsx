interface TopBarProps {
  title: string
  actions?: React.ReactNode
}

export default function TopBar({ title, actions }: TopBarProps) {
  return (
    <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-6 shrink-0">
      <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h1>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  )
}
