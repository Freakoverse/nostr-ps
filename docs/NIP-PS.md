# NIP-PS: Permissionless Standards

`draft` `optional`

A framework for publishing, discovering, implementing, and evaluating Nostr
protocol standards without centralized approval.

Anyone may propose a standard. No proposal is inherently "official." The
relevance of a standard emerges from observed adoption, implementation
claims, and reviews, all read through the trust graph of whoever is looking.

---

## 1. Motivation

The `nostr-protocol/nips` repository is a single merge queue. Whether a
proposal exists there is decided by a small set of maintainers, and "being
in the repo" is treated by the ecosystem as a proxy for "being a standard."

That proxy is wrong in both directions. Specs in the repo have no
implementations. Specs outside the repo run in production. The question
people actually have, "if I implement this, will it interoperate with the
software my users run," is not answered by the repo at all.

NIP-PS does not establish standards. It establishes a common information
layer from which standards can emerge. It turns the standards registry from
an editorial queue into an observable market of implementations. The market
is the evidence, not the governing body.

Three layers:

1. **Adoption is the primary signal.** Who implemented it, at which version,
   and how much traffic those implementations produce.
2. **Trust is the filter.** Reviews only matter from pubkeys inside the
   viewer's own graph, or a graph the viewer chose to look through.
3. **Verification is human.** The system surfaces evidence. The viewer
   decides what is real and adjusts their graph accordingly.

Observe → filter → investigate → verify → trust → adopt.

---

## 2. Design principles

- **NIP-PS establishes no standards.** It provides an information layer:
  drafts, releases, adoption claims, reviews, and observed usage. Whether
  something is a standard is a conclusion the reader draws from that layer.
  There is no constitutional layer above it: no body that decides, no list
  of people whose opinion counts by default.
- **Every ranking is a viewpoint.** There is no global truth in NIP-PS, only
  views. Every computed ranking is relative to a pubkey's graph, including
  the trust graph itself, which is a lens and not governance. The viewpoint
  in use MUST be displayed and MUST be changeable, including by users who
  are not logged in.
- **No global authority.** There is no default "official" set, no global
  proposal numbering, and no role that can hide a proposal or a claim.
- **Nothing is invisible.** Filtering demotes and collapses. It never
  removes. A viewer with filtering off sees the raw market.
- **Releases are immutable.** A released version is a regular event. It
  cannot be edited. Any change is a new version with a new event id, so an
  implementer can always say exactly what they implemented.
- **Provenance over policy.** Every "verified" or "recommended" mark shown
  to a viewer MUST be explainable: "because npubX, whom you follow, reviewed
  it." Thresholds and weights are client policy, not protocol.
- **Graph owners are responsible for their graph.** The spec does not
  prevent infiltration of a trust graph. It makes infiltration visible so
  the owner can unfollow. Recomputation is live, so one unfollow collapses
  every mark that depended on that pubkey.
- **Plain Nostr data.** Everything is a signed event on relays. No
  NIP-PS-specific server is required. Any indexer can be replaced.

---

## 3. Identity and naming

A proposal is identified by `(author pubkey, uuid)`. A specific release of
it is identified by `(author pubkey, uuid, version)`, and concretely by the
release event's id.

- `uuid` is a random identifier chosen when the draft is created. It MUST
  NOT be derived from the title: deriving it leaks the title before
  publication, invites collisions, and enables squatting.
- `version` is a dotted sequence of non-negative integers, e.g. `1`,
  `1.1`, `2`. Components are compared numerically, left to right.
- The pair `uuid:version` is the **spec id**. It is carried in a
  single-letter tag so relays index it.
- Titles are labels, not identifiers. Two authors may publish proposals with
  the same title. They are different proposals.
- Global numbering is explicitly out of scope. Assigning numbers is the
  authority problem in disguise.

The human rendering of a release is:

> `<title>` v`<version>` by `<author>` (`<release event id>`)

Clients SHOULD render it that way and MUST NOT render a proposal as if it
had a global number.

---

## 4. Events

Kind numbers marked provisional MUST be checked against the current kind
registry before this spec is finalized. Kind `30817` is already in use by an
existing NIP directory for exactly the draft semantics described here and
is reused deliberately (§10).

| Kind    | Type        | Purpose                                | Status      |
|---------|-------------|----------------------------------------|-------------|
| `30817` | addressable | Draft                                  | existing    |
| `1111`  | regular     | Discussion on a draft (NIP-22)         | existing    |
| `8201`  | regular     | Release (immutable version)            | provisional |
| `8202`  | regular     | Backup of a release                    | provisional |
| `30851` | addressable | Adoption claim                         | provisional |
| `30852` | addressable | Review (of a release or of a claim)    | provisional |

The spec-id tag is `v`. Its value is `<uuid>:<version>`. The lineage tag
on releases is `o`, with the value `original` or `updated`.

### 4.1 Draft (`kind:30817`)

The working document. Addressable so the author can edit it freely during
discussion. Experimental implementations of a draft are expected and
encouraged (§5.1), but no adoption claim can reference a draft; claims
reference releases only.

```jsonc
{
  "kind": 30817,
  "pubkey": "<author>",
  "content": "<markdown body>",
  "tags": [
    ["d", "<uuid>"],                       // REQUIRED, random
    ["title", "<human title>"],            // REQUIRED
    ["k", "<kind number>", "<name>"],      // OPTIONAL, repeatable: kinds the spec defines or uses
    ["t", "<topic>"],                      // OPTIONAL, repeatable
    ["status", "review"],                  // RECOMMENDED, always "review": a draft is a draft
    ["fork", "<parent release id>", "<relay>"],   // OPTIONAL, advisory: this draft forks that release
    ["nonce", "<n>", "<difficulty>"]       // RECOMMENDED, NIP-13
  ]
}
```

Rules:

- `d` is the proposal's `uuid` for its whole life, including every release.
- Discussion happens in `kind:1111` comments (NIP-22) rooted at the draft's
  address.
- **A draft carries no record of its releases.** Publishing a release does
  not modify the draft: the draft is not republished, its `status` stays
  `review`, and no tag on it points at any release. Whether a proposal has
  been released is a fact about `kind:8201` events, and clients learn it
  only by querying for them (§6.1), never by reading a label on the draft.
  This keeps every fact stored in exactly one place, so a deleted or
  unreachable release cannot leave a stale claim behind on the draft.
- A draft MAY continue to be edited after a release, as the working copy
  for the next version.
- **Deleting a draft.** Because a draft is addressable, the author retracts
  it by republishing the address with empty content and a
  `["deleted", "true"]` tag, and SHOULD also send a NIP-09 deletion
  request. The replacement reaches relays that ignore NIP-09, which is
  why both are sent. Clients MUST NOT render a draft whose current event
  carries the `deleted` tag, in listings or on its own page. The same
  convention applies to every addressable NIP-PS event; a release is a
  regular event and cannot be retracted this way (§4.2, §7).
- `fork` is an advisory hint that this draft was forked from a release. It
  carries no identity; the release form reads it to set the `fork` marker on
  the first release (§4.2). Clients MUST NOT treat it as ancestry on its own.

### 4.2 Release (`kind:8201`)

An immutable version of a proposal. This is what implementers implement
against and what claims reference.

```jsonc
{
  "kind": 8201,
  "pubkey": "<author>",
  "content": "<markdown body, the complete spec text>",
  "tags": [
    ["v", "<uuid>:<version>"],                        // REQUIRED, spec id
    ["a", "30817:<author>:<uuid>", "<relay>"],        // RECOMMENDED, the draft
    ["title", "<human title>"],                       // REQUIRED
    ["summary", "<one paragraph>"],                   // RECOMMENDED
    ["k", "<kind number>", "<name>"],                 // OPTIONAL, repeatable
    ["t", "<topic>"],                                 // OPTIONAL, repeatable
    ["o", "original"],                                // REQUIRED, "original" or "updated"

    ["e", "<previous release id>", "<relay>", "prev"],   // OPTIONAL, previous version
    ["e", "<parent release id>", "<relay>", "fork"],     // OPTIONAL, forked from
    ["p", "<parent author>", "<relay>"],                 // OPTIONAL, with fork

    ["nonce", "<n>", "<difficulty>"]                  // RECOMMENDED, NIP-13
  ]
}
```

Rules:

- A release is a regular event and is therefore immutable. There are no
  non-normative edits. A typo fix is a new version (`1` → `1.1`).
- `v` MUST be present and MUST be unique per author. If an author publishes
  two releases with the same `v`, clients SHOULD treat the one referenced by
  adoption claims as canonical and flag the duplicate. There is no
  "oldest wins" rule: `created_at` is set by the signer and is not evidence.
- `prev` links versions into a chain. The chain is informational; each
  release stands alone.
- `o` marks where a release sits in its lineage: `original` on the first
  release of a uuid (the one with no `prev`), `updated` on every later
  version. Exactly one release per uuid is `original`; a fork's first
  release is `original` for its own uuid. The tag exists so that relays
  can answer "one event per proposal": a `#o` filter for `original`
  returns one release per uuid regardless of how many versions exist,
  which keeps listing and detection queries bounded (see §6.1). The
  `prev` chain remains the ground truth; a client that finds the two in
  conflict trusts the chain. Mislabeling buys nothing: an `original` on
  every version is deduplicated by uuid, and a missing tag only removes
  that proposal from filtered listings.
- `fork`: a fork is a **new proposal** with a **new uuid**, published by
  anyone, whose `e` tag with the `fork` marker points at the exact release
  it was derived from. A fork MUST NOT reuse the parent's uuid. Two
  diverging lineages sharing one uuid would be undisambiguable by name.
- `content` is the complete spec text. A release MUST be readable without
  fetching the draft.

### 4.3 Backup (`kind:8202`)

A copy of a release, wrapped and signed by anyone, so that the release
survives relay loss and the author's own deletion requests.

```jsonc
{
  "kind": 8202,
  "pubkey": "<anyone>",
  "content": "<the complete release event as a JSON string, signature included>",
  "tags": [
    ["e", "<release event id>", "<relay>"],   // REQUIRED, the event being backed up
    ["k", "8201"],                            // REQUIRED
    ["v", "<uuid>:<version>"]                 // RECOMMENDED, copied from the release
  ]
}
```

Rules:

- Clients MUST verify the embedded event's id and signature before using
  it. The wrapper's author is irrelevant to the release's validity.
- A backup has its own id and author, so a NIP-09 deletion of the release
  does not reach it. This is the point.
- A dedicated kind is used rather than a generic repost so that backups do
  not appear in social feeds.
- Any party MAY publish backups. Indexers and implementers SHOULD back up
  every release they rely on.

### 4.4 Adoption claim (`kind:30851`)

"We implement `<title>` v`<version>` by `<author>` (`<release id>`)."
Published by the implementer. Addressable so the implementer can move to a
newer version or withdraw.

```jsonc
{
  "kind": 30851,
  "pubkey": "<implementer>",
  "content": "<optional notes: scope, caveats, partial support>",
  "tags": [
    ["d", "<uuid>"],                                  // REQUIRED, one claim per proposal
    ["e", "<release event id>", "<relay>"],           // REQUIRED, exact release implemented
    ["v", "<uuid>:<version>"],                        // REQUIRED, spec id of that release
    ["p", "<release author>", "<relay>"],             // REQUIRED

    ["role", "client"],                               // REQUIRED: client | relay | library | service
    ["name", "<software name>"],                      // REQUIRED
    ["impl_version", "<software version or commit>"], // RECOMMENDED
    ["r", "<url to source, commit, or release>"],     // RECOMMENDED, repeatable

    // Link to the thing that actually produces traffic. RECOMMENDED.
    ["handler", "31990:<pubkey>:<d>"],    // clients: NIP-89 handler event
    ["relay", "wss://..."],               // relays: the relay URL; NIP-11 pubkey SHOULD match
    ["repo", "30617:<pubkey>:<d>"],       // libraries: NIP-34 repository announcement

    ["scope", "full"],                    // OPTIONAL: full | partial, default full
    ["withdrawn"],                        // OPTIONAL, presence retracts the claim
    ["nonce", "<n>", "<difficulty>"]      // RECOMMENDED, NIP-13
  ]
}
```

Rules:

- `d` is the proposal uuid, so each implementer has exactly one live claim
  per proposal. Moving from v2 to v3 replaces the claim. A fork has its own
  uuid and therefore its own claim.
- `e` is REQUIRED and is the identity of what was implemented. `v` and `p`
  duplicate information derivable from the release so that claims can be
  queried by spec id and by author without fetching every release.
- To retract, republish with a `withdrawn` tag. NIP-09 deletion MAY also be
  sent, but clients MUST honor `withdrawn` regardless, since deletion
  propagation is unreliable.
- For `role: relay`, the claim SHOULD be signed by the pubkey in the relay's
  NIP-11 document. Clients MAY cross-check.
- For `role: client`, `handler` SHOULD point at the software's NIP-89
  event. This is what lets usage observation (§6.4) attribute traffic to
  the claim.
- A claim is a statement by its author and nothing more. Publishing one
  does not make it true.

### 4.5 Review (`kind:30852`)

One person's opinion about one target. Addressable so there is exactly one
opinion per reviewer per target, revisable in place. The target is either a
release or an adoption claim, and the vocabulary differs by target so that
the two meanings never blur.

**Reviewing a release:** "Is this spec good?"

```jsonc
{
  "kind": 30852,
  "pubkey": "<reviewer>",
  "content": "<reasoning, review, test notes>",
  "tags": [
    ["d", "<release event id>"],                      // REQUIRED, the target
    ["e", "<release event id>", "<relay>"],           // REQUIRED
    ["k", "8201"],                                    // REQUIRED, target kind
    ["v", "<uuid>:<version>"],                        // RECOMMENDED
    ["p", "<release author>", "<relay>"],             // RECOMMENDED
    ["verdict", "recommend"],                         // REQUIRED: recommend | not-recommend | unsure
    ["nonce", "<n>", "<difficulty>"]                  // RECOMMENDED, NIP-13
  ]
}
```

**Reviewing an adoption claim:** "Is this implementation real?"

```jsonc
{
  "kind": 30852,
  "pubkey": "<reviewer>",
  "content": "<what was checked and how>",
  "tags": [
    ["d", "30851:<implementer>:<uuid>"],              // REQUIRED, the target coordinate
    ["a", "30851:<implementer>:<uuid>", "<relay>"],   // REQUIRED
    ["k", "30851"],                                   // REQUIRED, target kind
    ["p", "<implementer>", "<relay>"],                // RECOMMENDED
    ["verdict", "legit"],                             // REQUIRED: legit | fake
    ["nonce", "<n>", "<difficulty>"]                  // RECOMMENDED, NIP-13
  ]
}
```

Rules:

- `d` is the target's identifier, so a reviewer's opinion on a given target
  is a single replaceable event. Changing your mind is a republish, not a
  deletion.
- Release verdicts are `recommend`, `not-recommend`, `unsure`. `unsure`
  distinguishes "reviewed, no verdict" from silence.
- Claim verdicts are `legit`, `fake`. There is no middle option; an
  unchecked claim is simply unreviewed.
- Clients MUST NOT infer a claim verdict from a release verdict or vice
  versa. Disliking a spec says nothing about whether an implementer exists.
  Verifying an implementer says nothing about whether the spec is good.
- A review targets a specific release. Clients MAY roll release reviews up
  per proposal for display, but the underlying data stays per version.

---

## 5. Versions and forks

- **Drafts are mutable, releases are not.** The draft is the working copy.
  Each release is a frozen snapshot with its own event id.
- **A new version is a new release event.** Claims against v2 stay against
  v2. Adoption is tracked per release AND rolled up per proposal.
- **Versions do not crowd out proposals.** Because only the first release
  of a uuid carries `["o", "original"]`, a listing query can ask for one
  event per proposal and a prolific author's version history costs other
  proposals nothing.
- **A fork is a new proposal.** New uuid, any author, `fork` marker on an
  `e` tag pointing at the exact parent release. Nothing about the parent
  changes.
- **Competing variants are expected.** Two forks of the same idea can both
  accumulate claims. The market view shows them side by side. The spec has
  no opinion on which wins.
- **Author disputes do not exist.** Identity includes the author pubkey, so
  "who owns this proposal" is not a question.

Rollup rule for clients: the adoption figure for a proposal is the number of
distinct implementer pubkeys with a live, non-withdrawn claim against ANY
release of that uuid, shown alongside a per-version breakdown. Rolling up
prevents a version bump from splitting a spec's signal.

### 5.1 When to release (guidance)

A release is a commitment: it is immutable, implementers build against it
by event id, and every correction afterwards is a new version that splits
the adoption signal until implementers migrate. Releasing early therefore
costs more than it appears to.

Authors are advised to keep a proposal in draft until it has been used in
the field for a while. Experimental implementations against a draft are the
point of the draft stage: they are where use-case gaps, UX problems, and
security holes show up, and the draft is adjusted in place as they do,
with discussion in `kind:1111` comments. Those experimental implementations
are coordinated socially and are not counted as adoption, since there is
nothing immutable for a claim to point at yet.

The signal that a draft is ready is that it has stopped changing: the
known problems have been considered, implementations have converged, and
edits have tapered off. At that point the author has high confidence the
text is stable, and publishes the release. Implementers then move their
experimental support to a claim against that release.

This is advice, not a rule. Nothing in the protocol prevents an author from
releasing on day one. The cost of doing so is borne by the author, in the
form of a version history that the market will see.

---

## 6. Client behavior

Everything in this section is computed client-side from public events.
Numbers here (distances, weights, thresholds) are RECOMMENDED defaults, not
protocol.

### 6.1 Draft and release detection

For a draft at `30817:<author>:<uuid>`, clients detect releases by querying
`kind:8201` events from `<author>` whose `a` tag references that address,
or whose `v` tag begins with `<uuid>:`. The draft itself says nothing
about this (§4.1), so the query is the only source. A draft view SHOULD
show that the check is in progress, then either that no release exists or
a link to the latest version. A draft listing MAY mark released drafts
using the bounded query below. In every case the mark is the result of a
query, never of a label on the draft.

Clients SHOULD bound these queries with the `o` tag. Detecting releases
for a list of drafts is one query: `kind:8201`, `#a` set to the draft
addresses, `#o` set to `original`, which yields at most one event per
draft. Listing proposals is `kind:8201` with `#o` set to `original`,
which yields one event per proposal; the latest version of each is then
fetched per proposal with a limit of 1, so a page costs page-size bodies
rather than all-versions bodies. Releases published without the `o` tag
are only reachable by unfiltered queries; clients MAY keep that path as
a fallback.

### 6.2 Viewpoint

A **viewpoint** is a pubkey whose graph is used as the lens for trust
computation. It is a setting, not a role.

What is read from the viewpoint pubkey `V`:

- `V`'s follow list (`kind:3`) as the distance-1 trusted set, optionally
  extended to distance 2
- `V`'s mute list (`kind:10000`) as exclusions
- `V`'s own `kind:30852` reviews as strong votes

Every client MUST:

- display the active viewpoint at all times, e.g. "Viewing as: `<npub>`"
- let the user change it to any pubkey, with or without holding its keys,
  whether or not they are logged in
- let the user turn it off entirely

Modes:

| Mode             | Trusted set                                      |
|------------------|--------------------------------------------------|
| Off              | none; raw view (§6.5)                            |
| Viewpoint only   | the chosen pubkey's graph                        |
| Own only         | the logged-in user's graph                       |
| Both             | union of the two                                 |

For anonymous users the default viewpoint is the app operator's pubkey.
This default is structurally a default authority. Visibility and one-click
replacement are what keep it a setting instead of a gate.

### 6.3 Trust computation

Given the trusted set derived from the active mode:

1. **Distance.** Distance 1 is a direct follow. Distance 2 is a follow of a
   follow. Deeper is client policy.
2. **Mutes.** Muted pubkeys and their reviews are ignored entirely.
3. **Legitimacy of a claim `C`.** Collect `kind:30852` reviews targeting
   `C` from pubkeys within distance. Recommended weights:
   - `legit` from distance 1: 1.0
   - `legit` from distance 2: 0.5
   - the implementer is followed at distance 1, no explicit review: 0.5
     (weak auto-vouch; a follow is social, not an audit)
   - any `fake` from distance 1: `C` is unverified, full stop
4. **Independence.** Sum weights over DISTINCT reviewers. Fifty reviews
   from one pubkey count once. `C` is "verified" when the sum reaches a
   client-configurable threshold (recommended default: 1.0).
5. **Recommendation of a release `R`.** Count distinct `recommend`,
   `not-recommend`, and `unsure` reviewers within distance, weighted by
   distance. Displayed as its own column. Never mixed into the adoption
   count.

### 6.4 Usage observation

Claims are self-reported. Usage is not. Clients and indexers SHOULD compute,
per release, from the `k` tags on the release:

- distinct pubkeys that published events of those kinds in a rolling window
- distinct `client` tags on those events, joined against the `handler`
  tags in claims, giving "traffic attributable to this implementer"

Usage is displayed next to claim counts. In the raw view, usage is the
RECOMMENDED primary sort key, because it is the one signal that cannot be
produced by publishing more claim events.

Releases with no `k` tags have no usage signal and are ranked by claims
only. Clients SHOULD indicate this.

### 6.5 Raw view and proof of work

With viewpoint off, every non-withdrawn claim counts. This view is gameable
and the client SHOULD say so in one line.

Clients SHOULD require a minimum NIP-13 difficulty on events counted in the
raw view. PoW raises the cost of volume spam linearly; it does not stop a
motivated attacker. It is a floor for the unfiltered tier, not a defense.
Recommended default: 16 bits in raw view, 0 when a viewpoint is active,
since the graph does the work there.

All NIP-PS events SHOULD carry PoW. Addressable events re-mine on every
update, which is acceptable at modest difficulty.

### 6.6 Tiers and collapsing

With a viewpoint active, claims are split into two tiers:

- **Verified.** Claims verified per §6.3. Shown normally.
- **Unverified.** Everything else. Shown collapsed, e.g. "9 unverified
  claims, show", sorted by usage then by graph distance, so that a real
  newcomer surfaces to the top of the fold without anyone's intervention.

The unverified tier MUST be reachable. Filtering demotes; it never removes.

### 6.7 Provenance

Wherever a client shows a claim as verified, or a release as recommended,
it MUST be able to show why in terms of the active trusted set: which
pubkeys, at which distance, published which reviews.

This is how infiltration becomes visible. A graph owner who sees a cluster
of dubious implementers all traced to one voucher fixes it with one
unfollow, and every dependent mark disappears on the next render.

### 6.8 Divergence indicator

Clients SHOULD show, per release, the raw claim count next to the verified
count for the active viewpoint. A large gap ("212 claims, 4 verified") is
itself evidence of a manipulation attempt and SHOULD be visually flagged.
This makes volume attacks self-defeating: the attack is visible on the page
it was meant to distort.

---

## 7. Relay behavior

No special relay behavior is required. Relays that want to serve NIP-PS
well SHOULD:

- retain `kind:8201` and `kind:8202` indefinitely and not apply expiry
- NOT honor NIP-09 deletion requests for `kind:8201`. Releases are the
  thing implementations are built against; their disappearance is harm.
  Authors who regret a release publish a new version or a `not-recommend`
  review of their own work.
- index the `v` tag (single-letter tags are indexed per NIP-01)
- support NIP-50 search over `kind:8201` content and `title` tags

Event size: relays commonly reject events above 64 KB. A backup (§4.3) wraps
a whole release as JSON, so the release is the binding case. Clients SHOULD
cap a release body at 30,000 characters and keep tags modest (this client
uses 150 for titles, 500 for summaries, 20 topics and 30 kinds). A release
that needs more belongs split into a profile of another spec (§12).

---

## 8. Security and abuse considerations

- **Fake claims.** Free to publish. Mitigated by: PoW floor in raw view;
  usage weighting; `legit`/`fake` reviews in viewpoint views; divergence
  indicator. A rational attacker's payoff is limited to viewers with the
  viewpoint off, which is by design a small population.
- **Infiltration.** With volume attacks unprofitable, the cheapest remaining
  attack is getting real people inside a popular viewpoint's graph to vouch
  for sybils. This is slow and rate-limited by human attention. The spec
  does not prevent it; it makes it visible (§6.7) and cheap to undo (one
  unfollow). Operators of default viewpoints SHOULD use tight distance and
  explicit reviews rather than deep follow-of-follow.
- **Default viewpoint capture.** The app operator's graph is the high-value
  target. Mitigations: the viewpoint is displayed, swappable without login,
  and the operator is responsible for their own follows like any other
  graph owner.
- **Vocabulary leakage.** If release verdicts and claim verdicts shared
  words, clients would eventually blur "I dislike this spec" into "this
  implementer is a scammer." The vocabularies are disjoint for this reason
  and clients MUST NOT infer one from the other.
- **Release tampering.** Not possible: releases are regular events
  identified by id. Changing a byte changes the id, and claims point at the
  id.
- **Release deletion.** Mitigated by backups (§4.3) and relay policy (§7).
- **Author impersonation.** Not possible: identity includes the author
  pubkey. A copycat proposal is a different proposal and is displayed as
  such.
- **Timestamp games.** `created_at` is never used to resolve conflicts.
  Identity is `(pubkey, uuid, version)` and the event id.
- **Relay censorship.** A relay can drop a release. It cannot make it not
  exist. Clients SHOULD query multiple relays, honor relay hints, and fall
  back to backups.

---

## 9. Bootstrapping

An empty market ranks nothing. A NIP-PS deployment SHOULD start with:

1. **A mirror of `nostr-protocol/nips`.** Each existing NIP published as a
   `kind:8201` release by a clearly labeled mirror key, one release per
   tagged revision if practical, with `k` tags populated from the spec.
   These are ordinary releases. Clients MUST NOT render them as "official"
   or in a separate tier.
2. **Seed claims from NIP-11.** For relay-side NIPs, an indexer MAY publish
   provisional claims on behalf of relays derived from their
   `supported_nips`, signed by the indexer's key, with `scope: partial` and
   a note in `content` that the claim is derived. Relay operators SHOULD
   replace these with claims signed by their own key.
3. **Operator viewpoint.** The reference client ships with its operator's
   pubkey as the anonymous default viewpoint, displayed and swappable.

---

## 10. Interoperability

- **Drafts share `kind:30817`** with an existing NIP directory that uses
  the same addressable, random-uuid, title and `k` tag shape. Drafts
  written in either place appear in both. NIP-PS never modifies a draft
  on release, so a directory that knows nothing about releases sees
  exactly what it would have seen anyway.
- **Approval labels** published by other directories as NIP-32 `kind:1985`
  events MAY be read as weak `recommend` reviews if the namespace mapping is
  known. They are not written by NIP-PS clients.
- **Curated approver lists** published by other directories (e.g. a
  replaceable list of "expert" pubkeys) are just a hand-picked distance-1
  set. A NIP-PS client MAY offer such a list as a selectable viewpoint.
- **Third-party app compatibility ratings** published by other directories
  MAY be read as weak `legit` evidence for the corresponding claim. They
  are not implementer self-claims and MUST NOT be counted as adoption.
- **NIP-89** handler events are the join key between claims and observed
  traffic for clients.
- **NIP-11** `pubkey` is the join key for relay claims.
- **NIP-34** repository announcements are the join key for libraries.
- **NIP-51** follow sets MAY be used instead of `kind:3` for a viewpoint's
  distance-1 set, e.g. a "protocol people" set narrower than social
  follows.
- **NIP-85** trusted-assertion providers MAY be used as viewpoint sources: a
  provider's `rank` for a pubkey MAY stand in for graph distance in §6.3.
  A provider key is one observer's perspective; adopting it is a choice the
  client MUST show, like any other viewpoint.
- **NIP-22** comments are the discussion mechanism for drafts and MAY also
  be used on releases and claims.

---

## 11. Non-goals

- Deciding which proposal is correct.
- Assigning numbers or names.
- Preventing anyone from publishing anything.
- Preventing a graph owner from trusting the wrong people.
- Replacing the `nostr-protocol/nips` repository. It becomes one publisher
  among many.

---

## 12. Open questions

- Final kind numbers for `8201`, `8202`, `30851`, `30852`.
- The spec-id tag letter. `v` is chosen because it appears in no existing
  NIP (`s` is used by NIP-69, `n` by NIP-66 and NIP-87), and because `d` on
  a regular event, while harmless to relays, reads as if the event were
  addressable.
- Whether usage observation should be specified as an indexer output event
  so that clients can consume it without scanning relays themselves. Such
  an event is one more self-reported number and would need its own
  legitimacy handling.
- Whether a release SHOULD be allowed without a prior draft.
- How to represent a proposal that is only a profile of another
  (e.g. "spec X as used by project Y").
