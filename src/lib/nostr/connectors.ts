/**
 * First-hop connectors — the one hop of a trust path this client can verify on
 * its own, from signed data, with no graph crawl and no node.
 *
 * Given the viewer's own follow list and a target pubkey, it finds which of
 * those follows list the target in their own contact list (kind 3): "people you
 * follow who also follow them." That is the edge that put the target one step
 * inside your network — the weak link, when the target is unwanted. Deeper paths
 * fan out combinatorially and are left to a node; this stays bounded and local.
 */
import type { Event as NostrEvent } from 'nostr-tools'
import { KINDS } from '@/lib/constants'
import { fetchEvents } from '@/lib/nostr/relay-pool'

/** Pubkeys among `myFollows` whose current contact list includes `target`. */
export async function fetchConnectors(relays: string[], myFollows: string[], target: string): Promise<string[]> {
  if (!myFollows.length) return []
  const followSet = new Set(myFollows)
  const found = new Set<string>()
  const CHUNK = 200
  for (let i = 0; i < myFollows.length; i += CHUNK) {
    const batch = myFollows.slice(i, i + CHUNK)
    let evs: NostrEvent[] = []
    try {
      evs = await fetchEvents(relays, { kinds: [KINDS.CONTACTS], authors: batch, '#p': [target], limit: batch.length }, 8000)
    } catch { continue }
    // Kind 3 is replaceable: keep the newest per author, then confirm it still
    // lists the target (an older copy may carry a follow since removed).
    const newest = new Map<string, NostrEvent>()
    for (const ev of evs) {
      const cur = newest.get(ev.pubkey)
      if (!cur || ev.created_at > cur.created_at) newest.set(ev.pubkey, ev)
    }
    for (const [pk, ev] of newest) {
      if (followSet.has(pk) && ev.tags.some((t) => t[0] === 'p' && t[1] === target)) found.add(pk)
    }
  }
  return [...found]
}
