/**
 * A session cache of kind-3 contact lists, keyed by author. The connection
 * reconstruction needs your follows' full follow lists to find bridges, and that
 * pull is the same no matter who you are checking — target-independent — so once
 * fetched it is reused across modal opens and across targets within a session.
 *
 * Only found lists are cached (a short TTL guards staleness); authors a relay
 * did not return are simply refetched next time, so a transient miss never gets
 * baked in as "no list". There is no negative caching for that reason.
 */
import type { Event as NostrEvent } from 'nostr-tools'
import { KINDS } from '@/lib/constants'
import { fetchEvents } from '@/lib/nostr/relay-pool'

const DEFAULT_TTL = 10 * 60 * 1000 // 10 minutes
const cache = new Map<string, { event: NostrEvent; at: number }>()

/**
 * Newest kind-3 per pubkey, served from cache when fresh and fetched (in author
 * batches) otherwise. The returned map holds only authors with a known list.
 */
export async function fetchContactLists(
  relays: string[],
  pubkeys: string[],
  ttl = DEFAULT_TTL,
): Promise<Map<string, NostrEvent>> {
  const now = Date.now()
  const out = new Map<string, NostrEvent>()
  const need: string[] = []

  for (const pk of new Set(pubkeys)) {
    const hit = cache.get(pk)
    if (hit && now - hit.at < ttl) out.set(pk, hit.event)
    else need.push(pk)
  }

  const CHUNK = 200
  for (let i = 0; i < need.length; i += CHUNK) {
    const batch = need.slice(i, i + CHUNK)
    let evs: NostrEvent[] = []
    try {
      evs = await fetchEvents(relays, { kinds: [KINDS.CONTACTS], authors: batch, limit: batch.length }, 8000)
    } catch {
      continue // leave this batch uncached so it retries next time
    }
    // Kind 3 is replaceable: keep the newest per author.
    const newest = new Map<string, NostrEvent>()
    for (const ev of evs) {
      const cur = newest.get(ev.pubkey)
      if (!cur || ev.created_at > cur.created_at) newest.set(ev.pubkey, ev)
    }
    for (const [pk, ev] of newest) {
      cache.set(pk, { event: ev, at: now })
      out.set(pk, ev)
    }
  }
  return out
}

/** Drop everything, e.g. on logout. */
export function clearContactCache(): void {
  cache.clear()
}
