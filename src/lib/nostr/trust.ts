/**
 * Spec §6.3, trust computation, as one place both the release page and the
 * claim dialog read from.
 *
 * A reviewer's weight is `rank / 100` when their rank clears the threshold,
 * otherwise 0 (they are shown, folded, but do not count). With the lens off
 * every reviewer weighs 1: the raw view.
 */
import type { Review } from './nipps'

/** Reviewer weight under the active lens: rank/100 above threshold, 0 below or unknown, 1 when the lens is off. */
export type WeightOf = (pubkey: string) => number

export interface ClaimVerdictStats {
  /** Distinct counted reviewers saying legit / fake (weight > 0). */
  legit: number
  fake: number
  /** Sum of weights over distinct counted legit reviewers. */
  legitWeight: number
  /** A counted reviewer said fake: the claim is unverified, full stop. */
  disputed: boolean
  /** legitWeight reached the threshold and nobody counted said fake. */
  verified: boolean
  /** Reviewers that exist but did not count (below threshold or unknown). */
  uncounted: number
}

/** Recommended default: one reviewer ranked 50 or better, or a few partially trusted ones. The lens store holds the live value. */
export const VERIFY_SUM_THRESHOLD = 0.5

export function verifyClaim(reviews: Review[], weightOf: WeightOf, sumThreshold = VERIFY_SUM_THRESHOLD): ClaimVerdictStats {
  // One vote per reviewer: the newest verdict wins (reviews are addressable, so normally one each).
  const byReviewer = new Map<string, Review>()
  for (const r of reviews) {
    if (r.target !== 'claim') continue
    const cur = byReviewer.get(r.pubkey)
    if (!cur || r.createdAt > cur.createdAt) byReviewer.set(r.pubkey, r)
  }
  let legit = 0; let fake = 0; let legitWeight = 0; let uncounted = 0
  for (const r of byReviewer.values()) {
    const w = weightOf(r.pubkey)
    if (w <= 0) { uncounted++; continue }
    if (r.verdict === 'legit') { legit++; legitWeight += w }
    else fake++
  }
  const disputed = fake > 0
  return { legit, fake, legitWeight, disputed, verified: !disputed && legitWeight >= sumThreshold, uncounted }
}

export interface ReleaseTally {
  recommend: number
  'not-recommend': number
  unsure: number
  /** Rank-weighted sums over the same counted reviewers. */
  weight: { recommend: number; 'not-recommend': number; unsure: number }
  uncounted: number
}

/** §6.3 item 4: distinct counted reviewers per verdict, plus their weighted sums. */
export function tallyRelease(reviews: Review[], weightOf: WeightOf): ReleaseTally {
  const byReviewer = new Map<string, Review>()
  for (const r of reviews) {
    if (r.target !== 'release') continue
    const cur = byReviewer.get(r.pubkey)
    if (!cur || r.createdAt > cur.createdAt) byReviewer.set(r.pubkey, r)
  }
  const t: ReleaseTally = { recommend: 0, 'not-recommend': 0, unsure: 0, weight: { recommend: 0, 'not-recommend': 0, unsure: 0 }, uncounted: 0 }
  for (const r of byReviewer.values()) {
    const w = weightOf(r.pubkey)
    if (w <= 0) { t.uncounted++; continue }
    if (r.target !== 'release') continue
    t[r.verdict]++
    t.weight[r.verdict] += w
  }
  return t
}

/**
 * §6.8: a large gap between raw and verified implementer counts is itself
 * evidence of manipulation. Flag at five or more raw with under half verified.
 */
export function divergenceFlag(raw: number, verified: number): boolean {
  return raw >= 5 && verified * 2 < raw
}
