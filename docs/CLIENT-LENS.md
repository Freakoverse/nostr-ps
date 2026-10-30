# Client notes: the trust lens

Client-side design for spam, scam, and sybil handling in a NIP-PS client.
This is not part of the NIP-PS protocol. It describes how a client builds
the "viewpoint" from §6.2 of the spec using external score providers in
addition to locally computed graph distance.

## Background: Brainstorm and GrapeRank

- GrapeRank is a personalized web-of-trust algorithm. For an observer
  pubkey it walks the follow graph, treating follows as positive ratings
  and mutes and reports as negative ones, with per-hop attenuation and a
  "rigor" curve that keeps any one influencer from dominating. Output is
  one score per pubkey, 0 to 100, from that observer's perspective.
- Brainstorm is a service that runs it and publishes results as NIP-85
  `kind:30382` trusted assertions: addressable, `d` = subject pubkey,
  `rank` = 0-100, signed by a service key. One service key per perspective.
- Clients discover which service key to read through the user's
  `kind:10040` list, entries of the form
  `["30382:rank", "<service pubkey>", "<relay>"]`.
- The NosFabrica hosted instance exposes an HTTP API to request a
  calculation for a pubkey, with presets (default, permissive,
  restrictive). It is AGPL and self-hostable.

Key fact: a 30382 assertion signed by key K is the view from one specific
observer. Adding "the Brainstorm npub" to the lens means adopting that
observer's perspective. Scores are per pubkey, never per event.

## The lens

The lens is an ordered list of **sources**. Each source yields a score in
0-100 for a given pubkey, or "unknown".

| Source type            | How the score is produced                                  |
|------------------------|------------------------------------------------------------|
| NIP-85 provider        | Fetch `kind:30382` with `d` = pubkey from the service key   |
| Graph viewpoint        | Local computation from an npub's `kind:3` and `kind:10000` per spec §6.3, mapped to 0-100 |
| Own graph              | Same as graph viewpoint, using the logged-in user's npub    |

Rules:

- Every source is individually toggleable. The whole lens can be turned
  off, which yields the spec's raw view.
- Custom sources are added by pasting any npub. The client detects whether
  that npub publishes 30382 assertions (provider) or should be treated as a
  graph viewpoint, and lets the user override.
- For a logged-in user, the client SHOULD: read their 10040 list and
  pre-populate providers from it; offer to request a fresh calculation
  from a known provider for their pubkey; add "own graph" as a source.
- For an anonymous user, the default lens contains the operator's chosen
  provider key and/or the operator's npub as a graph viewpoint, exactly as
  the spec's anonymous default viewpoint. It is displayed and swappable
  without login.

## Combining sources

Each source's score is shown as its own badge on the author of every
claim, review, release, and draft. For filtering, the client computes one
combined score per pubkey. Policy is configurable; recommended default is
**maximum across enabled sources**, so one source vouching is enough to
surface something. Alternatives: average, or "own graph wins when
present".

Sources with "unknown" for a pubkey do not participate in the combination.
If every enabled source is unknown, the pubkey is "unknown", not zero.

## Threshold filter

One slider, 0-100, applied to the combined score of the author. Three
buckets:

- **Above threshold:** shown normally.
- **Below threshold:** collapsed under "N low-trust items, show".
- **Unknown:** collapsed separately under "N unscored items, show".

Unknown is kept separate because providers only have assertions for
pubkeys inside their computed graph, assertions refresh every few hours,
and a brand new implementer will have no score at all. Treating unknown as
zero would hide exactly the newcomers the spec is designed to surface.
Nothing is ever removed; the spec's "filtering demotes, never hides" rule
applies.

## Feeding the spec's trust computation

Spec §6.3 weights a review by graph distance (1.0 at distance 1, 0.5 at
distance 2). With a lens active, replace the distance weight with
`combined_score / 100` of the reviewer. Keep the override that any `fake`
verdict from a reviewer above threshold makes a claim unverified.

## Badge and provenance

- The badge shows the combined score and, on hover or tap, one line per
  source: provider name or npub, the score it gave, and when its assertion
  was published.
- Clicking through shows the raw 30382 event or, for a graph viewpoint,
  the path (who follows whom) that produced the local score.
- This is the same provenance rule as spec §6.7. A score with no visible
  source is an authority; a score with a visible source is a setting.

## Caveats

- Freshness: assertions are republished on a schedule, not on demand, so
  new npubs lag. Unknown-bucket handling covers this.
- Coverage: a provider scores only what its observer's graph reaches.
- Centralization: a hosted provider is one service. Keep it pluggable and
  never the only path; local graph viewpoints must always work without it.
- Perspective confusion: make clear in the UI whose perspective a provider
  key represents. "Brainstorm" is not a perspective; "Brainstorm computed
  for npubX" is.

## Implementation (this client)

- `src/stores/lensStore.ts`: sources, scoring, buckets. Graph sources are
  computed locally (follows 100, follows-of-follows 50, muted 0); NIP-85
  sources read kind 30382 by `d` = subject from the provider key. Combination
  is max. The "own graph" row is added on login and removed on logout.
- `src/components/lens/TrustBadge.tsx`: the per-pubkey pill with per-source
  provenance on hover.
- `src/components/lens/LensBar.tsx`: the always-visible viewpoint line on
  every listing, with the master switch and threshold.
- `src/components/lens/TieredList.tsx`: above / below / unknown folds.
- `src/components/lens/LensSettings.tsx`: Settings → Lens.

Defaults: the operator graph (`ADMIN_PUBKEY` in `src/lib/constants.ts`) is the
only built-in source. No NIP-85 provider ships enabled; the user pastes a
provider key (for example a Brainstorm instance's service key) in Settings.

## Default provider

The client ships one NIP-85 source enabled by default: nosfabrica's
Brainstorm Assistant (`npub10rkssdlt5zazgsuyr9wwg8f2y9t4ga4gax0y8updd6tjnpsw98nqm9l467`),
read from `wss://nip85.brainstorm.world`. Brainstorm has no single key: every
account gets an assistant that publishes `kind:30382` from that account's
vantage point, so this is one viewpoint among possible many, chosen because
it exists and publishes today. It is a built-in row: anyone can switch it off
in the lens menu, and more instances are added to `BUILTIN_PROVIDERS` in
`src/stores/lensStore.ts` as they appear. The point of leaning on a provider
rather than a local graph walk is that the trust computation runs on the
provider's side, not in every visitor's browser.
