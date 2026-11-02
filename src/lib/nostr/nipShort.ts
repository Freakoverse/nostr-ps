/**
 * NIP-SHORT — short, compact addresses for events.
 *
 *   s<key36><code>[-<selector>]
 *
 * `key36` is the author's public key written in base 36, always exactly 50
 * characters; `code` is the first 6 hex characters of SHA-256 over a canonical
 * input; the optional `-selector` continues that same hash to break a
 * collision. Fixed widths are what let an address be parsed by position.
 *
 * The code lives in the event as a single-letter `["s", code]` tag, so it is
 * relay-indexed and signed: there is no side mapping to publish or keep alive.
 * The canonical input deliberately excludes tags, which is what lets the code
 * be one of them and keeps it independent of proof-of-work nonces.
 */
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import { verifyEvent, type Event as NostrEvent } from 'nostr-tools'
import { KINDS } from '@/lib/constants'
import { fetchEvents } from '@/lib/nostr/relay-pool'

export const SHORT_CODE_LENGTH = 6
export const KEY36_LENGTH = 50
/** Marker + key36 + code, with no selector. */
export const SHORT_ADDRESS_LENGTH = 1 + KEY36_LENGTH + SHORT_CODE_LENGTH

const CODE_RE = /^[0-9a-f]{6}$/
/** The whole shape: marker, 50 base-36 digits, 6 hex, optional `-hex` selector. */
const ADDRESS_RE = /^s([0-9a-z]{50})([0-9a-f]{6})(?:-([0-9a-f]+))?$/
const PUBKEY_LIMIT = 1n << 256n

// ─── Author key encoding ────────────────────────────────────────────

/** 64-char hex pubkey → 50-char lowercase base-36 key. */
export function toKey36(pubkeyHex: string): string {
  return BigInt('0x' + pubkeyHex).toString(36).padStart(KEY36_LENGTH, '0')
}

/** 50-char base-36 key → 64-char lowercase hex pubkey, or null when it encodes no pubkey (2^256 or more). */
export function fromKey36(key36: string): string | null {
  const k = key36.toLowerCase()
  if (!/^[0-9a-z]{50}$/.test(k)) return null
  let n = 0n
  for (const c of k) n = n * 36n + BigInt(parseInt(c, 36))
  if (n >= PUBKEY_LIMIT) return null
  return n.toString(16).padStart(64, '0')
}

// ─── Derivation ─────────────────────────────────────────────────────

/** The identity-determining fields a code is derived from. Never tags. */
export interface CodeSource {
  kind: number
  pubkey: string
  created_at: number
  content: string
  tags: string[][]
}

/**
 * Replaceable and addressable kinds derive from their coordinate rather than
 * their content, so the code survives every edit.
 */
export function isCoordinateKind(kind: number): boolean {
  return kind === 0 || kind === 3 || (kind >= 10000 && kind < 20000) || (kind >= 30000 && kind < 40000)
}

/** Ephemeral kinds are never stored, so a short address for one can never resolve. */
export function isEphemeralKind(kind: number): boolean {
  return kind >= 20000 && kind < 30000
}

export function canonicalInput(source: CodeSource): string {
  if (isCoordinateKind(source.kind)) {
    // The trailing colon on a replaceable event is the empty `d` slot of the
    // standard coordinate string; it is not stripped.
    const d = source.tags.find((t) => t[0] === 'd')?.[1] ?? ''
    return `a:${source.kind}:${source.pubkey}:${d}`
  }
  return `e:${source.kind}:${source.pubkey}:${source.created_at}:${source.content}`
}

/** Full digest: the code is its head, collision selectors continue from there. */
export function computeFullHash(source: CodeSource): string {
  return bytesToHex(sha256(new TextEncoder().encode(canonicalInput(source))))
}

export function computeShortCode(source: CodeSource): string {
  return computeFullHash(source).slice(0, SHORT_CODE_LENGTH)
}

/** The `s` tag an event carries, if any. */
export function shortCodeOf(event: NostrEvent): string | null {
  const v = event.tags.find((t) => t[0] === 's')?.[1]
  return v && CODE_RE.test(v) ? v : null
}

/** Kinds this client stamps with a short code when publishing. */
export const SHORT_KINDS: ReadonlySet<number> = new Set<number>([
  KINDS.SHORT_NOTE,
  KINDS.PS_DRAFT,
  KINDS.PS_RELEASE,
  KINDS.COMMENT,
])

// ─── Addresses ──────────────────────────────────────────────────────

export interface ShortAddress {
  /** 64-char hex, decoded from the key36. */
  pubkey: string
  key36: string
  code: string
  /** '' when absent. */
  suffix: string
}

export function formatShortAddress(pubkeyHex: string, code: string, suffix = ''): string {
  return `s${toKey36(pubkeyHex)}${code}${suffix ? `-${suffix}` : ''}`
}

/**
 * Parse `s<key36><code>[-selector]`. Uppercase is accepted and lowercased; a
 * `nostr:` prefix is tolerated. Null unless the shape is exact and the key36
 * decodes to a pubkey.
 */
export function parseShortAddress(input: string): ShortAddress | null {
  const raw = input.trim().replace(/^nostr:/i, '').toLowerCase()
  const m = ADDRESS_RE.exec(raw)
  if (!m) return null
  const pubkey = fromKey36(m[1])
  if (!pubkey) return null
  return { pubkey, key36: m[1], code: m[2], suffix: m[3] ?? '' }
}

/** Is this a NIP-SHORT address, as opposed to an npub, naddr, nevent, or anything else? */
export function looksLikeShortAddress(input: string): boolean {
  return parseShortAddress(input) !== null
}

// ─── Sharing ────────────────────────────────────────────────────────

/**
 * The short address derivable with no network at all.
 *
 * The code is a signed field of the event, so it can be checked against what
 * the event's own contents hash to, a purely local test. Only *uniqueness*
 * needs relays, and a collision is rare enough that it is better to show the
 * short address at once and append a selector in the unlikely case one is
 * needed than to sit on a round trip every time.
 *
 * Null when the event carries no code, carries one that does not verify, or is
 * of a kind relays never store.
 */
export function verifiedShortAddress(event: NostrEvent): string | null {
  if (isEphemeralKind(event.kind)) return null
  const stored = shortCodeOf(event)
  if (!stored || stored !== computeShortCode(event)) return null
  return formatShortAddress(event.pubkey, stored)
}

/**
 * The address to share for an event, adding a collision selector only when the
 * author actually has another event on the same code.
 *
 * The stored tag never changes; disambiguation lives in the address alone, by
 * reading further along the same hash.
 */
export async function shareableShortAddress(relays: string[], event: NostrEvent): Promise<string | null> {
  const base = verifiedShortAddress(event)
  if (!base) return null
  const code = shortCodeOf(event)!

  let others: NostrEvent[] = []
  try {
    others = await fetchEvents(relays, { authors: [event.pubkey], '#s': [code] }, 2000)
  } catch {
    // Cannot check: share the base address rather than nothing. A collision
    // would show a disambiguation prompt on resolve, not a wrong event.
    return base
  }

  const rivals = others.filter((e) => !sameEvent(e, event) && verifyShortCode(e))
  if (rivals.length === 0) return base
  return formatShortAddress(event.pubkey, code, selectorFor(event, rivals))
}

/** Same event, where a coordinate kind's revisions count as one. */
function sameEvent(a: NostrEvent, b: NostrEvent): boolean {
  if (a.id === b.id) return true
  return isCoordinateKind(a.kind) && isCoordinateKind(b.kind) && canonicalInput(a) === canonicalInput(b)
}

/**
 * The selector that distinguishes one candidate from the others: the next hex
 * characters of its hash, appended to an ambiguous address to make it exact.
 */
export function selectorFor(chosen: NostrEvent, others: NostrEvent[]): string {
  const mine = computeFullHash(chosen)
  const theirs = others.filter((e) => !sameEvent(e, chosen)).map(computeFullHash)
  for (let n = SHORT_CODE_LENGTH + 1; n <= mine.length; n++) {
    const prefix = mine.slice(0, n)
    if (theirs.every((h) => !h.startsWith(prefix))) return mine.slice(SHORT_CODE_LENGTH, n)
  }
  return ''
}

// ─── Resolution ─────────────────────────────────────────────────────

/** An event's `s` tag must match what its own fields hash to, and it must verify. */
export function verifyShortCode(event: NostrEvent): boolean {
  const claimed = shortCodeOf(event)
  if (!claimed || claimed !== computeShortCode(event)) return false
  try { return verifyEvent(event) } catch { return false }
}

export type ShortResolution =
  | { status: 'resolved'; event: NostrEvent }
  | { status: 'ambiguous'; candidates: NostrEvent[] }
  | { status: 'not-found' }
  | { status: 'bad-address' }

/** The resolver's stages, for a step-by-step indicator. */
export type ShortStep = 'parsing' | 'querying' | 'verifying' | 'rendering'

/**
 * Resolve a short address to its event.
 *
 * Verification is not optional: the `s` tag is self-asserted, so every
 * candidate is re-hashed from its own fields and signature-checked before it
 * counts. Without that, anyone could tag an event with someone else's code.
 */
export async function resolveShortAddress(
  relays: string[],
  address: string,
  onStep?: (step: ShortStep) => void,
): Promise<ShortResolution> {
  onStep?.('parsing')
  const parsed = parseShortAddress(address)
  if (!parsed) return { status: 'bad-address' }

  const filter = { authors: [parsed.pubkey], '#s': [parsed.code] }

  // Queried in small groups rather than all relays at once. One pooled
  // subscription across every relay resolves as soon as all of them have
  // EOSE'd, and a relay that closes or never connects counts as having
  // answered; typically a single relay holds the event, so one relay's failure
  // must not speak for the rest. The search stops at the first verified hit.
  onStep?.('querying')
  const GROUP = 3
  let verified: NostrEvent[] = []
  for (let round = 0; round < 2 && verified.length === 0; round++) {
    for (let i = 0; i < relays.length; i += GROUP) {
      try {
        const events = await fetchEvents(relays.slice(i, i + GROUP), filter, 4000)
        onStep?.('verifying')
        const hits = events.filter(verifyShortCode)
        if (hits.length > 0) { verified = hits; break }
        onStep?.('querying')
      } catch {
        // try the next group
      }
    }
  }
  if (verified.length === 0) return { status: 'not-found' }
  onStep?.('verifying')

  if (parsed.suffix) {
    const want = parsed.code + parsed.suffix
    const matches = verified.filter((e) => computeFullHash(e).startsWith(want))
    if (matches.length === 1) return { status: 'resolved', event: matches[0] }
    if (matches.length === 0) return { status: 'not-found' }
    return { status: 'ambiguous', candidates: newestPerCoordinate(matches) }
  }

  const candidates = newestPerCoordinate(verified)
  if (candidates.length === 1) return { status: 'resolved', event: candidates[0] }
  return { status: 'ambiguous', candidates }
}

/**
 * A replaceable or addressable coordinate legitimately returns several
 * revisions of one event. That is history, not ambiguity: keep the newest.
 */
function newestPerCoordinate(events: NostrEvent[]): NostrEvent[] {
  const byKey = new Map<string, NostrEvent>()
  for (const e of events) {
    const key = isCoordinateKind(e.kind) ? canonicalInput(e) : e.id
    const cur = byKey.get(key)
    if (!cur || e.created_at > cur.created_at) byKey.set(key, e)
  }
  return [...byKey.values()]
}
