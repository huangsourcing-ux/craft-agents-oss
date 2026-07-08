import wudiBuddyLogo from "@/assets/wudibuddy-logo-transparent.png"

interface CraftAgentsLogoProps {
  className?: string
  alt?: string
}

/**
 * WudiBuddy Agents logo.
 * Export name is kept for compatibility with existing call sites.
 */
export function CraftAgentsLogo({ className, alt = "WudiBuddy Agents" }: CraftAgentsLogoProps) {
  return (
    <img
      src={wudiBuddyLogo}
      alt={alt}
      className={className}
      draggable={false}
    />
  )
}
