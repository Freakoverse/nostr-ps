import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { nip19 } from 'nostr-tools'
import { User } from 'lucide-react'
import { shortNpub } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settingsStore'
import { useUserStore, type UserProfile } from '@/stores/userStore'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'

/**
 * The connection as a node-link graph, top to bottom: You → people you follow →
 * bridges → the target. A deterministic layered layout (not force-directed) so
 * it reads the same every open. Edges are drawn in one SVG behind HTML avatar
 * nodes that share its coordinate space (viewBox 0..VW × 0..height, nodes
 * positioned by percentage). Layers are capped so a hub doesn't turn into a
 * hairball; the caller notes anything trimmed.
 */

const VW = 480 // viewBox width; nodes map x → `${x / VW * 100}%`
const MARGIN = 44
const A_CAP = 16
const B_CAP = 8

/** Evenly spaced x positions for `n` nodes across the usable width. */
function spread(n: number): number[] {
  if (n <= 0) return []
  if (n === 1) return [VW / 2]
  const usable = VW - MARGIN * 2
  return Array.from({ length: n }, (_, i) => MARGIN + (i + 0.5) * (usable / n))
}

interface Node { pubkey: string; x: number; y: number; size: number; label?: boolean; accent?: boolean; you?: boolean }
interface Edge { x1: number; y1: number; x2: number; y2: number }

export function ConnectionGraph({ me, target, direct, connectors, second }: {
  me: string
  target: string
  direct: boolean
  connectors: string[]
  second: { connector: string; middle: string }[]
}) {
  let height = 180
  const nodes: Node[] = []
  const edges: Edge[] = []
  let trimmed = ''

  const selfNode = { pubkey: me, x: VW / 2, size: 40, you: true }

  if (direct) {
    height = 180
    const ty = 140
    nodes.push({ ...selfNode, y: 36, size: 40, label: true })
    nodes.push({ pubkey: target, x: VW / 2, y: ty, size: 40, label: true, accent: true })
    edges.push({ x1: VW / 2, y1: 36, x2: VW / 2, y2: ty })
  } else if (connectors.length) {
    // You → people you follow (who follow the target) → target.
    height = 320
    const yY = 34, cY = 160, tY = 292
    const shown = connectors.slice(0, A_CAP)
    if (connectors.length > shown.length) trimmed = `+${connectors.length - shown.length} more connectors not drawn`
    const xs = spread(shown.length)
    nodes.push({ ...selfNode, y: yY, label: true })
    nodes.push({ pubkey: target, x: VW / 2, y: tY, size: 40, label: true, accent: true })
    shown.forEach((pk, i) => {
      nodes.push({ pubkey: pk, x: xs[i], y: cY, size: 30, label: true })
      edges.push({ x1: VW / 2, y1: yY, x2: xs[i], y2: cY })
      edges.push({ x1: xs[i], y1: cY, x2: VW / 2, y2: tY })
    })
  } else {
    // You → your follows → bridges → target (the two-hop case).
    height = 388
    const yY = 30, aY = 138, bY = 258, tY = 358

    const aScore = new Map<string, number>()
    for (const p of second) aScore.set(p.connector, (aScore.get(p.connector) ?? 0) + 1)
    const A = [...aScore.keys()].sort((x, y) => (aScore.get(y)! - aScore.get(x)!)).slice(0, A_CAP)
    const Aset = new Set(A)

    const bScore = new Map<string, number>()
    for (const p of second) if (Aset.has(p.connector)) bScore.set(p.middle, (bScore.get(p.middle) ?? 0) + 1)
    const B = [...bScore.keys()].sort((x, y) => (bScore.get(y)! - bScore.get(x)!)).slice(0, B_CAP)
    const Bset = new Set(B)

    const totalA = aScore.size, totalB = bScore.size
    const parts: string[] = []
    if (totalA > A.length) parts.push(`${totalA - A.length} more of your follows`)
    if (totalB > B.length) parts.push(`${totalB - B.length} more bridges`)
    if (parts.length) trimmed = `${parts.join(' and ')} not drawn`

    const xsA = spread(A.length)
    const xsB = spread(B.length)
    const ax = new Map(A.map((pk, i) => [pk, xsA[i]]))
    const bx = new Map(B.map((pk, i) => [pk, xsB[i]]))

    nodes.push({ ...selfNode, y: yY, label: true })
    nodes.push({ pubkey: target, x: VW / 2, y: tY, size: 40, label: true, accent: true })
    A.forEach((pk) => {
      nodes.push({ pubkey: pk, x: ax.get(pk)!, y: aY, size: 22 })
      edges.push({ x1: VW / 2, y1: yY, x2: ax.get(pk)!, y2: aY })
    })
    B.forEach((pk) => {
      nodes.push({ pubkey: pk, x: bx.get(pk)!, y: bY, size: 30, label: true })
      edges.push({ x1: bx.get(pk)!, y1: bY, x2: VW / 2, y2: tY })
    })
    for (const p of second) {
      if (Aset.has(p.connector) && Bset.has(p.middle)) {
        edges.push({ x1: ax.get(p.connector)!, y1: aY, x2: bx.get(p.middle)!, y2: bY })
      }
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative w-full overflow-hidden rounded-lg border border-edge bg-panel/60">
        <svg viewBox={`0 0 ${VW} ${height}`} className="block h-auto w-full">
          {edges.map((e, i) => (
            <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} className="stroke-purple-400/25" strokeWidth={1.2} />
          ))}
        </svg>
        {nodes.map((n) => (
          <GraphNode key={`${n.pubkey}-${n.y}`} node={n} vh={height} />
        ))}
      </div>
      {trimmed && <p className="text-center text-[11px] text-neutral-600">{trimmed}</p>}
    </div>
  )
}

function GraphNode({ node, vh }: { node: Node; vh: number }) {
  const { pubkey, x, y, size, label, accent, you } = node
  const [profile, setProfile] = useState<UserProfile | null>(() => useUserStore.getState().getCachedProfile(pubkey))

  useEffect(() => {
    let cancelled = false
    const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')
    useUserStore.getState().fetchProfile(pubkey, relays).then((p) => { if (!cancelled) setProfile(p) })
    return () => { cancelled = true }
  }, [pubkey])

  const npub = nip19.npubEncode(pubkey)
  const name = profile?.display_name || profile?.name || shortNpub(npub)
  const labelText = you ? 'You' : name

  const avatar = (
    <Avatar
      className={accent ? 'ring-2 ring-purple-400' : you ? 'ring-2 ring-purple-500/40' : 'ring-1 ring-edge-2'}
      style={{ width: size, height: size }}
    >
      {!you && profile?.picture ? <AvatarImage src={profile.picture as string} alt={name} /> : null}
      <AvatarFallback className={you ? 'bg-purple-500/20 text-purple-300' : 'bg-panel-2 text-neutral-400'}><User className="h-3 w-3" /></AvatarFallback>
    </Avatar>
  )

  return (
    <div
      className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
      style={{ left: `${(x / VW) * 100}%`, top: `${(y / vh) * 100}%` }}
    >
      {you ? avatar : <Link to={`/profile/${npub}`} title={name} className="block">{avatar}</Link>}
      {label && (
        <span className={`pointer-events-none mt-0.5 max-w-[84px] truncate text-center text-[10px] ${accent ? 'font-medium text-purple-200' : you ? 'font-medium text-neutral-300' : 'text-neutral-400'}`}>
          {labelText}
        </span>
      )}
    </div>
  )
}
