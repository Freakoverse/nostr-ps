# Client notes: the trust lens

Client-side design for spam, scam, and sybil handling in a NIP-PS client.
This is not part of the NIP-PS protocol. It describes how this client
implements the "viewpoint" from §6.2 of the spec: entirely through external
score providers, never by walking follow graphs in the browser.

## Background: Brainstorm and GrapeRank

- GrapeRank is a personalized web-of-trust algorithm. For an observer
  pubkey it walks the follow graph, treating follows as positive ratings
  and mutes and reports as negative ones, with per-hop attenuation and a
  "rigor" curve that keeps any one influencer from dominating. Output is
  one score per pubkey, 0 to 100, from that observer's perspective.
- Brainstorm is a service that runs it and publishes results as NIP-85
  `kind:30382` trusted assertions: addressable, `d` = subject pubkey,
  `rank` = 0-100, signed by a service key. It is AGPL and self-hostable.
- Brainstorm has no single key. Each account that signs up gets a
  "Brainstorm Assistant" key of its own, created and held by the instance,
  which publishes assertions computed from that account's follows and
  mutes. The account's own key signs nothing but the pointer below.
- The pointer is the user's `kind:10040` list, entries of the form
  `["30382:rank", "<assistant pubkey>", "<relay>"]`. A client reads it to
  learn which provider key, on which relay, carries that user's view.

Key fact: a 30382 assertion signed by key K is the view from one specific
observer. Adding "the Brainstorm npub" to the lens means adopting that
observer's perspective. Scores are per pubkey, never per event.

## Why providers only

The point of a provider is that the expensive part, fetching thousands of
follow lists and running the algorithm, happens once on the provider's side
and is published. A client that walks follow lists itself puts that cost on
every visitor's browser and every relay they read from, which is the load
this client is built to avoid. So the lens has exactly one source type: a
provider key plus the relay it publishes to. There is no local graph walk,
not for an operator, not for the logged-in user.

## The lens

The lens is a list of **providers**. Each yields a score in 0-100 for a
given pubkey, or "unknown" when it has no assertion for that pubkey.

Rules:

- Every provider is individually toggleable. The whole lens can be turned
  off, which yields the spec's raw view.
- Custom providers are added by pasting the provider key and, usually, the
  relay it publishes to, since Brainstorm instances serve assertions from
  their own relay rather than general-purpose ones. A person's own npub is
  not a provider; nothing is published under it.
- For a logged-in user, the client reads their `kind:10040` and, when it
  names a provider, adds that as "Your provider" at the top of the list.
  When it names none, the lens settings say so, "trust graph and provider
  not found", and explain how to get one. The client never writes a 10040
  for anyone: choosing who computes your trust stays the user's own act.
- For an anonymous user, the default lens is the built-in provider list,
  `BUILTIN_PROVIDERS` in `src/stores/lensStore.ts`. It is displayed on every
  listing and swappable without login.

## Combining providers

Each provider's score is shown on hover on the author of every claim,
review, release, and draft. For filtering, the client computes one
combined score per pubkey: **maximum across enabled providers**, so one
provider vouching is enough to surface something.

Providers with "unknown" for a pubkey do not participate. If every enabled
provider is unknown, the pubkey is "unknown", not zero. A rank of 0 with a
`hops` tag means the provider's graph reached the key and did not vouch; a
rank of 0 with no `hops` tag is treated as unknown.

## Threshold filter

One slider, 0-100, applied to the combined score of the author. Three
buckets:

- **Above threshold:** shown normally.
- **Below threshold:** folded under "low scored".
- **Unknown:** folded separately under "unscored".

Unknown is kept separate because providers only have assertions for
pubkeys inside their observer's reach, assertions refresh on a schedule,
and a brand new implementer will have no score at all. Treating unknown as
zero would hide exactly the newcomers the spec is designed to surface.
Nothing is ever removed; the spec's "filtering demotes, never hides" rule
applies, so every list offers scored, low-scored, unscored, or all.

The default threshold is 2: "vouched for at all". Unknown and muted keys
sit at no rank or 0, so 2 is the anti-spam floor; raising it demands more
than a toehold in the provider's graph.

## Feeding the spec's trust computation

Spec §6.3 weights a reviewer by their rank under the active lens:
`combined_score / 100`. Any `inaccurate` verdict from a reviewer above threshold
makes a claim contested and not confirmed.

## Badge and provenance

- The badge shows the combined score and, on hover, one line per provider:
  its label, the score it gave, and when the scores were fetched.
- This is the same provenance rule as spec §6.7. A score with no visible
  source is an authority; a score with a visible source is a setting.

## Caveats

- Freshness: assertions are republished on a schedule, not on demand, so
  new npubs lag. Unknown-bucket handling covers this.
- Coverage: a provider scores only what its observer's graph reaches.
- Centralization: a hosted provider is one service. Keep the list
  pluggable; add instances as they appear.
- Perspective confusion: make clear in the UI whose perspective a provider
  key represents. "Brainstorm" is not a perspective; "Brainstorm computed
  for npubX" is, which is why the built-in row is labelled with the name.

## Implementation (this client)

- `src/stores/lensStore.ts`: providers, scoring, buckets, the own-provider
  lookup from `kind:10040`. Combination is max. `BUILTIN_PROVIDERS` is the
  anonymous default.
- `src/components/lens/TrustBadge.tsx`: the per-pubkey pill with per-provider
  provenance on hover.
- `src/components/lens/LensBar.tsx`: the always-visible viewpoint line on
  every listing, with the lens menu (master switch, per-provider switches,
  Manage) and the threshold.
- `src/components/lens/TieredList.tsx`: the score filter and folds.
- `src/components/lens/LensSettings.tsx`: Settings → Lens, including the
  "Your provider" card and the how-to for getting one.

## Default provider

The client ships one provider enabled by default: nosfabrica's Brainstorm
Assistant (`npub10rkssdlt5zazgsuyr9wwg8f2y9t4ga4gax0y8updd6tjnpsw98nqm9l467`),
read from `wss://nip85.brainstorm.world`. It is one viewpoint among possible
many, chosen because it exists and publishes today. Anyone can switch it off
in the lens menu, and more instances are added to `BUILTIN_PROVIDERS` as they
appear.
