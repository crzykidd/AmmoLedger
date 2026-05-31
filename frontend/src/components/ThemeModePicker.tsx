import { Sun, Moon, Monitor } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { useTheme } from '@/hooks/useTheme'
import type { Theme } from '@/contexts/ThemeContext'

const OPTIONS: { value: Theme; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'Follow system', Icon: Monitor },
]

export function ThemeModePicker() {
  const { theme, setTheme } = useTheme()
  const current = OPTIONS.find(o => o.value === theme) ?? OPTIONS[2]
  const CurrentIcon = current.Icon

  return (
    <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
      <SelectTrigger className="bg-white/5 border-white/10 text-white h-9 focus:ring-offset-0">
        <span className="flex items-center gap-2">
          <CurrentIcon className="h-3.5 w-3.5 shrink-0" />
          <span>{current.label}</span>
        </span>
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map(({ value, label, Icon }) => (
          <SelectItem key={value} value={value}>
            <span className="flex items-center gap-2">
              <Icon className="h-3.5 w-3.5" />
              {label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
