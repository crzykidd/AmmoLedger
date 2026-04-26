import * as React from 'react'
import { DayPicker } from 'react-day-picker'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

export type CalendarProps = React.ComponentProps<typeof DayPicker>

export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-y-4 sm:gap-x-4',
        month: 'space-y-4',
        caption: 'flex justify-center pt-1 relative items-center',
        caption_label: 'text-sm font-medium text-gray-900 dark:text-white',
        nav: 'space-x-1 flex items-center',
        nav_button: cn(
          buttonVariants({ variant: 'secondary', size: 'icon' }),
          'h-7 w-7 bg-transparent opacity-50 hover:opacity-100',
        ),
        nav_button_previous: 'absolute left-1',
        nav_button_next: 'absolute right-1',
        table: 'w-full border-collapse space-y-1',
        head_row: 'flex',
        head_cell: 'text-gray-500 dark:text-gray-400 rounded-md w-9 font-normal text-[0.8rem]',
        row: 'flex w-full mt-2',
        cell: 'h-9 w-9 text-center text-sm p-0 relative',
        day: cn(buttonVariants({ variant: 'ghost' }), 'h-9 w-9 p-0 font-normal'),
        day_selected:
          'bg-gold text-navy rounded-md hover:bg-gold-light hover:text-navy focus:bg-gold focus:text-navy',
        day_today: 'bg-gray-100 dark:bg-gray-800 rounded-md text-gray-900 dark:text-white',
        day_outside: 'text-gray-400 dark:text-gray-600 opacity-50',
        day_disabled: 'text-gray-300 dark:text-gray-600 opacity-50',
        day_range_middle: 'aria-selected:bg-gray-100 aria-selected:text-gray-900',
        day_hidden: 'invisible',
        ...classNames,
      }}
      // node_modules currently has react-day-picker v9 (wrong version); IconLeft/IconRight
      // are v8 API and will type-check correctly after container rebuilds with ^8.10.1
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      components={{
        IconLeft: () => <ChevronLeft className="h-4 w-4" />,
        IconRight: () => <ChevronRight className="h-4 w-4" />,
      } as any}
      {...props}
    />
  )
}
