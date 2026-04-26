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
        month_caption: 'flex justify-center pt-1 relative items-center',
        caption_label: 'text-sm font-medium text-gray-900 dark:text-white',
        nav: 'space-x-1 flex items-center',
        button_previous: cn(
          buttonVariants({ variant: 'secondary', size: 'icon' }),
          'absolute left-1 h-7 w-7 bg-transparent opacity-50 hover:opacity-100',
        ),
        button_next: cn(
          buttonVariants({ variant: 'secondary', size: 'icon' }),
          'absolute right-1 h-7 w-7 bg-transparent opacity-50 hover:opacity-100',
        ),
        month_grid: 'w-full border-collapse space-y-1',
        weekdays: 'flex',
        weekday: 'text-gray-500 dark:text-gray-400 rounded-md w-9 font-normal text-[0.8rem]',
        week: 'flex w-full mt-2',
        day: 'h-9 w-9 text-center text-sm p-0 relative',
        day_button: cn(
          buttonVariants({ variant: 'ghost' }),
          'h-9 w-9 p-0 font-normal',
        ),
        selected:
          'bg-gold text-navy rounded-md hover:bg-gold-light hover:text-navy focus:bg-gold focus:text-navy',
        today: 'bg-gray-100 dark:bg-gray-800 rounded-md text-gray-900 dark:text-white',
        outside: 'text-gray-400 dark:text-gray-600 opacity-50',
        disabled: 'text-gray-300 dark:text-gray-600 opacity-50',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left' ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          ),
      }}
      {...props}
    />
  )
}
