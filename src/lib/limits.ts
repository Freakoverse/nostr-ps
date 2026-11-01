/**
 * Character and count limits for everything this client publishes.
 *
 * Relays commonly cap events at 64 KB. The largest things we publish are a
 * release body and a backup that wraps a whole release as JSON (so roughly
 * body + tags, escaped twice). Measured with every other field at its limit,
 * a 45,000-character English body makes a 48 KB release and a 49 KB backup;
 * a spec full of JSON examples reaches about 53 KB for the backup. The only
 * body that still breaks 64 KB is one that is nearly all quotes or three-byte
 * punctuation, which no real spec is. Everything else is small.
 */
export const LIMITS = {
  /** Draft and release title. */
  title: 150,
  /** Draft and release summary. */
  summary: 500,
  /** Draft and release markdown body. */
  body: 45_000,
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
