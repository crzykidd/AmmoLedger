import type { SVGProps } from 'react'

/**
 * Custom firearm icon for AmmoLedger.
 *
 * Stylized side-profile pistol silhouette — slide on top, frame, grip, trigger
 * guard. Generic enough to represent any firearm type. Drawn to match the
 * visual weight and style of lucide-react icons:
 * - 24x24 viewBox
 * - 2px stroke width
 * - currentColor for stroke
 * - rounded line caps and joins
 *
 * Use the same way as a lucide icon:
 *   <FirearmIcon className="w-5 h-5" />
 */
export default function FirearmIcon(props: SVGProps<SVGSVGElement>) {
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
      {/* Slide / barrel — top rectangle of the pistol */}
      <path d="M2 8 H17 V12 H2 Z" />
      {/* Front sight nub on top of slide */}
      <path d="M3.5 8 V7" />
      {/* Frame extending back and down to grip */}
      <path d="M17 12 H20 V14" />
      {/* Trigger guard arch under the frame */}
      <path d="M9 12 V14 H13 V12" />
      {/* Grip — angled down from frame */}
      <path d="M13 14 L15 21 H10 L9 14" />
    </svg>
  )
}
