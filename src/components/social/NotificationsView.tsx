import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Event as NostrEvent } from 'nostr-tools'
import { Loader2 } from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'
import { KINDS } from '@/lib/constants'
import { useSettingsStore } from '@/stores/settingsStore'
import { fetchEvents } from '@/lib/nostr/relay-pool'
import { draftNaddr, releaseNevent } from '@/lib/nostr/nipps'
import { AuthorLine } from './AuthorLine'
import { NoteContent } from './NoteContent'

interface Notif {
  id: string
  event: NostrEvent
  createdAt: number
  actor: string
  /** Where the comment lives: a draft (by address) or a release (by id). */
  target: { kind: 'draft'; href: string; title: string } | { kind: 'release'; href: string; title: string }
}

/**
 * Comments (NIP-22) on the user's own drafts and releases, newest first.
 * Drafts are addressable, so their comments carry an `A` root tag; releases
 * are regular events, so theirs carry `E`.
 */
export function NotificationsView({ myPubkey }: { myPubkey: string }) {
  const navigate = useNavigate()
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')
      try {
        const [drafts, releases] = await Promise.all([
          fetchEvents(relays, { kinds: [KINDS.PS_DRAFT], authors: [myPubkey], limit: 200 }, 8000),
          fetchEvents(relays, { kinds: [KINDS.PS_RELEASE], authors: [myPubkey], limit: 500 }, 8000),
        ])
        const byA = new Map<string, Notif['target']>()
        for (const ev of drafts) {
          const d = ev.tags.find((t) => t[0] === 'd')?.[1] ?? ''
          byA.set(`${KINDS.PS_DRAFT}:${myPubkey}:${d}`, { kind: 'draft', href: `/draft/${draftNaddr(myPubkey, d)}`, title: ev.tags.find((t) => t[0] === 'title')?.[1] || 'Untitled' })
        }
        const byE = new Map<string, Notif['target']>()
        for (const ev of releases) {
          const v = ev.tags.find((t) => t[0] === 'v')?.[1]?.split(':').pop()
          const title = ev.tags.find((t) => t[0] === 'title')?.[1] || 'Untitled'
          byE.set(ev.id, { kind: 'release', href: `/release/${releaseNevent(ev.id, myPubkey)}`, title: v ? `${title} v${v}` : title })
        }
        const aTags = [...byA.keys()]
        const eIds = [...byE.keys()]
        if (aTags.length === 0 && eIds.length === 0) { if (!cancelled) { setNotifs([]); setLoading(false) } return }

        const [onDrafts, onReleases] = await Promise.all([
          aTags.length ? fetchEvents(relays, { kinds: [KINDS.COMMENT], '#A': aTags, limit: 200 }, 6000) : Promise.resolve([] as NostrEvent[]),
          eIds.length ? fetchEvents(relays, { kinds: [KINDS.COMMENT], '#E': eIds, limit: 200 }, 6000) : Promise.resolve([] as NostrEvent[]),
        ])
        const out: Notif[] = []
        const seen = new Set<string>()
        for (const ev of onDrafts) {
          if (ev.pubkey === myPubkey || seen.has(ev.id)) continue
          const a = ev.tags.find((t) => t[0] === 'A')?.[1]
          const target = a && byA.get(a)
          if (!target) continue
          seen.add(ev.id)
          out.push({ id: ev.id, event: ev, createdAt: ev.created_at, actor: ev.pubkey, target })
        }
        for (const ev of onReleases) {
          if (ev.pubkey === myPubkey || seen.has(ev.id)) continue
          const e = ev.tags.find((t) => t[0] === 'E')?.[1]
          const target = e && byE.get(e)
          if (!target) continue
          seen.add(ev.id)
          out.push({ id: ev.id, event: ev, createdAt: ev.created_at, actor: ev.pubkey, target })
        }
        out.sort((a, b) => b.createdAt - a.createdAt)
        if (!cancelled) setNotifs(out)
      } catch {
        if (!cancelled) setNotifs([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [myPubkey])

  if (loading) {
    return <div className="flex items-center justify-center gap-2 py-10 text-sm text-neutral-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading notifications…</div>
  }
  if (notifs.length === 0) {
    return <p className="py-12 text-center text-sm text-neutral-500">No comments on your drafts or releases yet.</p>
  }

  return (
    <div className="space-y-3">
      {notifs.map((n) => {
        // Deep-link to the comment so the page scrolls to it and opens the thread.
        const href = `${n.target.href}?c=${n.event.id}`
        return (
          <div
            key={n.id}
            onClick={() => navigate(href)}
            className={cn('cursor-pointer rounded-lg border border-edge bg-panel p-3 hover:border-edge-2')}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <AuthorLine
                pubkey={n.actor}
                size="xs"
                suffix={<span className="text-xs text-neutral-500">commented on your {n.target.kind} <span className="text-neutral-300">"{n.target.title}"</span></span>}
              />
              <span className="shrink-0 text-xs text-neutral-600">{formatRelativeTime(n.createdAt)}</span>
            </div>
            <div className="mt-2 pl-7"><NoteContent event={n.event} noEmbed /></div>
          </div>
        )
      })}
    </div>
  )
}
