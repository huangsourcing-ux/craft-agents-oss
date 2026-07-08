import wudiBuddyLogo from "@/assets/wudibuddy-logo-transparent.png"

interface CraftAppIconProps {
  className?: string
  size?: number
}

/**
 * CraftAppIcon - Displays the WudiBuddy Agents logo.
 * Export name is kept for compatibility with existing call sites.
 */
export function CraftAppIcon({ className, size = 64 }: CraftAppIconProps) {
  return (
    <img
      src={wudiBuddyLogo}
      alt="WudiBuddy Agents"
      width={size}
      height={size}
      className={className}
      draggable={false}
    />
  )
}
