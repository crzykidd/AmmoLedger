import type { SVGProps } from 'react'

/**
 * Custom cartridge (bullet) icon for AmmoLedger.
 *
 * Drawn to match the visual weight and style of lucide-react icons:
 * - 24x24 viewBox
 * - 2px stroke width
 * - currentColor for stroke (inherits from parent text color)
 * - rounded line caps and joins
 *
 * Use the same way as a lucide icon:
 *   <CartridgeIcon className="w-5 h-5" />
 */
export default function CartridgeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* Bullet tip — pointed, rounded apex */}
      <path d="M10 7 Q10 3 12 2 Q14 3 14 7" />
      {/* Bullet body sides */}
      <line x1="10" y1="7" x2="10" y2="10" />
      <line x1="14" y1="7" x2="14" y2="10" />
      {/* Case body with shoulder taper from bullet */}
      <path d="M10 10 L9 11 L9 21 L15 21 L15 11 L14 10" />
      {/* Rim line near base */}
      <line x1="9" y1="19" x2="15" y2="19" />
    </svg>
  )
}
