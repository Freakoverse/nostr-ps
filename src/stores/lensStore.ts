import { shortNpub } from '@/lib/utils'
/**
 * The trust lens (docs/CLIENT-LENS.md).
 *
 * A lens is an ordered list of sources. Each yields a 0-100 score for a pubkey
 * or "unknown". Two source types:
 *
 *   nip85  a NIP-85 trusted-assertion provider: kind 30382 events signed by a
 *          service key, `d` = subject pubkey, `rank` = 0-100. One key per
 *          perspective, so adding a provider adopts that observer's view.
 *   graph  a pubkey whose follow list (kind 3) is the trusted set: direct
 *          follow = 100, follow-of-follow = 50, muted (kind 10000) = 0, else
 *          unknown. Computed locally.
 *
 * Combination is max across enabled sources with a known score; all-unknown
 * stays unknown (never zero). Nothing is ever hidden by the lens: callers
 * bucket into above / below / unknown and collapse the latter two.
 *
 * The lens is a setting, not a role: the active sources are always shown and
 * can be changed by anyone, logged in or not.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { nip19, type Event as NostrEvent } from 'nostr-tools'
import { fetchEvents } from '@/lib/nostr/relay-pool'
import { useSettingsStore } from '@/stores/settingsStore'
import { useAuthStore } from '@/stores/authStore'
import { ADMIN_PUBKEY, HAS_OPERATOR, KINDS } from '@/lib/constants'

export type LensSourceType = 'nip85' | 'graph'

export interface LensSource {
  id: string
  type: LensSourceType
  pubkey: string
  label: string
  enabled: boolean
  /** Built-in rows the user can toggle but not remove. */
  builtin?: boolean
  /** NIP-85 providers usually serve assertions from their own relay (e.g. a Brainstorm instance); queried in addition to the read relays. */
  relays?: string[]
}

export type Bucket = 'above' | 'below' | 'unknown' | 'off'

export interface PubkeyScore {
  combined: number | null
  /** Per source id. `null` = that source has no opinion. */
  per: Record<string, number | null>
  fetchedAt: number
}

/** The logged-in user's own graph. Added and removed automatically. */
export const OWN_SOURCE_ID = 'own'
/** The operator's graph: the anonymous default viewpoint. */
export const OPERATOR_SOURCE_ID = 'operator'
/**
 * Default threshold. NIP-85 ranks are compressed toward zero (GrapeRank's own
 * "valid user" cutoff is rank 2: one strong vouch or a few ordinary ones from
 * inside the observer's graph). Sybils sit at 0 or unknown; bad actors with a
 * few follows are driven to 0 by trusted mutes, so the threshold is a "how much
 * vouching" dial, not the anti-malice tool. Graph sources score a direct follow
 * 100, a follow of a follow 50, a muted pubkey 0, so 2 behaves the same there.
 */
export const DEFAULT_THRESHOLD = 2

const SCORE_TTL = 10 * 60 * 1000
const GRAPH_TTL = 30 * 60 * 1000
const MAX_F2_FETCH = 300 // cap second-hop contact lists per graph source

interface GraphData {
  f1: Set<string>
  f2: Set<string>
  muted: Set<string>
  builtAt: number
  depth: 1 | 2
}

interface LensState {
  sources: LensSource[]
  /** Master switch. Off = raw view, every claim counts. */
  enabled: boolean
  threshold: number // 0..100
  graphDepth: 1 | 2
  scores: Record<string, PubkeyScore>
  graphs: Record<string, GraphData> // keyed by viewpoint pubkey (not persisted)
  busy: number

  setEnabled: (v: boolean) => void
  setThreshold: (v: number) => void
  setGraphDepth: (v: 1 | 2) => void
  addSource: (s: Omit<LensSource, 'id' | 'enabled'> & { enabled?: boolean }) => string
  removeSource: (id: string) => void
  toggleSource: (id: string, enabled?: boolean) => void
  setSourceType: (id: string, type: LensSourceType) => void
  /** Keep the "own graph" row in sync with login state. */
  syncOwnSource: (pubkey: string | null) => void

  /** Resolve scores for these pubkeys across enabled sources (cached). */
  ensureScores: (pubkeys: string[]) => Promise<void>
  scoreOf: (pubkey: string) => PubkeyScore | null
  bucketOf: (pubkey: string) => Bucket
  /** Drop cached scores/graphs so the next ensureScores refetches. */
  invalidate: () => void
}

function labelFor(pubkey: string): string {
  try { return shortNpub(nip19.npubEncode(pubkey)) } catch { return `${pubkey.slice(0, 8)}…${pubkey.slice(-4)}` }
}

/**
 * Built-in NIP-85 providers. Brainstorm has no single key: every account gets
 * a "Brainstorm Assistant" that publishes kind 30382 from that account's
 * vantage point, so each entry here is somebody's Brainstorm. More can be
 * added as more instances appear; the lens combines them by maximum.
 */
export const BUILTIN_PROVIDERS: LensSource[] = [
  {
    id: 'brainstorm-nosfabrica',
    type: 'nip85',
    // npub10rkssdlt5zazgsuyr9wwg8f2y9t4ga4gax0y8updd6tjnpsw98nqm9l467, "nosfabrica's Brainstorm Assistant"
    pubkey: '78ed0837eba0ba244384195ce41d2a21575476a8e99e43f02d6e9729860e29e6',
    label: 'Brainstorm (nosfabrica)',
    relays: ['wss://nip85.brainstorm.world'],
    enabled: true,
    builtin: true,
  },
]

// The operator graph only when the deployment names an operator (constants.ts).
const DEFAULT_SOURCES: LensSource[] = [
  ...(HAS_OPERATOR ? [{ id: OPERATOR_SOURCE_ID, type: 'graph' as const, pubkey: ADMIN_PUBKEY, label: 'Operator graph', enabled: true, builtin: true }] : []),
  ...BUILTIN_PROVIDERS,
]

function enabledSources(s: LensState): LensSource[] {
  return s.sources.filter((x) => x.enabled)
}

function combine(per: Record<string, number | null>): number | null {
  let best: number | null = null
  for (const v of Object.values(per)) if (v !== null && (best === null || v > best)) best = v
  return best
}

export const useLensStore = create<LensState>()(
  persist(
    (set, get) => ({
      sources: DEFAULT_SOURCES,
      enabled: true,
      threshold: DEFAULT_THRESHOLD,
      graphDepth: 2,
      scores: {},
      graphs: {},
      busy: 0,

      setEnabled: (v) => set({ enabled: v }),
      setThreshold: (v) => set({ threshold: Math.max(0, Math.min(100, Math.round(v))) }),
      setGraphDepth: (v) => { set({ graphDepth: v }); get().invalidate() },

      addSource: (s) => {
        const id = `${s.type}:${s.pubkey}`
        if (get().sources.some((x) => x.id === id)) return id
        set({ sources: [...get().sources, { id, enabled: s.enabled ?? true, ...s, label: s.label || labelFor(s.pubkey) }] })
        get().invalidate()
        return id
      },
      removeSource: (id) => {
        const src = get().sources.find((x) => x.id === id)
        if (!src || src.builtin) return
        set({ sources: get().sources.filter((x) => x.id !== id) })
        get().invalidate()
      },
      toggleSource: (id, enabled) => {
        set({ sources: get().sources.map((x) => (x.id === id ? { ...x, enabled: enabled ?? !x.enabled } : x)) })
        get().invalidate()
      },
      setSourceType: (id, type) => {
        set({ sources: get().sources.map((x) => (x.id === id ? { ...x, type } : x)) })
        get().invalidate()
      },

      syncOwnSource: (pubkey) => {
        const without = get().sources.filter((x) => x.id !== OWN_SOURCE_ID)
        if (!pubkey) {
          if (without.length !== get().sources.length) { set({ sources: without }); get().invalidate() }
          return
        }
        const existing = get().sources.find((x) => x.id === OWN_SOURCE_ID)
        if (existing?.pubkey === pubkey) return
        // Own graph goes first so it reads as "you", then the operator default.
        set({ sources: [{ id: OWN_SOURCE_ID, type: 'graph', pubkey, label: 'My graph', enabled: existing?.enabled ?? true, builtin: true }, ...without] })
        get().invalidate()
      },

      invalidate: () => set({ scores: {}, graphs: {} }),

      scoreOf: (pubkey) => get().scores[pubkey] ?? null,

      bucketOf: (pubkey) => {
        const s = get()
        if (!s.enabled || enabledSources(s).length === 0) return 'off'
        const sc = s.scores[pubkey]
        if (!sc || sc.combined === null) return 'unknown'
        return sc.combined >= s.threshold ? 'above' : 'below'
      },

      ensureScores: async (pubkeys) => {
        const s = get()
        const sources = enabledSources(s)
        if (!s.enabled || sources.length === 0) return
        const nowMs = Date.now()
        const sourceKey = sources.map((x) => x.id).join('|')
        const need = [...new Set(pubkeys)].filter((pk) => {
          const sc = s.scores[pk]
          return !sc || nowMs - sc.fetchedAt > SCORE_TTL || Object.keys(sc.per).join('|') !== sourceKey
        })
        if (need.length === 0) return

        set({ busy: get().busy + 1 })
        try {
          const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')
          const perSource = await Promise.all(sources.map((src) =>
            src.type === 'nip85'
              ? scoreViaNip85([...new Set([...relays, ...(src.relays ?? [])])], src.pubkey, need)
              : scoreViaGraph(relays, src.pubkey, need, get, set),
          ))
          const next: Record<string, PubkeyScore> = { ...get().scores }
          for (const pk of need) {
            const per: Record<string, number | null> = {}
            sources.forEach((src, i) => { per[src.id] = perSource[i].get(pk) ?? null })
            next[pk] = { combined: combine(per), per, fetchedAt: nowMs }
          }
          set({ scores: next })
        } finally {
          set({ busy: Math.max(0, get().busy - 1) })
        }
      },
    }),
    {
      name: 'nip-ps:lens',
      version: 3,
      // Scores persist too, so a cache-painted list is scored at once; anything
      // past SCORE_TTL is re-fetched on demand and a source change clears them.
      partialize: (s) => ({ sources: s.sources, enabled: s.enabled, threshold: s.threshold, graphDepth: s.graphDepth, scores: s.scores }),
      // v0 shipped with a default threshold of 50, far too strict for NIP-85
      // ranks. Anyone still on that exact value gets the new default; a value
      // they chose themselves is left alone.
      // v2: the operator key became optional and may have changed; an operator
      // row persisted from an earlier build must not keep scoring through a key
      // this deployment no longer names.
      migrate: (persisted, version) => {
        const s = (persisted ?? {}) as Partial<LensState>
        if (version < 1 && s.threshold === 50) s.threshold = DEFAULT_THRESHOLD
        if (version < 2 && Array.isArray(s.sources)) {
          s.sources = s.sources.filter((x) => x.id !== OPERATOR_SOURCE_ID || (HAS_OPERATOR && x.pubkey === ADMIN_PUBKEY))
          if (HAS_OPERATOR && !s.sources.some((x) => x.id === OPERATOR_SOURCE_ID)) s.sources = [...s.sources, ...DEFAULT_SOURCES]
          s.scores = {}
        }
        // v3: built-in providers (Brainstorm) join existing stores without disturbing user rows.
        if (version < 3 && Array.isArray(s.sources)) {
          for (const p of BUILTIN_PROVIDERS) if (!s.sources.some((x) => x.id === p.id)) s.sources = [...s.sources, p]
          s.scores = {}
        }
        return s as LensState
      },
    },
  ),
)

// ─── Source implementations ─────────────────────────────────────────

/** NIP-85: one 30382 per subject, signed by the provider key. */
async function scoreViaNip85(relays: string[], serviceKey: string, pubkeys: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const CHUNK = 100
  for (let i = 0; i < pubkeys.length; i += CHUNK) {
    const batch = pubkeys.slice(i, i + CHUNK)
    let evs: NostrEvent[] = []
    try {
      evs = await fetchEvents(relays, { kinds: [KINDS.TRUSTED_ASSERTION], authors: [serviceKey], '#d': batch, limit: batch.length }, 8000)
    } catch { /* unknown for this batch */ }
    const newest = new Map<string, NostrEvent>()
    for (const ev of evs) {
      const d = ev.tags.find((t) => t[0] === 'd')?.[1]
      if (!d) continue
      const cur = newest.get(d)
      if (!cur || ev.created_at > cur.created_at) newest.set(d, ev)
    }
    for (const [d, ev] of newest) {
      const rank = Number(ev.tags.find((t) => t[0] === 'rank')?.[1])
      if (!Number.isFinite(rank)) continue
      // A rank of 0 with no `hops` tag means the subject was unreachable from the
      // observer's graph: that is "unknown", not "scored zero". With a hops tag,
      // zero means the graph reached them and did not vouch (or muted them).
      const hops = ev.tags.find((t) => t[0] === 'hops')?.[1]
      if (rank <= 0 && hops === undefined) continue
      out.set(d, Math.max(0, Math.min(100, Math.round(rank))))
    }
  }
  return out
}

/** Graph viewpoint: distance from `viewpoint`'s follows, mutes as zero. */
async function scoreViaGraph(
  relays: string[],
  viewpoint: string,
  pubkeys: string[],
  get: () => LensState,
  set: (p: Partial<LensState>) => void,
): Promise<Map<string, number>> {
  const graph = await ensureGraph(relays, viewpoint, get, set)
  const out = new Map<string, number>()
  for (const pk of pubkeys) {
    if (graph.muted.has(pk)) { out.set(pk, 0); continue }
    if (pk === viewpoint || graph.f1.has(pk)) { out.set(pk, 100); continue }
    if (graph.f2.has(pk)) { out.set(pk, 50); continue }
  }
  return out
}

async function ensureGraph(relays: string[], viewpoint: string, get: () => LensState, set: (p: Partial<LensState>) => void): Promise<GraphData> {
  const depth = get().graphDepth
  const cached = get().graphs[viewpoint]
  if (cached && cached.depth === depth && Date.now() - cached.builtAt < GRAPH_TTL) return cached

  const f1 = new Set<string>()
  const muted = new Set<string>()
  const f2 = new Set<string>()
  try {
    const [contacts, mutes] = await Promise.all([
      fetchEvents(relays, { kinds: [KINDS.CONTACTS], authors: [viewpoint], limit: 1 }, 8000),
      fetchEvents(relays, { kinds: [KINDS.MUTE_LIST], authors: [viewpoint], limit: 1 }, 8000),
    ])
    const newest = (evs: NostrEvent[]) => evs.sort((a, b) => b.created_at - a.created_at)[0]
    const c = newest(contacts)
    for (const t of c?.tags ?? []) if (t[0] === 'p' && t[1]) f1.add(t[1])
    const m = newest(mutes)
    for (const t of m?.tags ?? []) if (t[0] === 'p' && t[1]) muted.add(t[1])

    if (depth === 2 && f1.size > 0) {
      const authors = [...f1].slice(0, MAX_F2_FETCH)
      const CHUNK = 50
      const batches: Promise<NostrEvent[]>[] = []
      for (let i = 0; i < authors.length; i += CHUNK) {
        batches.push(fetchEvents(relays, { kinds: [KINDS.CONTACTS], authors: authors.slice(i, i + CHUNK), limit: CHUNK }, 8000).catch(() => []))
      }
      const latestBy = new Map<string, NostrEvent>()
      for (const ev of (await Promise.all(batches)).flat()) {
        const cur = latestBy.get(ev.pubkey)
        if (!cur || ev.created_at > cur.created_at) latestBy.set(ev.pubkey, ev)
      }
      for (const ev of latestBy.values()) for (const t of ev.tags) if (t[0] === 'p' && t[1] && !f1.has(t[1])) f2.add(t[1])
    }
  } catch {
    // partial graph is still a graph; unknowns stay unknown
  }
  const data: GraphData = { f1, f2, muted, builtAt: Date.now(), depth }
  set({ graphs: { ...get().graphs, [viewpoint]: data } })
  return data
}

// ─── Convenience ────────────────────────────────────────────────────

/** Bucket a list by author, preserving order within each bucket. */
export function bucketize<T extends { pubkey: string }>(items: T[], bucketOf: (pk: string) => Bucket) {
  const above: T[] = []
  const below: T[] = []
  const unknown: T[] = []
  let off = false
  for (const it of items) {
    const b = bucketOf(it.pubkey)
    if (b === 'off') { off = true; above.push(it); continue }
    if (b === 'above') above.push(it)
    else if (b === 'below') below.push(it)
    else unknown.push(it)
  }
  return { above, below, unknown, off }
}

// Badges mount by the dozen; coalesce their requests into one fetch per tick.
let pendingScores = new Set<string>()
let pendingTimer: ReturnType<typeof setTimeout> | null = null
let inFlight: Promise<void> | null = null

export function requestScores(pubkeys: string[]): Promise<void> {
  for (const pk of pubkeys) pendingScores.add(pk)
  if (!pendingTimer) {
    inFlight = new Promise<void>((resolve) => {
      pendingTimer = setTimeout(async () => {
        const batch = [...pendingScores]
        pendingScores = new Set()
        pendingTimer = null
        try { await useLensStore.getState().ensureScores(batch) } finally { resolve() }
      }, 60)
    })
  }
  return inFlight ?? Promise.resolve()
}

/** Wire the own-graph row to login state. Call once from App. */
export function bindLensToAuth(): () => void {
  const sync = () => useLensStore.getState().syncOwnSource(useAuthStore.getState().pubkey)
  sync()
  return useAuthStore.subscribe(sync)
}
