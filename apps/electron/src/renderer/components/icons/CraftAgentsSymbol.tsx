import wudiBuddyLogo from "@/assets/wudibuddy-logo-transparent.png"

interface CraftAgentsSymbolProps {
  className?: string
  alt?: string
}

/**
 * WudiBuddy Agents logo symbol.
 * Export name is kept for compatibility with existing call sites.
 */
export function CraftAgentsSymbol({ className, alt = "WudiBuddy Agents" }: CraftAgentsSymbolProps) {
  return (
    <img
      src={wudiBuddyLogo}
      alt={alt}
      className={className}
      draggable={false}
    />
  )
}
