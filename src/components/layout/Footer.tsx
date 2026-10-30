import { Link } from 'react-router-dom'

export function Footer() {
  return (
    <footer className="mt-16 border-t border-border/50 bg-background/50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col flex-wrap items-center gap-4 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="NIP-PS" className="h-5 w-auto" />
            <span className="text-sm text-muted-foreground">
              NIP-PS, Permissionless Standards for Nostr (Alpha)
            </span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground">
            <Link to="/about" className="hover:text-foreground transition-colors">About</Link>
          </nav>
        </div>
      </div>
    </footer>
  )
}
