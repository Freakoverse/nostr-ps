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

/**
 * Second hop — the two-edge path you → A → B → target, verified from signed
 * kind-3 only. A is someone you follow; B is someone A follows who, in turn,
 * follows the target. Used when the first hop is empty (a 3rd-degree account):
 * nobody you follow follows them, but someone you follow follows someone who
 * does. Bounded: your follows' contact lists (one query per 200 of them) are
 * intersected locally with the target's followers (one capped query), so the
 * cost is roughly |your follows| + |target's followers| events, not a crawl.
 * Beyond this, chains fan out combinatorially and are left to a node.
 */
export async function fetchSecondHop(
  relays: string[],
  myFollows: string[],
  target: string,
  followerCap = 500,
): Promise<{ connector: string; middle: string }[]> {
  if (!myFollows.length) return []
  const followSet = new Set(myFollows)

  // 1. Your follows' own contact lists → for each B they follow, which of your
  //    follows (A) points at B. Replaceable: keep the newest list per author.
  const bToA = new Map<string, Set<string>>()
  const CHUNK = 200
  for (let i = 0; i < myFollows.length; i += CHUNK) {
    const batch = myFollows.slice(i, i + CHUNK)
    let evs: NostrEvent[] = []
    try {
      evs = await fetchEvents(relays, { kinds: [KINDS.CONTACTS], authors: batch, limit: batch.length }, 8000)
    } catch { continue }
    const newest = new Map<string, NostrEvent>()
    for (const ev of evs) {
      const cur = newest.get(ev.pubkey)
      if (!cur || ev.created_at > cur.created_at) newest.set(ev.pubkey, ev)
    }
    for (const [a, ev] of newest) {
      if (!followSet.has(a)) continue
      for (const t of ev.tags) {
        if (t[0] !== 'p' || !t[1] || t[1] === a || t[1] === target || followSet.has(t[1])) continue
        let set = bToA.get(t[1])
        if (!set) { set = new Set(); bToA.set(t[1], set) }
        set.add(a)
      }
    }
  }
  if (!bToA.size) return []

  // 2. The target's followers (B candidates), capped. Each is a verified
  //    follower since the query is #p = target against their own kind 3.
  let followers: NostrEvent[] = []
  try {
    followers = await fetchEvents(relays, { kinds: [KINDS.CONTACTS], '#p': [target], limit: followerCap }, 8000)
  } catch { return [] }
  const fNewest = new Map<string, NostrEvent>()
  for (const ev of followers) {
    const cur = fNewest.get(ev.pubkey)
    if (!cur || ev.created_at > cur.created_at) fNewest.set(ev.pubkey, ev)
  }

  // 3. Intersect: B that one of your follows points at AND whose newest list
  //    still carries the target. Emit a path per (A, B).
  const paths: { connector: string; middle: string }[] = []
  for (const [b, ev] of fNewest) {
    const as = bToA.get(b)
    if (!as) continue
    if (!ev.tags.some((t) => t[0] === 'p' && t[1] === target)) continue
    for (const a of as) paths.push({ connector: a, middle: b })
  }
  return paths
}
