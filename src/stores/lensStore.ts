import { shortNpub } from '@/lib/utils'
/**
 * The trust lens (docs/CLIENT-LENS.md).
 *
 * A lens is a list of NIP-85 providers. Each is a key that publishes kind
 * 30382 trusted assertions (`d` = subject pubkey, `rank` = 0-100) computed
 * from some observer's vantage point, usually a Brainstorm instance. The
 * client only reads assertions; it never walks follow graphs itself, so the
 * cost of computing trust sits with the provider, not every visitor.
 *
 * Combination is max across enabled providers with a known score; all-unknown
 * stays unknown (never zero). Nothing is ever hidden by the lens: callers
 * bucket into above / below / unknown and collapse the latter two.
 *
 * A logged-in user's own provider comes from their kind 10040 (NIP-85): the
 * event they sign to say "my ranks come from this key, at this relay". The
 * client reads it and adds that provider as "Your provider"; it never writes
 * a 10040 for anyone.
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
import { KINDS } from '@/lib/constants'

export interface LensSource {
  id: string
  /** The provider key that signs the kind 30382 assertions. */
  pubkey: string
  label: string
  enabled: boolean
  /** Built-in rows the user can toggle but not remove. */
  builtin?: boolean
  /** Providers usually serve assertions from their own relay (e.g. a Brainstorm instance); queried in addition to the read relays. */
  relays?: string[]
  /** The logged-in user's own provider, from their kind 10040. */
  own?: boolean
}

export type Bucket = 'above' | 'below' | 'unknown' | 'off'

export interface PubkeyScore {
  combined: number | null
  /** Per source id. `null` = that source has no opinion. */
  per: Record<string, number | null>
  fetchedAt: number
}

/** Status of the logged-in user's own provider lookup (kind 10040). */
export interface ProviderEntry {
  provider: string
  relay?: string
}

export type OwnProviderStatus =
  | { state: 'anonymous' }
  | { state: 'checking'; user: string }
  /** `event` is the raw kind 10040, kept so an edit can merge into it rather than overwrite other entries. */
  | { state: 'found'; user: string; providers: ProviderEntry[]; event: NostrEvent }
  | { state: 'missing'; user: string; event: NostrEvent | null }

/** Prefix of the logged-in user's own provider rows (`own:<provider pubkey>`). Added and removed automatically. */
export const OWN_SOURCE_ID = 'own'
export const isOwnSourceId = (id: string) => id === OWN_SOURCE_ID || id.startsWith(`${OWN_SOURCE_ID}:`)
/**
 * Default threshold. Ranks are normalised 0-100 by the provider. GrapeRank's
 * own "valid user" cutoff is around 2, and unknown or muted keys sit at 0 or
 * carry no assertion at all, so 2 means "vouched for at all": the anti-spam
 * floor. Raise it to demand more than a toehold in the provider's graph.
 */
export const DEFAULT_THRESHOLD = 2
/**
 * Default confirmation threshold (spec §6.3): the rank-weighted sum of
 * distinct "accurate" verdicts a claim needs. Weights are rank/100, so 0.5 means
 * one reviewer ranked 50 or better, or two ranked 25.
 */
export const DEFAULT_CONFIRM_THRESHOLD = 0.5

const SCORE_TTL = 10 * 60 * 1000

interface LensState {
  sources: LensSource[]
  /** Master switch. Off = raw view, every claim counts. */
  enabled: boolean
  threshold: number // 0..100
  /** §6.3 claim confirmation: weighted "accurate" sum needed, 0.1..3. */
  confirmThreshold: number
  scores: Record<string, PubkeyScore>
  busy: number
  ownProvider: OwnProviderStatus

  setEnabled: (v: boolean) => void
  setThreshold: (v: number) => void
  setConfirmThreshold: (v: number) => void
  addSource: (s: Omit<LensSource, 'id' | 'enabled' | 'own'> & { enabled?: boolean }) => string
  removeSource: (id: string) => void
  toggleSource: (id: string, enabled?: boolean) => void
  /** Read the logged-in user's kind 10040 and keep the "Your provider" row in sync. */
  syncOwnProvider: (pubkey: string | null) => Promise<void>

  /** Resolve scores for these pubkeys across enabled sources (cached). */
  ensureScores: (pubkeys: string[]) => Promise<void>
  scoreOf: (pubkey: string) => PubkeyScore | null
  bucketOf: (pubkey: string) => Bucket
  /** Drop cached scores so the next ensureScores refetches. */
  invalidate: () => void
}

function labelFor(pubkey: string): string {
  try { return shortNpub(nip19.npubEncode(pubkey)) } catch { return `${pubkey.slice(0, 8)}…${pubkey.slice(-4)}` }
}

/**
 * Built-in providers. Brainstorm has no single key: every account gets a
 * "Brainstorm Assistant" that publishes kind 30382 from that account's
 * vantage point, so each entry here is somebody's Brainstorm. More are added
 * as more instances appear; the lens combines them by maximum.
 */
export const BUILTIN_PROVIDERS: LensSource[] = [
  {
    id: 'brainstorm-nosfabrica',
    // npub10rkssdlt5zazgsuyr9wwg8f2y9t4ga4gax0y8updd6tjnpsw98nqm9l467, "nosfabrica's Brainstorm Assistant"
    pubkey: '78ed0837eba0ba244384195ce41d2a21575476a8e99e43f02d6e9729860e29e6',
    label: 'Brainstorm (nosfabrica)',
    relays: ['wss://nip85.brainstorm.world'],
    enabled: true,
    builtin: true,
  },
]

const DEFAULT_SOURCES: LensSource[] = [...BUILTIN_PROVIDERS]

function enabledSources(s: LensState): LensSource[] {
  return s.sources.filter((x) => x.enabled)
}

function combine(per: Record<string, number | null>): number | null {
  let best: number | null = null
  for (const v of Object.values(per)) if (v !== null && (best === null || v > best)) best = v
  return best
}

/**
 * Every `30382:rank` entry of a kind 10040 (NIP-85 allows several providers
 * for one result type; its own example lists two). Falls back to any
 * `30382:*` entry when no rank entry exists. Deduplicated by provider key.
 */
export function providersFrom10040(ev: NostrEvent): ProviderEntry[] {
  const valid = ev.tags.filter((t) => typeof t[0] === 'string' && t[0].startsWith('30382') && /^[0-9a-f]{64}$/i.test(t[1] ?? ''))
  const ranks = valid.filter((t) => t[0] === '30382:rank')
  const picked = ranks.length ? ranks : valid.slice(0, 1)
  const out = new Map<string, ProviderEntry>()
  for (const t of picked) {
    const pk = t[1].toLowerCase()
    if (!out.has(pk)) out.set(pk, { provider: pk, relay: t[2] && /^wss?:\/\//.test(t[2]) ? t[2] : undefined })
  }
  return [...out.values()]
}

export const useLensStore = create<LensState>()(
  persist(
    (set, get) => ({
      sources: DEFAULT_SOURCES,
      enabled: true,
      threshold: DEFAULT_THRESHOLD,
      confirmThreshold: DEFAULT_CONFIRM_THRESHOLD,
      scores: {},
      busy: 0,
      ownProvider: { state: 'anonymous' },

      setEnabled: (v) => set({ enabled: v }),
      setThreshold: (v) => set({ threshold: Math.max(0, Math.min(100, Math.round(v))) }),
      setConfirmThreshold: (v) => set({ confirmThreshold: Math.max(0.1, Math.min(3, Math.round(v * 10) / 10)) }),

      addSource: (s) => {
        const id = `nip85:${s.pubkey}`
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

      syncOwnProvider: async (pubkey) => {
        const without = () => get().sources.filter((x) => !isOwnSourceId(x.id))
        if (!pubkey) {
          if (without().length !== get().sources.length) { set({ sources: without() }); get().invalidate() }
          set({ ownProvider: { state: 'anonymous' } })
          return
        }
        const cur = get().ownProvider
        if (cur.state !== 'anonymous' && cur.user === pubkey && cur.state !== 'checking') return
        set({ ownProvider: { state: 'checking', user: pubkey } })
        let event: NostrEvent | null = null
        let entries: ProviderEntry[] = []
        try {
          const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')
          const evs = await fetchEvents(relays, { kinds: [KINDS.TRUSTED_PROVIDERS], authors: [pubkey], limit: 3 }, 8000)
          event = evs.sort((a, b) => b.created_at - a.created_at)[0] ?? null
          if (event) entries = providersFrom10040(event)
        } catch { /* treated as missing; the user can retry from settings */ }
        // Login may have changed while we were fetching.
        if (useAuthStore.getState().pubkey !== pubkey) return
        if (event && entries.length) {
          const prev = get().sources
          const rows: LensSource[] = entries.map((e) => {
            const id = `${OWN_SOURCE_ID}:${e.provider}`
            const existing = prev.find((x) => x.id === id)
            return {
              id,
              pubkey: e.provider,
              label: entries.length > 1 ? `Your provider (${e.relay ? e.relay.replace(/^wss?:\/\//, '') : shortNpub(nip19.npubEncode(e.provider))})` : 'Your provider',
              relays: e.relay ? [e.relay] : undefined,
              enabled: existing?.enabled ?? true,
              builtin: true,
              own: true,
            }
          })
          // Own providers first so they read as "you", then the built-in defaults.
          set({ sources: [...rows, ...without()], ownProvider: { state: 'found', user: pubkey, providers: entries, event } })
        } else {
          set({ sources: without(), ownProvider: { state: 'missing', user: pubkey, event } })
        }
        get().invalidate()
      },

      invalidate: () => set({ scores: {} }),

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
            scoreViaNip85([...new Set([...relays, ...(src.relays ?? [])])], src.pubkey, need),
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
      version: 5,
      // Scores persist too, so a cache-painted list is scored at once; anything
      // past SCORE_TTL is re-fetched on demand and a source change clears them.
      partialize: (s) => ({ sources: s.sources, enabled: s.enabled, threshold: s.threshold, confirmThreshold: s.confirmThreshold, scores: s.scores }),
      migrate: (persisted, version) => {
        const s = (persisted ?? {}) as Partial<LensState> & { sources?: (LensSource & { type?: string })[]; verifyThreshold?: number }
        // v5 renamed the verification threshold to the confirmation threshold.
        if (version < 5 && typeof s.verifyThreshold === 'number' && s.confirmThreshold === undefined) s.confirmThreshold = s.verifyThreshold
        // v0 shipped with a default threshold of 50, far too strict for ranks.
        if (version < 1 && s.threshold === 50) s.threshold = DEFAULT_THRESHOLD
        if (Array.isArray(s.sources)) {
          // v2/v3: operator rows and the old "graph" source type are gone; the
          // client reads provider assertions only. Keep user-added providers.
          if (version < 4) {
            s.sources = (s.sources as (LensSource & { type?: string })[])
              .filter((x) => x.type !== 'graph' && x.id !== 'operator' && !isOwnSourceId(x.id))
              .map(({ type: _t, ...rest }) => rest)
            for (const p of BUILTIN_PROVIDERS) if (!s.sources.some((x) => x.id === p.id)) s.sources = [...s.sources, p]
            s.scores = {}
          }
        }
        return s as LensState
      },
    },
  ),
)

// ─── Provider implementation ────────────────────────────────────────

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

/** Wire the own-provider row to login state. Call once from App. */
export function bindLensToAuth(): () => void {
  const sync = () => { void useLensStore.getState().syncOwnProvider(useAuthStore.getState().pubkey) }
  sync()
  return useAuthStore.subscribe(sync)
}
