import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { nip19 } from 'nostr-tools'
import { User } from 'lucide-react'
import { cn, formatRelativeTime , shortNpub } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settingsStore'
import { useUserStore, type UserProfile } from '@/stores/userStore'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { TrustBadge } from '@/components/lens/TrustBadge'

/** Avatar + name + trust badge + optional timestamp, one line. */
export function AuthorLine({
  pubkey, at, size = 'sm', className, suffix, linked = true,
}: {
  pubkey: string
  at?: number
  size?: 'xs' | 'sm' | 'md'
  className?: string
  suffix?: React.ReactNode
  /** false when the line sits inside another link (cards), since anchors cannot nest. */
  linked?: boolean
}) {
  const [profile, setProfile] = useState<UserProfile | null>(() => useUserStore.getState().getCachedProfile(pubkey))

  useEffect(() => {
    let cancelled = false
    const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')
    useUserStore.getState().fetchProfile(pubkey, relays).then((p) => { if (!cancelled) setProfile(p) })
    return () => { cancelled = true }
  }, [pubkey])

  const npub = nip19.npubEncode(pubkey)
  const name = profile?.display_name || profile?.name || shortNpub(npub)
  const avatar = size === 'md' ? 'h-9 w-9' : size === 'sm' ? 'h-7 w-7' : 'h-5 w-5'

  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <Wrap to={`/profile/${npub}`} linked={linked} className="shrink-0">
        <Avatar className={avatar}>
          {profile?.picture ? <AvatarImage src={profile.picture as string} alt={name} /> : null}
          <AvatarFallback className="bg-panel-2 text-neutral-400"><User className="h-3.5 w-3.5" /></AvatarFallback>
        </Avatar>
      </Wrap>
      <Wrap to={`/profile/${npub}`} linked={linked} className="truncate text-sm font-medium text-neutral-200 hover:text-purple-400">
        {name}
      </Wrap>
      <TrustBadge pubkey={pubkey} />
      {at !== undefined && <span className="shrink-0 text-xs text-neutral-600">{formatRelativeTime(at)}</span>}
      {suffix}
    </div>
  )
}

function Wrap({ to, linked, className, children }: { to: string; linked: boolean; className?: string; children: React.ReactNode }) {
  if (!linked) return <span className={className}>{children}</span>
  return <Link to={to} className={className} onClick={(e) => e.stopPropagation()}>{children}</Link>
}
