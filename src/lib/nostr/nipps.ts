/**
 * NIP-PS: builders, parsers, fetchers and rollups for the six kinds in
 * docs/NIP-PS.md §4.
 *
 *   30817  draft           addressable, d = uuid
 *   8201   release         regular, immutable, `v` = "<uuid>:<version>"
 *   8202   backup          regular, wraps a signed release
 *   30851  adoption claim  addressable, d = uuid, one per implementer per proposal
 *   30852  review          addressable, d = target id (release id | claim coord)
 *   1111   discussion      NIP-22 comments on a draft (see ./events.ts)
 *
 * Identity rules (§3): a proposal is (author pubkey, uuid); a release is that
 * plus a version, and concretely the release event id. Nothing here resolves
 * conflicts by created_at.
 */

import { nip19, verifyEvent, type Event as NostrEvent, type Filter, type UnsignedEvent } from 'nostr-tools'
import { KINDS, PS_SPEC_ID_TAG, CLIENT_NAME } from '@/lib/constants'
import { fetchEvents, fetchEvent } from './relay-pool'
import { isDeleted } from './events'
import { countLeadingZeroBits } from '@/lib/pow/pow'
import { cacheEvent, getCachedEvent, getCachedEventsOfKind, whenEventCacheReady } from './eventCache'

const now = () => Math.floor(Date.now() / 1000)
const tag = (ev: NostrEvent, name: string) => ev.tags.find((t) => t[0] === name)?.[1]
const tagsOf = (ev: NostrEvent, name: string) => ev.tags.filter((t) => t[0] === name)

// ─── Identity helpers ───────────────────────────────────────────────

export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function specId(uuid: string, version: string): string {
  return `${uuid}:${version}`
}

export function parseSpecId(v: string): { uuid: string; version: string } | null {
  const i = v.lastIndexOf(':')
  if (i <= 0 || i === v.length - 1) return null
  const uuid = v.slice(0, i)
  const version = v.slice(i + 1)
  return isValidVersion(version) ? { uuid, version } : null
}

export const VERSION_RE = /^\d+(\.\d+)*$/

export function isValidVersion(v: string): boolean {
  return VERSION_RE.test(v)
}

/** Numeric, component-wise. Returns <0, 0, >0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  const n = Math.max(pa.length, pb.length)
  for (let i = 0; i < n; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x - y
  }
  return 0
}

/** Next version after `v`: bumps the first component, drops the rest. */
export function nextMajor(v: string | null): string {
  if (!v) return '1'
  const major = Number(v.split('.')[0]) || 0
  return String(major + 1)
}

/** Next minor after `v`: appends or bumps a second component. */
export function nextMinor(v: string | null): string {
  if (!v) return '1'
  const parts = v.split('.').map(Number)
  if (parts.length === 1) return `${parts[0]}.1`
  parts[parts.length - 1] += 1
  return parts.join('.')
}

export function draftCoord(pubkey: string, uuid: string): string {
  return `${KINDS.PS_DRAFT}:${pubkey}:${uuid}`
}

export function claimCoord(pubkey: string, uuid: string): string {
  return `${KINDS.PS_CLAIM}:${pubkey}:${uuid}`
}

export function draftNaddr(pubkey: string, uuid: string, relays?: string[]): string {
  return nip19.naddrEncode({ kind: KINDS.PS_DRAFT, pubkey, identifier: uuid, relays })
}

/** The NIP-89 handler kind a client claim points at. */
export const HANDLER_KIND = 31990
/** The NIP-34 repository announcement kind a library claim points at. */
export const REPO_KIND = 30617

/**
 * Turn what a developer pastes (an `naddr1…`, with or without `nostr:`, or a
 * raw `kind:pubkey:d`) into the `kind:pubkey:d` form the claim tag carries.
 * Returns null when it is neither, or when the kind is not the one expected.
 */
export function parseAddress(input: string, kind: number): string | null {
  const s = input.trim().replace(/^nostr:/i, '')
  if (!s) return null
  const raw = s.match(/^(\d+):([0-9a-f]{64}):(.*)$/i)
  if (raw) return Number(raw[1]) === kind ? `${kind}:${raw[2].toLowerCase()}:${raw[3]}` : null
  try {
    const d = nip19.decode(s)
    if (d.type !== 'naddr' || d.data.kind !== kind) return null
    return `${kind}:${d.data.pubkey}:${d.data.identifier}`
  } catch {
    return null
  }
}

/** `kind:pubkey:d` back to an `naddr1…` for display; the input unchanged if it does not parse. */
export function addressToNaddr(coord: string): string {
  const m = coord.match(/^(\d+):([0-9a-f]{64}):(.*)$/i)
  if (!m) return coord
  try {
    return nip19.naddrEncode({ kind: Number(m[1]), pubkey: m[2].toLowerCase(), identifier: m[3] })
  } catch {
    return coord
  }
}

export function releaseNevent(id: string, author: string, relays?: string[]): string {
  return nip19.neventEncode({ id, author, kind: KINDS.PS_RELEASE, relays })
}

/** `<title> v<version> by <npub…> (<id…>)` per §3. */
/** Event id shortened to both ends, `0000…9f8e`, so it cannot be read as a prefix. */
export function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id
}
/** `<title> v<version> by <npub> (<release event id>)` per §3, in full: it is the copyable reference, so nothing is shortened. */
export function releaseLabel(r: { title: string; version: string; pubkey: string; id: string }): string {
  return `${r.title} v${r.version} by ${nip19.npubEncode(r.pubkey)} (${r.id})`
}

// ─── Types ──────────────────────────────────────────────────────────

export interface KindRef { kind: number; name?: string }

export interface Draft {
  event: NostrEvent
  coord: string
  uuid: string
  pubkey: string
  title: string
  summary?: string
  kinds: KindRef[]
  topics: string[]
  status?: string
  content: string
  /** Logical version counter (NIP-01 replacement order), not wall-clock after the first edit. */
  createdAt: number
  /** Original publication time, carried unchanged across edits (`published_at` tag). Falls back to created_at. */
  publishedAt: number
  /** Whether `published_at` was actually present; without it `publishedAt` is only created_at. */
  hasPublishedAt: boolean
  /** Wall-clock time of the last edit (`updated_at` tag), when the draft has been edited. */
  updatedAt?: number
  /** True once `created_at` has moved past `published_at`, i.e. the draft was edited. */
  edited: boolean
  deleted: boolean
}

export interface Release {
  event: NostrEvent
  id: string
  pubkey: string
  uuid: string
  version: string
  specId: string
  title: string
  summary?: string
  kinds: KindRef[]
  topics: string[]
  draftCoord?: string
  prevId?: string
  forkOf?: { id: string; relay?: string; author?: string }
  /** `o` tag (§4.2): "original" on the first release of a uuid, "updated" on later versions. Undefined on releases predating the tag. */
  origin?: ReleaseOrigin
  content: string
  createdAt: number
}

export type ReleaseOrigin = 'original' | 'updated'
export const PS_ORIGIN_TAG = 'o'

export type ClaimRole = 'client' | 'relay' | 'library' | 'service'
export const CLAIM_ROLES: ClaimRole[] = ['client', 'relay', 'library', 'service']

export interface Claim {
  event: NostrEvent
  coord: string
  pubkey: string
  uuid: string
  /** The part of `d` after the uuid: one per piece of software an implementer claims. '' on a claim from before that. */
  claimId: string
  releaseId: string
  specId: string
  version: string
  releaseAuthor: string
  role: ClaimRole
  name: string
  implVersion?: string
  urls: string[]
  handler?: string
  relay?: string
  repo?: string
  scope: 'full' | 'partial'
  withdrawn: boolean
  content: string
  createdAt: number
}

export type ReleaseVerdict = 'recommend' | 'not-recommend' | 'unsure'
export type ClaimVerdict = 'accurate' | 'inaccurate'
export const RELEASE_VERDICTS: ReleaseVerdict[] = ['recommend', 'not-recommend', 'unsure']
export const CLAIM_VERDICTS: ClaimVerdict[] = ['accurate', 'inaccurate']
/** Earlier events wrote `legit` / `fake`; read them as the current values. */
const CLAIM_VERDICT_ALIASES: Record<string, ClaimVerdict> = { legit: 'accurate', fake: 'inaccurate' }

export type Review =
  | { event: NostrEvent; pubkey: string; target: 'release'; releaseId: string; uuid: string; reviewVersion: string; verdict: ReleaseVerdict; content: string; createdAt: number }
  | { event: NostrEvent; pubkey: string; target: 'claim'; claimCoord: string; verdict: ClaimVerdict; content: string; createdAt: number }

export interface Backup {
  event: NostrEvent
  pubkey: string
  releaseId: string
  /** The embedded release, only when its id and signature verify. */
  release: Release | null
}

// ─── Parsers ────────────────────────────────────────────────────────

function parseKindRefs(ev: NostrEvent): KindRef[] {
  const out: KindRef[] = []
  const seen = new Set<number>()
  for (const t of tagsOf(ev, 'k')) {
    const k = Number(t[1])
    if (!Number.isInteger(k) || k < 0 || seen.has(k)) continue
    seen.add(k)
    out.push(t[2]?.trim() ? { kind: k, name: t[2].trim() } : { kind: k })
  }
  return out
}

function parseTopics(ev: NostrEvent): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of tagsOf(ev, 't')) {
    const v = t[1]?.trim().toLowerCase()
    if (v && !seen.has(v)) { seen.add(v); out.push(v) }
  }
  return out
}

export function parseDraft(ev: NostrEvent): Draft | null {
  if (ev.kind !== KINDS.PS_DRAFT) return null
  const uuid = tag(ev, 'd')
  if (!uuid) return null
  cacheEvent(ev) // newest revision per coordinate; tombstones included, so a cached read can see the deletion
  return {
    event: ev,
    coord: draftCoord(ev.pubkey, uuid),
    uuid,
    pubkey: ev.pubkey,
    title: tag(ev, 'title')?.trim() || 'Untitled',
    summary: tag(ev, 'summary')?.trim() || undefined,
    kinds: parseKindRefs(ev),
    topics: parseTopics(ev),
    status: tag(ev, 'status')?.trim() || undefined,
    content: ev.content,
    createdAt: ev.created_at,
    publishedAt: parseInt(tag(ev, 'published_at') ?? '', 10) || ev.created_at,
    hasPublishedAt: !!(parseInt(tag(ev, 'published_at') ?? '', 10)),
    updatedAt: parseInt(tag(ev, 'updated_at') ?? '', 10) || undefined,
    edited: ev.created_at > (parseInt(tag(ev, 'published_at') ?? '', 10) || ev.created_at),
    deleted: isDeleted(ev),
  }
}

export function parseRelease(ev: NostrEvent): Release | null {
  if (ev.kind !== KINDS.PS_RELEASE) return null
  const v = tag(ev, PS_SPEC_ID_TAG)
  const sid = v ? parseSpecId(v) : null
  if (!sid) return null
  cacheEvent(ev) // immutable, keyed by id: a cached release never needs a re-fetch
  const fork = ev.tags.find((t) => t[0] === 'e' && t[3] === 'fork')
  const prev = ev.tags.find((t) => t[0] === 'e' && t[3] === 'prev')
  const forkAuthor = fork ? ev.tags.find((t) => t[0] === 'p')?.[1] : undefined
  return {
    event: ev,
    id: ev.id,
    pubkey: ev.pubkey,
    uuid: sid.uuid,
    version: sid.version,
    specId: v!,
    title: tag(ev, 'title')?.trim() || 'Untitled',
    summary: tag(ev, 'summary')?.trim() || undefined,
    kinds: parseKindRefs(ev),
    topics: parseTopics(ev),
    draftCoord: tag(ev, 'a') || undefined,
    prevId: prev?.[1] || undefined,
    forkOf: fork ? { id: fork[1], relay: fork[2] || undefined, author: forkAuthor } : undefined,
    origin: parseOrigin(tag(ev, PS_ORIGIN_TAG)),
    content: ev.content,
    createdAt: ev.created_at,
  }
}

function parseOrigin(v: string | undefined): ReleaseOrigin | undefined {
  return v === 'original' || v === 'updated' ? v : undefined
}

/** Parses and, when valid, caches (newest per coordinate) for instant paint. */
export function parseClaim(ev: NostrEvent): Claim | null {
  const c = parseClaimInner(ev)
  if (c) cacheEvent(ev)
  return c
}

function parseClaimInner(ev: NostrEvent): Claim | null {
  if (ev.kind !== KINDS.PS_CLAIM) return null
  const d = tag(ev, 'd')
  const releaseId = tag(ev, 'e')
  const v = tag(ev, PS_SPEC_ID_TAG)
  const sid = v ? parseSpecId(v) : null
  const releaseAuthor = tag(ev, 'p')
  const roleRaw = tag(ev, 'role') as ClaimRole | undefined
  if (!d || !releaseId || !sid || !releaseAuthor || !roleRaw || !CLAIM_ROLES.includes(roleRaw)) return null
  const uuid = sid.uuid
  // `d` is `<uuid>:<claim id>`; a bare uuid is a claim from before an implementer could hold several.
  const claimId = d === uuid ? '' : d.startsWith(`${uuid}:`) ? d.slice(uuid.length + 1) : d
  const scope = tag(ev, 'scope') === 'partial' ? 'partial' : 'full'
  return {
    event: ev,
    coord: claimCoord(ev.pubkey, d),
    pubkey: ev.pubkey,
    uuid,
    claimId,
    releaseId,
    specId: v!,
    version: sid.version,
    releaseAuthor,
    role: roleRaw,
    name: tag(ev, 'name')?.trim() || 'Unnamed',
    implVersion: tag(ev, 'impl_version')?.trim() || undefined,
    urls: tagsOf(ev, 'r').map((t) => t[1]).filter(Boolean),
    handler: tag(ev, 'handler') || undefined,
    relay: tag(ev, 'relay') || undefined,
    repo: tag(ev, 'repo') || undefined,
    scope,
    withdrawn: ev.tags.some((t) => t[0] === 'withdrawn'),
    content: ev.content,
    createdAt: ev.created_at,
  }
}

/** Parses and, when valid, caches (newest per coordinate) for instant paint. */
export function parseReview(ev: NostrEvent): Review | null {
  const r = parseReviewInner(ev)
  if (r) cacheEvent(ev)
  return r
}

function parseReviewInner(ev: NostrEvent): Review | null {
  if (ev.kind !== KINDS.PS_REVIEW) return null
  const k = Number(tag(ev, 'k'))
  const verdict = tag(ev, 'verdict')
  if (k === KINDS.PS_RELEASE) {
    const releaseId = tag(ev, 'e')
    const v = tag(ev, PS_SPEC_ID_TAG)
    const sid = v ? parseSpecId(v) : null
    if (!releaseId || !sid || !RELEASE_VERDICTS.includes(verdict as ReleaseVerdict)) return null
    return { event: ev, pubkey: ev.pubkey, target: 'release', releaseId, uuid: sid.uuid, reviewVersion: sid.version, verdict: verdict as ReleaseVerdict, content: ev.content, createdAt: ev.created_at }
  }
  if (k === KINDS.PS_CLAIM) {
    const coord = tag(ev, 'a')
    const cv = (verdict && CLAIM_VERDICT_ALIASES[verdict]) || (verdict as ClaimVerdict)
    if (!coord || !CLAIM_VERDICTS.includes(cv)) return null
    return { event: ev, pubkey: ev.pubkey, target: 'claim', claimCoord: coord, verdict: cv, content: ev.content, createdAt: ev.created_at }
  }
  return null
}

export function parseBackup(ev: NostrEvent): Backup | null {
  if (ev.kind !== KINDS.PS_BACKUP) return null
  const releaseId = tag(ev, 'e')
  if (!releaseId) return null
  let release: Release | null = null
  try {
    const inner = JSON.parse(ev.content) as NostrEvent
    if (inner && inner.id === releaseId && inner.kind === KINDS.PS_RELEASE && verifyEvent(inner)) {
      release = parseRelease(inner)
    }
  } catch {
    // malformed backup: still listed, just not trusted
  }
  return { event: ev, pubkey: ev.pubkey, releaseId, release }
}

// ─── Builders ───────────────────────────────────────────────────────

export interface DraftInput {
  uuid: string
  title: string
  summary?: string
  content: string
  kinds?: KindRef[]
  topics?: string[]
  status?: string
  /** Editing: the original publication time to carry forward. Absent on first publish. */
  publishedAt?: number
  /** Editing: `created_at` of the revision being replaced; the new one is that + 1. */
  prevCreatedAt?: number
}

/**
 * Draft timestamps (spec §4.1): `published_at` is set once and carried
 * forward; `created_at` is a logical counter that steps +1 per edit so the
 * replacement is always newer than the revision it replaces without jumping
 * to wall-clock; `updated_at` is the real edit time, for display only.
 */
export function buildDraftEvent(input: DraftInput): UnsignedEvent {
  const wall = now()
  const editing = input.prevCreatedAt !== undefined
  const createdAt = editing ? input.prevCreatedAt! + 1 : wall
  const publishedAt = input.publishedAt ?? createdAt
  const tags: string[][] = [
    ['d', input.uuid],
    ['title', input.title.trim()],
  ]
  if (input.summary?.trim()) tags.push(['summary', input.summary.trim()])
  for (const k of input.kinds ?? []) tags.push(k.name ? ['k', String(k.kind), k.name] : ['k', String(k.kind)])
  for (const t of input.topics ?? []) tags.push(['t', t.trim().toLowerCase()])
  if (input.status?.trim()) tags.push(['status', input.status.trim()])
  tags.push(['published_at', String(publishedAt)])
  if (editing) tags.push(['updated_at', String(wall)])
  tags.push(['client', CLIENT_NAME])
  return { kind: KINDS.PS_DRAFT, content: input.content, tags, created_at: createdAt, pubkey: '' }
}

export interface ReleaseInput {
  uuid: string
  version: string
  title: string
  summary?: string
  content: string
  kinds?: KindRef[]
  topics?: string[]
  /** The draft this snapshots. */
  draftCoord?: string
  draftRelay?: string
  prevId?: string
  prevRelay?: string
  forkOf?: { id: string; relay?: string; author?: string }
}

export function buildReleaseEvent(input: ReleaseInput): UnsignedEvent {
  if (!isValidVersion(input.version)) throw new Error(`Invalid version "${input.version}"`)
  const tags: string[][] = [
    [PS_SPEC_ID_TAG, specId(input.uuid, input.version)],
    ['title', input.title.trim()],
  ]
  if (input.draftCoord) tags.push(input.draftRelay ? ['a', input.draftCoord, input.draftRelay] : ['a', input.draftCoord])
  if (input.summary?.trim()) tags.push(['summary', input.summary.trim()])
  for (const k of input.kinds ?? []) tags.push(k.name ? ['k', String(k.kind), k.name] : ['k', String(k.kind)])
  for (const t of input.topics ?? []) tags.push(['t', t.trim().toLowerCase()])
  // Lineage marker (§4.2): lets relays answer "one event per proposal".
  tags.push([PS_ORIGIN_TAG, input.prevId ? 'updated' : 'original'])
  if (input.prevId) tags.push(['e', input.prevId, input.prevRelay ?? '', 'prev'])
  if (input.forkOf) {
    tags.push(['e', input.forkOf.id, input.forkOf.relay ?? '', 'fork'])
    if (input.forkOf.author) tags.push(['p', input.forkOf.author])
  }
  tags.push(['client', CLIENT_NAME])
  return { kind: KINDS.PS_RELEASE, content: input.content, tags, created_at: now(), pubkey: '' }
}

export function buildBackupEvent(release: NostrEvent, relay?: string): UnsignedEvent {
  const v = tag(release, PS_SPEC_ID_TAG)
  const tags: string[][] = [
    relay ? ['e', release.id, relay] : ['e', release.id],
    ['k', String(KINDS.PS_RELEASE)],
  ]
  if (v) tags.push([PS_SPEC_ID_TAG, v])
  return { kind: KINDS.PS_BACKUP, content: JSON.stringify(release), tags, created_at: now(), pubkey: '' }
}

export interface ClaimInput {
  release: Release
  releaseRelay?: string
  /** Keep an existing claim's address: its claim id ('' for a claim that predates several per implementer). Omit for a new claim. */
  claimId?: string
  role: ClaimRole
  name: string
  implVersion?: string
  urls?: string[]
  handler?: string
  relay?: string
  repo?: string
  scope?: 'full' | 'partial'
  content?: string
  withdrawn?: boolean
}

/** 8 hex characters: enough to tell one implementer's claims on a proposal apart. */
function randomClaimId(): string {
  const b = new Uint8Array(4)
  crypto.getRandomValues(b)
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

export function buildClaimEvent(input: ClaimInput): UnsignedEvent {
  const r = input.release
  // `d` is `<uuid>:<claim id>`, one per piece of software; a legacy claim keeps its bare-uuid address.
  const d = input.claimId === undefined ? `${r.uuid}:${randomClaimId()}` : input.claimId === '' ? r.uuid : `${r.uuid}:${input.claimId}`
  const tags: string[][] = [
    ['d', d],
    // The proposal address (§4.4): how claims for a proposal are queried, across all its versions.
    ['a', draftCoord(r.pubkey, r.uuid)],
    input.releaseRelay ? ['e', r.id, input.releaseRelay] : ['e', r.id],
    [PS_SPEC_ID_TAG, r.specId],
    ['p', r.pubkey],
    ['role', input.role],
    ['name', input.name.trim()],
  ]
  if (input.implVersion?.trim()) tags.push(['impl_version', input.implVersion.trim()])
  for (const u of input.urls ?? []) if (u.trim()) tags.push(['r', u.trim()])
  if (input.handler?.trim()) tags.push(['handler', input.handler.trim()])
  if (input.relay?.trim()) tags.push(['relay', input.relay.trim()])
  if (input.repo?.trim()) tags.push(['repo', input.repo.trim()])
  if (input.scope === 'partial') tags.push(['scope', 'partial'])
  if (input.withdrawn) tags.push(['withdrawn'])
  tags.push(['client', CLIENT_NAME])
  return { kind: KINDS.PS_CLAIM, content: input.content?.trim() ?? '', tags, created_at: now(), pubkey: '' }
}

export function buildReleaseReviewEvent(release: Release, verdict: ReleaseVerdict, content: string, relay?: string): UnsignedEvent {
  // `d` is the proposal uuid, so a reviewer holds one review per proposal, moved in place
  // when they re-review; `e` names the exact version reviewed, `a` is the proposal address.
  const tags: string[][] = [
    ['d', release.uuid],
    ['a', draftCoord(release.pubkey, release.uuid)],
    relay ? ['e', release.id, relay] : ['e', release.id],
    ['k', String(KINDS.PS_RELEASE)],
    [PS_SPEC_ID_TAG, release.specId],
    ['p', release.pubkey],
    ['verdict', verdict],
    ['client', CLIENT_NAME],
  ]
  return { kind: KINDS.PS_REVIEW, content: content.trim(), tags, created_at: now(), pubkey: '' }
}

export function buildClaimReviewEvent(claim: Claim, verdict: ClaimVerdict, content: string, relay?: string): UnsignedEvent {
  const tags: string[][] = [
    ['d', claim.coord],
    relay ? ['a', claim.coord, relay] : ['a', claim.coord],
    ['k', String(KINDS.PS_CLAIM)],
    ['p', claim.pubkey],
    ['verdict', verdict],
    ['client', CLIENT_NAME],
  ]
  return { kind: KINDS.PS_REVIEW, content: content.trim(), tags, created_at: now(), pubkey: '' }
}

// ─── Fetchers ───────────────────────────────────────────────────────
//
// Addressable kinds: relays may hand back stale revisions, so always keep the
// newest per coordinate. Regular kinds: dedupe by id.

function latestByCoord<T extends { coord: string; createdAt: number }>(items: T[]): T[] {
  const by = new Map<string, T>()
  for (const it of items) {
    const cur = by.get(it.coord)
    if (!cur || it.createdAt > cur.createdAt) by.set(it.coord, it)
  }
  return [...by.values()]
}

function dedupeById<T extends { event: NostrEvent }>(items: T[]): T[] {
  const by = new Map<string, T>()
  for (const it of items) if (!by.has(it.event.id)) by.set(it.event.id, it)
  return [...by.values()]
}

const parseAll = <T>(evs: NostrEvent[], fn: (e: NostrEvent) => T | null): T[] =>
  evs.map(fn).filter((x): x is T => x !== null)

export async function fetchDrafts(relays: string[], filter: Partial<Filter> = {}, timeoutMs = 8000): Promise<Draft[]> {
  const evs = await fetchEvents(relays, { kinds: [KINDS.PS_DRAFT], limit: 100, ...filter }, timeoutMs)
  return latestByCoord(parseAll(evs, parseDraft)).filter((d) => !d.deleted).sort((a, b) => b.createdAt - a.createdAt)
}

/** Synchronous cache read for instant paint (await `whenEventCacheReady` first on a cold load). Tombstoned drafts come back null. */
export function getCachedDraft(pubkey: string, uuid: string): Draft | null {
  const ev = getCachedEvent(draftCoord(pubkey, uuid))
  const d = ev ? parseDraft(ev) : null
  return d && !d.deleted ? d : null
}

/** Synchronous cache read for a release by id. */
export function getCachedRelease(id: string): Release | null {
  const ev = getCachedEvent(`${KINDS.PS_RELEASE}:${id}`)
  return ev ? parseRelease(ev) : null
}

/** Cached versions of one proposal, newest version first. */
export function getCachedVersions(pubkey: string, uuid: string): Release[] {
  return parseAll(getCachedEventsOfKind(KINDS.PS_RELEASE), parseRelease)
    .filter((r) => r.pubkey === pubkey && r.uuid === uuid)
    .sort((a, b) => compareVersions(b.version, a.version))
}

/** Cached claims against a proposal (one per implementer: the cache keeps the newest per coordinate). */
export function getCachedClaimsFor(uuid: string): Claim[] {
  return parseAll(getCachedEventsOfKind(KINDS.PS_CLAIM), parseClaim).filter((c) => c.uuid === uuid)
}

/** Cached reviews of one release, one per reviewer. */
export function getCachedReleaseReviews(uuid: string): Review[] {
  const all = parseAll(getCachedEventsOfKind(KINDS.PS_REVIEW), parseReview)
  return latestPerAuthor(all.filter((r) => r.target === 'release' && r.uuid === uuid))
}

/** All cached, non-deleted drafts, newest first. Seeds listings before relays answer. */
export function getCachedDrafts(): Draft[] {
  return latestByCoord(parseAll(getCachedEventsOfKind(KINDS.PS_DRAFT), parseDraft))
    .filter((d) => !d.deleted)
    .sort((a, b) => b.publishedAt - a.publishedAt)
}

/** All cached releases (any proposal). */
export function getCachedReleases(): Release[] {
  return parseAll(getCachedEventsOfKind(KINDS.PS_RELEASE), parseRelease)
}

/** All cached claims, keyed by uuid. */
export function getCachedClaimsByUuid(): Map<string, Claim[]> {
  const out = new Map<string, Claim[]>()
  for (const c of parseAll(getCachedEventsOfKind(KINDS.PS_CLAIM), parseClaim)) {
    const list = out.get(c.uuid) ?? []
    list.push(c)
    out.set(c.uuid, list)
  }
  return out
}

/** Draft coordinates that some cached release points at (chip seed for listings). */
export function getCachedReleasedCoords(): Set<string> {
  const out = new Set<string>()
  for (const r of getCachedReleases()) if (r.draftCoord) out.add(r.draftCoord)
  return out
}

/** Cached claims published by one implementer. */
export function getCachedClaimsBy(pubkey: string): Claim[] {
  return parseAll(getCachedEventsOfKind(KINDS.PS_CLAIM), parseClaim)
    .filter((c) => c.pubkey === pubkey)
    .sort((a, b) => b.createdAt - a.createdAt)
}

/** Cached reviews written by one reviewer, newest first. */
export function getCachedReviewsBy(pubkey: string): Review[] {
  return latestPerAuthor(parseAll(getCachedEventsOfKind(KINDS.PS_REVIEW), parseReview).filter((r) => r.pubkey === pubkey))
    .sort((a, b) => b.createdAt - a.createdAt)
}

export { whenEventCacheReady }

export async function fetchDraft(relays: string[], pubkey: string, uuid: string): Promise<Draft | null> {
  const evs = await fetchEvents(relays, { kinds: [KINDS.PS_DRAFT], authors: [pubkey], '#d': [uuid] }, 8000)
  const [d] = latestByCoord(parseAll(evs, parseDraft))
  // A tombstoned draft (replacement carrying the `deleted` tag) is gone for
  // every caller: the page, the editor and the release form all see null.
  return d && !d.deleted ? d : null
}

export async function fetchReleases(relays: string[], filter: Partial<Filter> = {}, timeoutMs = 8000): Promise<Release[]> {
  const evs = await fetchEvents(relays, { kinds: [KINDS.PS_RELEASE], limit: 200, ...filter }, timeoutMs)
  return dedupeById(parseAll(evs, parseRelease)).sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Latest version of each proposal in `originals` (§6.1): one `#a` + `#o updated`
 * query per proposal with limit 1, so a page costs page-size bodies. Returns
 * only proposals that have an update; the rest are current at their original.
 */
export async function fetchLatestUpdates(relays: string[], originals: Release[]): Promise<Release[]> {
  const coords = [...new Set(originals.map((r) => r.draftCoord).filter((c): c is string => !!c))]
  const got = await Promise.all(coords.map((c) =>
    fetchReleases(relays, { '#a': [c], [`#${PS_ORIGIN_TAG}`]: ['updated'], limit: 1 }).catch(() => [] as Release[]),
  ))
  return got.flat()
}

export async function fetchRelease(relays: string[], id: string): Promise<Release | null> {
  const ev = await fetchEvent(relays, { ids: [id] }, 8000)
  const r = ev ? parseRelease(ev) : null
  if (r) return r
  // Fall back to a backup carrying a verified copy.
  const backups = await fetchBackups(relays, id)
  return backups.find((b) => b.release)?.release ?? null
}

/** The live release event only, no backup fallback: null tells a deleted release apart from a recovered one. */
export async function fetchLiveRelease(relays: string[], id: string): Promise<Release | null> {
  const ev = await fetchEvent(relays, { ids: [id] }, 8000)
  return ev ? parseRelease(ev) : null
}

/**
 * Enough to identify a deleted release from the events that still point at it:
 * a claim or review carries the release author (`p`) and spec id (`v`). Lets the
 * page show the proposal's surroundings even when the release and any backup are
 * gone.
 */
export async function fetchReleaseRefs(relays: string[], id: string): Promise<{ author: string; uuid: string; version: string } | null> {
  const evs = await fetchEvents(relays, { kinds: [KINDS.PS_CLAIM, KINDS.PS_REVIEW], '#e': [id], limit: 50 }, 8000).catch(() => [] as NostrEvent[])
  for (const ev of evs) {
    if (tag(ev, 'e') !== id) continue
    const author = tag(ev, 'p')
    const v = tag(ev, PS_SPEC_ID_TAG)
    const sid = v ? parseSpecId(v) : null
    if (author && sid) return { author, uuid: sid.uuid, version: sid.version }
  }
  return null
}

/**
 * A stand-in for a release whose event is gone and has no backup, built from
 * what referencing events know: author, uuid, version. Its `event` is a
 * placeholder with no signature, so callers MUST NOT rebroadcast, back up, or
 * show it as raw; it exists only to drive the page shell around real claims,
 * reviews and comments. The title and body are empty by necessity.
 */
export function reconstructRelease(id: string, author: string, uuid: string, version: string): Release {
  return {
    event: { id, pubkey: author, kind: KINDS.PS_RELEASE, created_at: 0, content: '', sig: '', tags: [] } as NostrEvent,
    id,
    pubkey: author,
    uuid,
    version,
    specId: specId(uuid, version),
    title: '',
    kinds: [],
    topics: [],
    content: '',
    createdAt: 0,
  }
}

/** Every release of one proposal (author + uuid), newest version first. */
export async function fetchReleasesOf(relays: string[], pubkey: string, uuid: string): Promise<Release[]> {
  // The `v` tag is indexed but prefix queries aren't; ask by author and filter.
  const all = await fetchReleases(relays, { authors: [pubkey], limit: 500 })
  return all.filter((r) => r.uuid === uuid).sort((a, b) => compareVersions(b.version, a.version))
}

/** A fork of a proposal: the release that branched off, and which parent version it branched from. */
export interface Fork {
  /** The fork's first release, the one carrying the `fork` marker. Its page shows later versions. */
  release: Release
  /** The parent release it was derived from. */
  parentId: string
}

/** How many fork releases one query asks a relay for; past this the count shows as "N+". */
export const FORKS_QUERY_LIMIT = 200

/**
 * Forks of a proposal (§5): releases whose `e` tag with the `fork` marker
 * points at any version of it. One bounded `#e` query over the parent's
 * version ids, nothing per fork: the row opens the fork's own page, where its
 * versions load as usual. `capped` says a relay returned the full limit, so
 * there may be more than were seen.
 */
export async function fetchForksOf(relays: string[], parentIds: string[]): Promise<{ forks: Fork[]; capped: boolean }> {
  if (parentIds.length === 0) return { forks: [], capped: false }
  const want = new Set(parentIds)
  const evs = await fetchEvents(relays, { kinds: [KINDS.PS_RELEASE], '#e': parentIds, limit: FORKS_QUERY_LIMIT }, 8000)
  const firsts = dedupeById(parseAll(evs, parseRelease)).filter((r) => r.forkOf && want.has(r.forkOf.id))
  // One fork per proposal (author + uuid); a fork is a new uuid, so this only folds re-sent duplicates.
  const byProposal = new Map<string, Release>()
  for (const r of firsts) {
    const k = `${r.pubkey}:${r.uuid}`
    const prev = byProposal.get(k)
    if (!prev || compareVersions(r.version, prev.version) < 0) byProposal.set(k, r)
  }
  const forks = [...byProposal.values()]
    .map((release) => ({ release, parentId: release.forkOf!.id }))
    .sort((a, b) => b.release.createdAt - a.release.createdAt)
  return { forks, capped: evs.length >= FORKS_QUERY_LIMIT }
}

/**
 * Claims on one proposal, every version: by the proposal address in `a`.
 * Claims from before that tag carried the bare uuid in `d`, so that is asked
 * for too until none are left in the wild.
 */
export async function fetchClaimsFor(relays: string[], author: string, uuid: string): Promise<Claim[]> {
  const [byAddress, legacy] = await Promise.all([
    fetchEvents(relays, { kinds: [KINDS.PS_CLAIM], '#a': [draftCoord(author, uuid)], limit: 500 }, 8000),
    fetchEvents(relays, { kinds: [KINDS.PS_CLAIM], '#d': [uuid], limit: 500 }, 8000).catch(() => [] as NostrEvent[]),
  ])
  return latestByCoord(parseAll([...byAddress, ...legacy], parseClaim))
}

export async function fetchClaimsForMany(relays: string[], proposals: { pubkey: string; uuid: string }[]): Promise<Map<string, Claim[]>> {
  const out = new Map<string, Claim[]>()
  if (proposals.length === 0) return out
  // Chunk the filters so no single REQ gets too big.
  const CHUNK = 50
  const batches: Promise<NostrEvent[]>[] = []
  const coords = proposals.map((p) => draftCoord(p.pubkey, p.uuid))
  const uuids = proposals.map((p) => p.uuid)
  for (let i = 0; i < proposals.length; i += CHUNK) {
    batches.push(fetchEvents(relays, { kinds: [KINDS.PS_CLAIM], '#a': coords.slice(i, i + CHUNK), limit: 1000 }, 10000))
    batches.push(fetchEvents(relays, { kinds: [KINDS.PS_CLAIM], '#d': uuids.slice(i, i + CHUNK), limit: 1000 }, 10000).catch(() => [] as NostrEvent[]))
  }
  const evs = (await Promise.all(batches)).flat()
  for (const c of latestByCoord(parseAll(evs, parseClaim))) {
    const list = out.get(c.uuid) ?? []
    list.push(c)
    out.set(c.uuid, list)
  }
  return out
}

export async function fetchClaimsBy(relays: string[], pubkey: string): Promise<Claim[]> {
  const evs = await fetchEvents(relays, { kinds: [KINDS.PS_CLAIM], authors: [pubkey], limit: 500 }, 8000)
  return latestByCoord(parseAll(evs, parseClaim)).sort((a, b) => b.createdAt - a.createdAt)
}

export async function fetchReleaseReviews(relays: string[], author: string, uuid: string, versionIds: string[]): Promise<Review[]> {
  const [byAddress, legacy] = await Promise.all([
    fetchEvents(relays, { kinds: [KINDS.PS_REVIEW], '#a': [draftCoord(author, uuid)], limit: 1000 }, 8000),
    versionIds.length ? fetchEvents(relays, { kinds: [KINDS.PS_REVIEW], '#e': versionIds, limit: 1000 }, 8000).catch(() => [] as NostrEvent[]) : Promise.resolve([] as NostrEvent[]),
  ])
  const parsed = parseAll([...byAddress, ...legacy], parseReview).filter((r) => r.target === 'release' && r.uuid === uuid)
  return latestPerAuthor(parsed)
}

export async function fetchClaimReviews(relays: string[], claimCoords: string[]): Promise<Map<string, Review[]>> {
  const out = new Map<string, Review[]>()
  if (claimCoords.length === 0) return out
  const evs = await fetchEvents(relays, { kinds: [KINDS.PS_REVIEW], '#a': claimCoords, limit: 1000 }, 8000)
  const parsed = latestPerAuthor(parseAll(evs, parseReview).filter((r) => r.target === 'claim'))
  for (const r of parsed) {
    if (r.target !== 'claim') continue
    const list = out.get(r.claimCoord) ?? []
    list.push(r)
    out.set(r.claimCoord, list)
  }
  return out
}

export async function fetchReviewsBy(relays: string[], pubkey: string): Promise<Review[]> {
  const evs = await fetchEvents(relays, { kinds: [KINDS.PS_REVIEW], authors: [pubkey], limit: 500 }, 8000)
  return latestPerAuthor(parseAll(evs, parseReview)).sort((a, b) => b.createdAt - a.createdAt)
}

/** Reviews are addressable per (author, target); keep the newest per pair. */
function latestPerAuthor(reviews: Review[]): Review[] {
  const by = new Map<string, Review>()
  for (const r of reviews) {
    const key = `${r.pubkey}:${r.target === 'release' ? r.uuid : r.claimCoord}`
    const cur = by.get(key)
    if (!cur || r.createdAt > cur.createdAt) by.set(key, r)
  }
  return [...by.values()]
}

export async function fetchBackups(relays: string[], releaseId: string): Promise<Backup[]> {
  const evs = await fetchEvents(relays, { kinds: [KINDS.PS_BACKUP], '#e': [releaseId], limit: 50 }, 8000)
  return dedupeById(parseAll(evs, parseBackup))
}

/** Backups for several release ids (every version of a proposal) in one query. */
export async function fetchBackupsForMany(relays: string[], releaseIds: string[]): Promise<Backup[]> {
  if (!releaseIds.length) return []
  const evs = await fetchEvents(relays, { kinds: [KINDS.PS_BACKUP], '#e': releaseIds, limit: 200 }, 8000)
  return dedupeById(parseAll(evs, parseBackup))
}

/** Releases that reference a draft, by address or by uuid prefix (§6.1). */
export async function fetchReleasesForDraft(relays: string[], draft: Draft): Promise<Release[]> {
  const [byAddr, byAuthor] = await Promise.all([
    fetchReleases(relays, { '#a': [draft.coord], limit: 100 }),
    fetchReleasesOf(relays, draft.pubkey, draft.uuid),
  ])
  return dedupeById([...byAddr, ...byAuthor]).sort((a, b) => compareVersions(b.version, a.version))
}

// ─── Rollups (§5) ───────────────────────────────────────────────────

export interface ProposalSummary {
  /** `${pubkey}:${uuid}` */
  key: string
  pubkey: string
  uuid: string
  latest: Release
  releases: Release[]
  /** Live (non-withdrawn) claims against any version. */
  claims: Claim[]
  /** Distinct implementer pubkeys with a live claim against any version. */
  implementers: number
  /** Per-version live-claim counts, keyed by version. */
  perVersion: Record<string, number>
}

export function groupReleases(releases: Release[]): Map<string, Release[]> {
  const by = new Map<string, Release[]>()
  for (const r of releases) {
    const key = `${r.pubkey}:${r.uuid}`
    const list = by.get(key) ?? []
    list.push(r)
    by.set(key, list)
  }
  for (const list of by.values()) list.sort((a, b) => compareVersions(b.version, a.version))
  return by
}

/** `minPow` is the raw-view floor (§6.5): claims below it are not counted. 0 = count all. */
export function summarizeProposals(releases: Release[], claimsByUuid: Map<string, Claim[]>, minPow = 0): ProposalSummary[] {
  const out: ProposalSummary[] = []
  for (const [key, list] of groupReleases(releases)) {
    const latest = list[0]
    const ids = new Set(list.map((r) => r.id))
    // Claims carry the release author in `p`; only count those aimed at this lineage.
    const claims = (claimsByUuid.get(latest.uuid) ?? []).filter((c) =>
      !c.withdrawn && c.releaseAuthor === latest.pubkey && ids.has(c.releaseId) && (minPow <= 0 || countLeadingZeroBits(c.event.id) >= minPow))
    const implementers = new Set(claims.map((c) => c.pubkey)).size
    const perVersion: Record<string, number> = {}
    for (const c of claims) perVersion[c.version] = (perVersion[c.version] ?? 0) + 1
    out.push({ key, pubkey: latest.pubkey, uuid: latest.uuid, latest, releases: list, claims, implementers, perVersion })
  }
  return out
}
