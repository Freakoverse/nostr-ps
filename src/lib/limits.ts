/**
 * Character and count limits for everything this client publishes.
 *
 * Relays commonly cap events at 64 KB. The largest things we publish are a
 * release body and a backup that wraps a whole release as JSON (so roughly
 * body + tags, escaped). 30,000 characters of body leaves comfortable room
 * for tags, a summary, and the JSON wrapping. Everything else is small.
 */
export const LIMITS = {
  /** Draft and release title. */
  title: 150,
  /** Draft and release summary. */
  summary: 500,
  /** Draft and release markdown body. */
  body: 30_000,
  /** Hashtag count and length (`t` tags). */
  topics: 20,
  topicLength: 40,
  /** Kind count and the optional name on each (`k` tags). */
  kinds: 30,
  kindNameLength: 40,
  /** NIP-22 comment and reply. */
  comment: 7_500,
  /** Review reasoning or evidence. */
  review: 5_000,
  /** Adoption claim fields. */
  claimName: 80,
  claimVersion: 80,
  claimNotes: 1_000,
  claimUrls: 10,
  claimUrlLength: 300,
} as const
