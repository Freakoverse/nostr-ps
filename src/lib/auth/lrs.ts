/**
 * NIP-LRS: Local Relay Signer
 *
 * A desktop signer exposes its NIP-46 interface over a **private NIP-01 relay
 * bound to localhost**. Any NIP-46 client on the same machine signs through it
 * with no relays and no key material leaving the signer — and, on the discovery
 * path, no pairing string.
 *
 * This client needs **no new transport code**: the session is ordinary NIP-46
 * over a loopback relay, so we build a `bunker://` URL pointing at
 * `ws://127.0.0.1:<port>` and hand it to the existing {@link BunkerSigner}
 * (nostr-tools NIP-46). This module only adds the two things "run a relay on
 * localhost" does not settle on its own:
 *
 *  1. **Discovery** — a plain HTTP GET of the relay's NIP-11 info document,
 *     which (for a signer) carries a `local_relay_signer` marker with the
 *     signer's random **transport key**. The marker's presence *is* the
 *     capability test; an ordinary relay has none and is skipped.
 *  2. **Port + failover** — signers bind the first free port in 7777–7786, so a
 *     client scans that range. The port is a cache; the transport key is the
 *     identity (TOFU-pinned), and we only ever reconnect to the port presenting
 *     the pinned key.
 *
 * Two keypairs are in play (spec §2): the **transport key** identifies the
 * signer *install* and is the only pubkey revealed at discovery; the **account
 * key** is the user's identity, disclosed only after the user approves a
 * connection in the signer's own UI.
 */

import { generateSecretKey } from 'nostr-tools'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
import { StorageKey, CLIENT_NAME } from '@/lib/constants'
import { BunkerSigner } from './bunker'

/** The shared scan range (spec §4). Signers bind the first free port here. */
export const LRS_PORT_RANGE = Array.from({ length: 10 }, (_, i) => 7777 + i)

/** Per-probe HTTP timeout. Short, so dead/hanging loopback ports don't stall the scan. */
const PROBE_TIMEOUT_MS = 1200
/** Fast failures (ERR_CONNECTION_RESET from the signer's socket bug) are common; retry each probe. */
const PROBE_ATTEMPTS = 3
/** Re-scan the whole range a few times before concluding "no signer" — discovery is flaky. */
const SCAN_PASSES = 2
/**
 * First-connect blocks on in-app approval in the signer's own window — there is
 * no web redirect and no pairing secret — so allow plenty of time.
 */
const APPROVE_TIMEOUT_MS = 180_000

export interface LrsSignerInfo {
  /** Self-declared, untrusted display label. May collide; disambiguate by fingerprint. */
  name: string
  /** The signer's transport key (x-only hex). The identity a client pins. */
  transportPubkey: string
  /** The port its info document answered on — a cache, not an identity. */
  port: number
}

/** What a client persists to reconnect: the port is a cache, the transport key is identity. */
export interface LrsSession {
  transportPubkey: string
  accountPubkey: string
  lastPort: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** A short, stable fingerprint of a transport key, for UIs to disambiguate same-named signers. */
export function fingerprint(transportPubkey: string): string {
  return `${transportPubkey.slice(0, 8)}…${transportPubkey.slice(-4)}`
}

// ─── Discovery ──────────────────────────────────────────────────────

/**
 * Probe one loopback port for a signer's NIP-11 info document. Returns the
 * signer info when the `local_relay_signer` marker is present, or null when the
 * port is closed / not a relay / an ordinary relay without the marker.
 *
 * A browser `fetch` cannot tell "port closed" from "connection reset" — both
 * throw a generic `TypeError` — but it *can* tell those fast failures from our
 * own timeout (`AbortError`). A timeout means the port is dead or hanging, so we
 * give up; a fast failure may be the signer's socket resetting the request, so
 * we retry a few times.
 */
export async function probePort(port: number): Promise<LrsSignerInfo | null> {
  const url = `http://127.0.0.1:${port}/`
  for (let attempt = 0; attempt < PROBE_ATTEMPTS; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/nostr+json' },
        signal: ctrl.signal,
        cache: 'no-store',
        // Origin is not an authorization signal; we just need the body back.
        mode: 'cors',
      })
      clearTimeout(timer)
      if (!res.ok) return null
      const doc = await res.json().catch(() => null) as { name?: unknown; local_relay_signer?: { transport_pubkey?: unknown } } | null
      const tp = doc?.local_relay_signer?.transport_pubkey
      // The marker's presence IS the capability test — never a check against a
      // known key or name. Any software presenting it is a candidate signer.
      if (typeof tp === 'string' && /^[0-9a-f]{64}$/i.test(tp)) {
        return {
          name: typeof doc?.name === 'string' && doc.name.trim() ? doc.name.trim() : 'Local signer',
          transportPubkey: tp.toLowerCase(),
          port,
        }
      }
      return null // listening, but not an LRS signer
    } catch (err) {
      clearTimeout(timer)
      if ((err as { name?: string })?.name === 'AbortError') return null // timeout → give up on this port
      await sleep(120) // fast failure → retry (may be a reset request)
    }
  }
  return null
}

/** Dedupe by transport key (identity), keeping the lowest port seen for each. */
function dedupe(found: LrsSignerInfo[]): LrsSignerInfo[] {
  const byKey = new Map<string, LrsSignerInfo>()
  for (const s of found) {
    const cur = byKey.get(s.transportPubkey)
    if (!cur || s.port < cur.port) byKey.set(s.transportPubkey, s)
  }
  return [...byKey.values()].sort((a, b) => a.port - b.port)
}

/**
 * Scan the whole range for signers. Probes all ten ports in parallel (cheap),
 * and because discovery is flaky, re-scans a couple of times before concluding
 * there is none. Returns `[]` for "no local signer" — not an error.
 */
export async function discoverSigners(): Promise<LrsSignerInfo[]> {
  for (let pass = 0; pass < SCAN_PASSES; pass++) {
    const results = await Promise.all(LRS_PORT_RANGE.map((p) => probePort(p)))
    const found = results.filter((r): r is LrsSignerInfo => r !== null)
    if (found.length) return dedupe(found)
  }
  return []
}

/**
 * Fast path for reconnection: probe a single known port and accept it only if
 * it still presents the pinned transport key. The port is a cache; a different
 * signer that grabbed the old port must never be accepted in its place.
 */
export async function probeKnownPort(port: number, transportPubkey: string): Promise<LrsSignerInfo | null> {
  const info = await probePort(port)
  return info && info.transportPubkey === transportPubkey ? info : null
}

/** Scan the range for the one signer presenting the pinned transport key. */
export async function findSignerByTransport(transportPubkey: string): Promise<LrsSignerInfo | null> {
  const all = await discoverSigners()
  return all.find((s) => s.transportPubkey === transportPubkey) ?? null
}

// ─── Client-key persistence (one per signer) ────────────────────────

/**
 * Load (or create and persist) the client key for a given signer, keyed by its
 * transport key. Default bunker libraries mint a fresh client keypair every
 * session, so the signer sees a new client on each login and piles up duplicate
 * connections. Persisting one key per signer means the signer recognizes us and
 * resumes the stored policy silently — no re-approval, no duplicates. These are
 * connection identities, not account keys; they survive logout.
 */
function loadOrCreateClientKey(transportPubkey: string): Uint8Array {
  const k = StorageKey.LRS_CLIENT_KEY_PREFIX + transportPubkey
  try {
    const stored = localStorage.getItem(k)
    if (stored && /^[0-9a-f]{64}$/i.test(stored)) return hexToBytes(stored)
  } catch { /* ignore */ }
  const key = generateSecretKey()
  try { localStorage.setItem(k, bytesToHex(key)) } catch { /* ignore */ }
  return key
}

// ─── Session persistence ────────────────────────────────────────────

export function saveLrsSession(session: LrsSession): void {
  try { localStorage.setItem(StorageKey.LRS_SIGNER, JSON.stringify(session)) } catch { /* ignore */ }
}

export function loadLrsSession(): LrsSession | null {
  try {
    const raw = localStorage.getItem(StorageKey.LRS_SIGNER)
    if (!raw) return null
    const s = JSON.parse(raw) as Partial<LrsSession>
    if (typeof s.transportPubkey === 'string' && typeof s.accountPubkey === 'string' && typeof s.lastPort === 'number') {
      return s as LrsSession
    }
  } catch { /* ignore */ }
  return null
}

export function clearLrsSession(): void {
  try { localStorage.removeItem(StorageKey.LRS_SIGNER) } catch { /* ignore */ }
}

// ─── Connecting ─────────────────────────────────────────────────────

function safeOrigin(): string | undefined {
  try { return window.location.origin } catch { return undefined }
}

/**
 * Connect to a discovered signer over its loopback relay. Builds a `bunker://`
 * URL at `ws://127.0.0.1:<port>` and runs ordinary NIP-46 through the existing
 * bunker signer. On the first connection it sends this app's metadata (name +
 * url) so the signer can label the connection with a real name instead of a raw
 * key, and allows a long window for the user to approve in the signer's own UI.
 * On reconnect it resumes silently with the recognized client key.
 *
 * Returns the connected signer and the **account** pubkey the user selected —
 * the first point at which the account is disclosed.
 */
export async function connectLocalSigner(opts: {
  transportPubkey: string
  port: number
  isInitialConnection?: boolean
}): Promise<{ signer: BunkerSigner; pubkey: string }> {
  const { transportPubkey, port, isInitialConnection = true } = opts
  const clientKey = bytesToHex(loadOrCreateClientKey(transportPubkey))
  const signer = new BunkerSigner(clientKey)

  const relay = `ws://127.0.0.1:${port}`
  const bunkerUrl = `bunker://${transportPubkey}?relay=${encodeURIComponent(relay)}`

  // App metadata only on first connect; the signer keeps the stored name after.
  const metadata = isInitialConnection
    ? { name: CLIENT_NAME, url: safeOrigin() }
    : undefined

  const pubkey = await signer.login(bunkerUrl, isInitialConnection, metadata, APPROVE_TIMEOUT_MS)
  return { signer, pubkey }
}
