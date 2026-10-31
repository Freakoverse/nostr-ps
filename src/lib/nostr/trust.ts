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
  /** Distinct counted reviewers saying accurate / inaccurate (weight > 0). */
  accurate: number
  inaccurate: number
  /** Sum of weights over distinct counted "accurate" reviewers. */
  accurateWeight: number
  /** A counted reviewer said inaccurate: the claim is unconfirmed, full stop. */
  contested: boolean
  /** accurateWeight reached the threshold and nobody counted said inaccurate. */
  confirmed: boolean
  /** Reviewers that exist but did not count (below threshold or unknown). */
  uncounted: number
}

/** Recommended default: one reviewer ranked 50 or better, or a few partially trusted ones. The lens store holds the live value. */
export const CONFIRM_SUM_THRESHOLD = 0.5

/** §6.3 item 3: is the claim confirmed, contested, or neither, under the active lens. */
export function assessClaim(reviews: Review[], weightOf: WeightOf, sumThreshold = CONFIRM_SUM_THRESHOLD): ClaimVerdictStats {
  // One vote per reviewer: the newest verdict wins (reviews are addressable, so normally one each).
  const byReviewer = new Map<string, Review>()
  for (const r of reviews) {
    if (r.target !== 'claim') continue
    const cur = byReviewer.get(r.pubkey)
    if (!cur || r.createdAt > cur.createdAt) byReviewer.set(r.pubkey, r)
  }
  let accurate = 0; let inaccurate = 0; let accurateWeight = 0; let uncounted = 0
  for (const r of byReviewer.values()) {
    const w = weightOf(r.pubkey)
    if (w <= 0) { uncounted++; continue }
    if (r.verdict === 'accurate') { accurate++; accurateWeight += w }
    else inaccurate++
  }
  const contested = inaccurate > 0
  return { accurate, inaccurate, accurateWeight, contested, confirmed: !contested && accurateWeight >= sumThreshold, uncounted }
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
 * evidence of manipulation. Flag at five or more raw with under half confirmed.
 */
export function divergenceFlag(raw: number, verified: number): boolean {
  return raw >= 5 && verified * 2 < raw
}
