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

export function releaseNevent(id: string, author: string, relays?: string[]): string {
  return nip19.neventEncode({ id, author, kind: KINDS.PS_RELEASE, relays })
}

/** `<title> v<version> by <npub…> (<id…>)` per §3. */
export function releaseLabel(r: { title: string; version: string; pubkey: string; id: string }): string {
  const npub = nip19.npubEncode(r.pubkey)
  return `${r.title} v${r.version} by ${npub.slice(0, 12)}… (${r.id.slice(0, 8)})`
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
  createdAt: number
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
export type ClaimVerdict = 'legit' | 'fake'
export const RELEASE_VERDICTS: ReleaseVerdict[] = ['recommend', 'not-recommend', 'unsure']
export const CLAIM_VERDICTS: ClaimVerdict[] = ['legit', 'fake']

export type Review =
  | { event: NostrEvent; pubkey: string; target: 'release'; releaseId: string; verdict: ReleaseVerdict; content: string; createdAt: number }
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
  const uuid = tag(ev, 'd')
  const releaseId = tag(ev, 'e')
  const v = tag(ev, PS_SPEC_ID_TAG)
  const sid = v ? parseSpecId(v) : null
  const releaseAuthor = tag(ev, 'p')
  const roleRaw = tag(ev, 'role') as ClaimRole | undefined
  if (!uuid || !releaseId || !sid || !releaseAuthor || !roleRaw || !CLAIM_ROLES.includes(roleRaw)) return null
  const scope = tag(ev, 'scope') === 'partial' ? 'partial' : 'full'
  return {
    event: ev,
    coord: claimCoord(ev.pubkey, uuid),
    pubkey: ev.pubkey,
    uuid,
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
    if (!releaseId || !RELEASE_VERDICTS.includes(verdict as ReleaseVerdict)) return null
    return { event: ev, pubkey: ev.pubkey, target: 'release', releaseId, verdict: verdict as ReleaseVerdict, content: ev.content, createdAt: ev.created_at }
  }
  if (k === KINDS.PS_CLAIM) {
    const coord = tag(ev, 'a')
    if (!coord || !CLAIM_VERDICTS.includes(verdict as ClaimVerdict)) return null
    return { event: ev, pubkey: ev.pubkey, target: 'claim', claimCoord: coord, verdict: verdict as ClaimVerdict, content: ev.content, createdAt: ev.created_at }
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
}

export function buildDraftEvent(input: DraftInput): UnsignedEvent {
  const tags: string[][] = [
    ['d', input.uuid],
    ['title', input.title.trim()],
  ]
  if (input.summary?.trim()) tags.push(['summary', input.summary.trim()])
  for (const k of input.kinds ?? []) tags.push(k.name ? ['k', String(k.kind), k.name] : ['k', String(k.kind)])
  for (const t of input.topics ?? []) tags.push(['t', t.trim().toLowerCase()])
  if (input.status?.trim()) tags.push(['status', input.status.trim()])
  tags.push(['client', CLIENT_NAME])
  return { kind: KINDS.PS_DRAFT, content: input.content, tags, created_at: now(), pubkey: '' }
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

export function buildClaimEvent(input: ClaimInput): UnsignedEvent {
  const r = input.release
  const tags: string[][] = [
    ['d', r.uuid],
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
  const tags: string[][] = [
    ['d', release.id],
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
export function getCachedReleaseReviews(releaseId: string): Review[] {
  const all = parseAll(getCachedEventsOfKind(KINDS.PS_REVIEW), parseReview)
  return latestPerAuthor(all.filter((r) => r.target === 'release' && r.releaseId === releaseId))
}

/** All cached, non-deleted drafts, newest first. Seeds listings before relays answer. */
export function getCachedDrafts(): Draft[] {
  return latestByCoord(parseAll(getCachedEventsOfKind(KINDS.PS_DRAFT), parseDraft))
    .filter((d) => !d.deleted)
    .sort((a, b) => b.createdAt - a.createdAt)
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

/** Every release of one proposal (author + uuid), newest version first. */
export async function fetchReleasesOf(relays: string[], pubkey: string, uuid: string): Promise<Release[]> {
  // The `v` tag is indexed but prefix queries aren't; ask by author and filter.
  const all = await fetchReleases(relays, { authors: [pubkey], limit: 500 })
  return all.filter((r) => r.uuid === uuid).sort((a, b) => compareVersions(b.version, a.version))
}

export async function fetchClaimsFor(relays: string[], uuid: string): Promise<Claim[]> {
  const evs = await fetchEvents(relays, { kinds: [KINDS.PS_CLAIM], '#d': [uuid], limit: 500 }, 8000)
  return latestByCoord(parseAll(evs, parseClaim))
}

export async function fetchClaimsForMany(relays: string[], uuids: string[]): Promise<Map<string, Claim[]>> {
  const out = new Map<string, Claim[]>()
  if (uuids.length === 0) return out
  // Chunk the #d filter so no single REQ gets too big.
  const CHUNK = 50
  const batches: Promise<NostrEvent[]>[] = []
  for (let i = 0; i < uuids.length; i += CHUNK) {
    batches.push(fetchEvents(relays, { kinds: [KINDS.PS_CLAIM], '#d': uuids.slice(i, i + CHUNK), limit: 1000 }, 10000))
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

export async function fetchReleaseReviews(relays: string[], releaseId: string): Promise<Review[]> {
  const evs = await fetchEvents(relays, { kinds: [KINDS.PS_REVIEW], '#e': [releaseId], limit: 500 }, 8000)
  const parsed = parseAll(evs, parseReview).filter((r) => r.target === 'release')
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
    const key = `${r.pubkey}:${r.target === 'release' ? r.releaseId : r.claimCoord}`
    const cur = by.get(key)
    if (!cur || r.createdAt > cur.createdAt) by.set(key, r)
  }
  return [...by.values()]
}

export async function fetchBackups(relays: string[], releaseId: string): Promise<Backup[]> {
  const evs = await fetchEvents(relays, { kinds: [KINDS.PS_BACKUP], '#e': [releaseId], limit: 50 }, 8000)
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

export function summarizeProposals(releases: Release[], claimsByUuid: Map<string, Claim[]>): ProposalSummary[] {
  const out: ProposalSummary[] = []
  for (const [key, list] of groupReleases(releases)) {
    const latest = list[0]
    const ids = new Set(list.map((r) => r.id))
    // Claims carry the release author in `p`; only count those aimed at this lineage.
    const claims = (claimsByUuid.get(latest.uuid) ?? []).filter((c) => !c.withdrawn && c.releaseAuthor === latest.pubkey && ids.has(c.releaseId))
    const implementers = new Set(claims.map((c) => c.pubkey)).size
    const perVersion: Record<string, number> = {}
    for (const c of claims) perVersion[c.version] = (perVersion[c.version] ?? 0) + 1
    out.push({ key, pubkey: latest.pubkey, uuid: latest.uuid, latest, releases: list, claims, implementers, perVersion })
  }
  return out
}
