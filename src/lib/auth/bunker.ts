/**
 * NIP-46 Bunker Signer: Login via bunker:// URL
 * Ported from Jumble's bunker.signer.ts
 *
 * Uses nostr-tools BunkerSigner to connect to a remote signer
 * via a bunker:// URL (e.g., from nsecBunker).
 */

import { generateSecretKey, getPublicKey } from 'nostr-tools'
import { BunkerSigner as NBunkerSigner, parseBunkerInput } from 'nostr-tools/nip46'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
import { StorageKey } from '@/lib/constants'

// Cap the initial handshake so an unreachable relay or an offline/unapproved
// signer surfaces an error instead of spinning "Connecting…" forever.
const CONNECT_TIMEOUT_MS = 30_000
const PUBKEY_TIMEOUT_MS = 15_000

// ─── Per-signer client key ──────────────────────────────────────────
//
// In NIP-46 a connection and its stored approval are keyed by the CLIENT
// pubkey, not by the bunker string. A client that mints a fresh key per login
// looks like a new client every time: the signer re-prompts and its connected-
// apps list fills with duplicates. So we persist ONE client key per signer,
// keyed by the signer pubkey the bunker URL addresses, and reuse it on every
// later login — and it must survive logout, or the bug returns.

/** The signer (remote) pubkey a bunker:// URL addresses, or null if unparseable. */
export async function bunkerSignerPubkey(bunkerUrl: string): Promise<string | null> {
  try {
    const bp = await parseBunkerInput(bunkerUrl)
    return bp?.pubkey ?? null
  } catch {
    return null
  }
}

const bunkerKeyStorageKey = (signerPubkey: string) => StorageKey.BUNKER_CLIENT_KEY_PREFIX + signerPubkey

/** The stored client key for a signer, or null — never creates one. */
export function loadBunkerClientKey(signerPubkey: string): string | null {
  try {
    const s = localStorage.getItem(bunkerKeyStorageKey(signerPubkey))
    if (s && /^[0-9a-f]{64}$/i.test(s)) return s
  } catch { /* ignore */ }
  return null
}

export function saveBunkerClientKey(signerPubkey: string, clientKey: string): void {
  try { localStorage.setItem(bunkerKeyStorageKey(signerPubkey), clientKey) } catch { /* ignore */ }
}

/** Load the persistent client key for a signer, creating and persisting one the first time. */
export function loadOrCreateBunkerClientKey(signerPubkey: string): string {
  const existing = loadBunkerClientKey(signerPubkey)
  if (existing) return existing
  const key = bytesToHex(generateSecretKey())
  saveBunkerClientKey(signerPubkey, key)
  return key
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ])
}

export class BunkerSigner {
  signer: NBunkerSigner | null = null
  private clientSecretKey: Uint8Array
  private pubkey: string | null = null

  constructor(clientSecretKey?: string) {
    this.clientSecretKey = clientSecretKey ? hexToBytes(clientSecretKey) : generateSecretKey()
  }

  /**
   * Login with a bunker:// URL.
   * @param bunker - bunker:// URL string
   * @param isInitialConnection - whether to send the connect handshake
   * @param metadata - optional app metadata ({name, url, image}) sent as an extra
   *   `connect` param so the signer can label the connection with a real app name
   *   instead of a raw key or origin. Advisory and display-only; sent only on the
   *   initial connect (the signer keeps the stored name on reconnect). Standard
   *   `connect()` carries no such field, so we issue the request directly.
   * @param connectTimeoutMs - override for the connect handshake timeout, e.g. a
   *   longer window when the user must approve in a local signer's own UI.
   * @returns The user's Nostr pubkey
   */
  async login(
    bunker: string,
    isInitialConnection = true,
    metadata?: Record<string, unknown>,
    connectTimeoutMs = CONNECT_TIMEOUT_MS,
  ): Promise<string> {
    const bunkerPointer = await parseBunkerInput(bunker)
    if (!bunkerPointer) {
      throw new Error('Invalid bunker URL')
    }

    this.signer = NBunkerSigner.fromBunker(this.clientSecretKey, bunkerPointer, {
      onauth: (url) => {
        window.open(url, '_blank')
      },
    })

    if (isInitialConnection) {
      const handshake = metadata
        ? this.signer.sendRequest('connect', [
            bunkerPointer.pubkey,
            bunkerPointer.secret || '',
            JSON.stringify(metadata),
          ]).then(() => undefined)
        : this.signer.connect()
      await withTimeout(
        handshake,
        connectTimeoutMs,
        'Signer did not respond — make sure it is online and approve the connection request',
      )
    }

    this.pubkey = await withTimeout(
      this.signer.getPublicKey(),
      PUBKEY_TIMEOUT_MS,
      'Signer connected but did not return your public key in time',
    )
    return this.pubkey
  }

  async getPublicKey(): Promise<string> {
    if (!this.signer) throw new Error('Not logged in')
    if (!this.pubkey) {
      this.pubkey = await this.signer.getPublicKey()
    }
    return this.pubkey
  }

  async signEvent(draftEvent: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.signer) throw new Error('Not logged in')
    return this.signer.signEvent(draftEvent as any) as any
  }

  async nip04Encrypt(pubkey: string, plainText: string): Promise<string> {
    if (!this.signer) throw new Error('Not logged in')
    return this.signer.nip04Encrypt(pubkey, plainText)
  }

  async nip04Decrypt(pubkey: string, cipherText: string): Promise<string> {
    if (!this.signer) throw new Error('Not logged in')
    return this.signer.nip04Decrypt(pubkey, cipherText)
  }

  /**
   * NIP-04 encrypt/decrypt object for ISigner interface.
   */
  get nip04() {
    return {
      encrypt: (pubkey: string, plaintext: string) => this.nip04Encrypt(pubkey, plaintext),
      decrypt: (pubkey: string, ciphertext: string) => this.nip04Decrypt(pubkey, ciphertext),
    }
  }

  async nip44Encrypt(pubkey: string, plainText: string): Promise<string> {
    if (!this.signer) throw new Error('Not logged in')
    return this.signer.nip44Encrypt(pubkey, plainText)
  }

  async nip44Decrypt(pubkey: string, cipherText: string): Promise<string> {
    if (!this.signer) throw new Error('Not logged in')
    return this.signer.nip44Decrypt(pubkey, cipherText)
  }

  /**
   * NIP-44 encrypt/decrypt object: for NIP-17 DM support
   */
  get nip44() {
    return {
      encrypt: (pubkey: string, plaintext: string) => this.nip44Encrypt(pubkey, plaintext),
      decrypt: (pubkey: string, ciphertext: string) => this.nip44Decrypt(pubkey, ciphertext),
    }
  }

  getClientSecretKey(): string {
    return bytesToHex(this.clientSecretKey)
  }

  getClientPublicKey(): string {
    return getPublicKey(this.clientSecretKey)
  }

  close(): void {
    this.signer = null
    this.pubkey = null
  }
}
