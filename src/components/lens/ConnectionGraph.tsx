import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { nip19 } from 'nostr-tools'
import { Plus, Minus, Maximize2 } from 'lucide-react'
import { shortNpub } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settingsStore'
import { useUserStore, type UserProfile } from '@/stores/userStore'

/**
 * The connection as an interactive node-link graph, laid out top to bottom with
 * orthogonal (elbow) edges: You → people you follow → bridges → the target.
 * Deterministic layered layout, so it reads the same every open. The viewport
 * pans (drag) and zooms (wheel / buttons). Hovering a middle node lights up its
 * whole path — up to You and down to the target — and dims the rest, so a single
 * route is legible inside a dense hub. Layers are capped; the caller is told
 * when something was trimmed. Everything is SVG in one transformed group, so
 * edges and avatars share a coordinate space and move together.
 */

const VBW = 520 // viewBox size (the visible window); the graph world lives inside
const VBH = 460
const PAD = 34

type Kind = 'you' | 'mid' | 'target'
interface GNode { pubkey: string; x: number; y: number; r: number; kind: Kind; youLabel?: boolean }
interface GEdge { from: string; to: string }

/** x positions for n nodes centered on 0 with the given spacing. */
function centered(n: number, sp: number): number[] {
  return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * sp)
}

function elbowPath(x1: number, y1: number, x2: number, y2: number): string {
  const my = (y1 + y2) / 2
  return `M ${x1} ${y1} L ${x1} ${my} L ${x2} ${my} L ${x2} ${y2}`
}

export function ConnectionGraph({ me, target, direct, connectors, second }: {
  me: string
  target: string
  direct: boolean
  connectors: string[]
  second: { connector: string; middle: string }[]
}) {
  // ---- Layout (world coordinates, centered on x=0) --------------------------
  const { nodes, edges, aToBs, bToAs, trimmed } = useMemo(() => {
    const nodes: GNode[] = []
    const edges: GEdge[] = []
    const aToBs = new Map<string, string[]>()
    const bToAs = new Map<string, string[]>()
    let trimmed = ''
    const A_CAP = 16, B_CAP = 8

    if (direct) {
      nodes.push({ pubkey: me, x: 0, y: 0, r: 22, kind: 'you', youLabel: true })
      nodes.push({ pubkey: target, x: 0, y: 180, r: 22, kind: 'target' })
      edges.push({ from: me, to: target })
    } else if (connectors.length) {
      const shown = connectors.slice(0, A_CAP)
      if (connectors.length > shown.length) trimmed = `+${connectors.length - shown.length} more connectors not drawn`
      nodes.push({ pubkey: me, x: 0, y: 0, r: 22, kind: 'you', youLabel: true })
      nodes.push({ pubkey: target, x: 0, y: 340, r: 22, kind: 'target' })
      const xs = centered(shown.length, 72)
      shown.forEach((pk, i) => {
        nodes.push({ pubkey: pk, x: xs[i], y: 170, r: 16, kind: 'mid' })
        edges.push({ from: me, to: pk })
        edges.push({ from: pk, to: target })
      })
    } else {
      // Two-hop: You → your follows (A) → bridges (B) → target.
      const aScore = new Map<string, number>()
      for (const p of second) aScore.set(p.connector, (aScore.get(p.connector) ?? 0) + 1)
      const A = [...aScore.keys()].sort((x, y) => aScore.get(y)! - aScore.get(x)!).slice(0, A_CAP)
      const Aset = new Set(A)
      const bScore = new Map<string, number>()
      for (const p of second) if (Aset.has(p.connector)) bScore.set(p.middle, (bScore.get(p.middle) ?? 0) + 1)
      const B = [...bScore.keys()].sort((x, y) => bScore.get(y)! - bScore.get(x)!).slice(0, B_CAP)
      const Bset = new Set(B)

      const parts: string[] = []
      if (aScore.size > A.length) parts.push(`${aScore.size - A.length} more of your follows`)
      if (bScore.size > B.length) parts.push(`${bScore.size - B.length} more bridges`)
      if (parts.length) trimmed = `${parts.join(' and ')} not drawn`

      const xsA = centered(A.length, 58)
      const xsB = centered(B.length, 96)
      const ax = new Map(A.map((pk, i) => [pk, xsA[i]]))
      const bx = new Map(B.map((pk, i) => [pk, xsB[i]]))

      nodes.push({ pubkey: me, x: 0, y: 0, r: 22, kind: 'you', youLabel: true })
      nodes.push({ pubkey: target, x: 0, y: 470, r: 22, kind: 'target' })
      A.forEach((pk) => {
        nodes.push({ pubkey: pk, x: ax.get(pk)!, y: 155, r: 13, kind: 'mid' })
        edges.push({ from: me, to: pk })
      })
      B.forEach((pk) => {
        nodes.push({ pubkey: pk, x: bx.get(pk)!, y: 320, r: 18, kind: 'mid' })
        edges.push({ from: pk, to: target })
      })
      for (const p of second) {
        if (Aset.has(p.connector) && Bset.has(p.middle)) {
          edges.push({ from: p.connector, to: p.middle })
          ;(aToBs.get(p.connector) ?? aToBs.set(p.connector, []).get(p.connector)!).push(p.middle)
          ;(bToAs.get(p.middle) ?? bToAs.set(p.middle, []).get(p.middle)!).push(p.connector)
        }
      }
    }
    return { nodes, edges, aToBs, bToAs, trimmed }
  }, [me, target, direct, connectors, second])

  const posOf = useMemo(() => new Map(nodes.map((n) => [n.pubkey, n])), [nodes])

  // Initial transform: fit the world bounds inside the viewBox window.
  const initial = useMemo(() => {
    const xs = nodes.map((n) => n.x)
    const ys = nodes.map((n) => n.y)
    const minX = Math.min(...xs) - 30, maxX = Math.max(...xs) + 30
    const minY = Math.min(...ys) - 30, maxY = Math.max(...ys) + 30
    const w = maxX - minX, h = maxY - minY
    const k = Math.min((VBW - PAD * 2) / w, (VBH - PAD * 2) / h, 1.4)
    const x = (VBW - w * k) / 2 - minX * k
    const y = (VBH - h * k) / 2 - minY * k
    return { k, x, y }
  }, [nodes])

  const [t, setT] = useState(initial)
  useEffect(() => { setT(initial) }, [initial])

  const [hovered, setHovered] = useState<string | null>(null)

  // Which edges/nodes to light up for the hovered middle node (its whole path).
  const { litEdges, litNodes } = useMemo(() => {
    const litEdges = new Set<string>()
    const litNodes = new Set<string>()
    const eid = (f: string, tt: string) => `${f}->${tt}`
    if (!hovered || hovered === me || hovered === target) return { litEdges, litNodes }
    litNodes.add(hovered)
    if (connectors.length) {
      litNodes.add(me); litNodes.add(target)
      litEdges.add(eid(me, hovered)); litEdges.add(eid(hovered, target))
    } else if (aToBs.has(hovered)) {
      // hovered is one of your follows (A)
      litNodes.add(me); litEdges.add(eid(me, hovered))
      for (const b of aToBs.get(hovered)!) {
        litNodes.add(b); litNodes.add(target)
        litEdges.add(eid(hovered, b)); litEdges.add(eid(b, target))
      }
    } else if (bToAs.has(hovered)) {
      // hovered is a bridge (B)
      litNodes.add(target); litEdges.add(eid(hovered, target))
      for (const a of bToAs.get(hovered)!) {
        litNodes.add(a); litNodes.add(me)
        litEdges.add(eid(a, hovered)); litEdges.add(eid(me, a))
      }
    }
    return { litEdges, litNodes }
  }, [hovered, me, target, connectors.length, aToBs, bToAs])

  // ---- Pan / zoom -----------------------------------------------------------
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ vx: number; vy: number; moved: boolean } | null>(null)
  const navigate = useNavigate()

  const toVB = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect()
    return { vx: ((clientX - r.left) / r.width) * VBW, vy: ((clientY - r.top) / r.height) * VBH }
  }

  // Wheel zoom, attached non-passively so the page doesn't scroll instead.
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { vx, vy } = toVB(e.clientX, e.clientY)
      setT((cur) => {
        const f = e.deltaY < 0 ? 1.12 : 1 / 1.12
        const k = Math.max(initial.k * 0.4, Math.min(initial.k * 6, cur.k * f))
        const wx = (vx - cur.x) / cur.k, wy = (vy - cur.y) / cur.k
        return { k, x: vx - wx * k, y: vy - wy * k }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [initial.k])

  const zoomBy = (f: number) => setT((cur) => {
    const k = Math.max(initial.k * 0.4, Math.min(initial.k * 6, cur.k * f))
    const wx = (VBW / 2 - cur.x) / cur.k, wy = (VBH / 2 - cur.y) / cur.k
    return { k, x: VBW / 2 - wx * k, y: VBH / 2 - wy * k }
  })

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { ...toVB(e.clientX, e.clientY), moved: false }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const { vx, vy } = toVB(e.clientX, e.clientY)
    const dx = vx - drag.current.vx, dy = vy - drag.current.vy
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.current.moved = true
    setT((cur) => ({ ...cur, x: cur.x + dx, y: cur.y + dy }))
    drag.current.vx = vx; drag.current.vy = vy
  }
  const onPointerUp = () => { drag.current = null }

  const openProfile = (pubkey: string) => {
    if (drag.current?.moved) return
    navigate(`/profile/${nip19.npubEncode(pubkey)}`)
  }

  const active = hovered != null && hovered !== me && hovered !== target && litNodes.size > 0

  return (
    <div className="space-y-2">
      <div className="relative w-full overflow-hidden rounded-lg border border-edge bg-[#0b0b0d]">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VBW} ${VBH}`}
          className="block h-[340px] w-full touch-none select-none"
          style={{ cursor: drag.current ? 'grabbing' : 'grab' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <defs>
            <clipPath id="cg-clip" clipPathUnits="objectBoundingBox"><circle cx="0.5" cy="0.5" r="0.5" /></clipPath>
          </defs>
          <g transform={`translate(${t.x} ${t.y}) scale(${t.k})`}>
            {edges.map((e, i) => {
              const a = posOf.get(e.from), b = posOf.get(e.to)
              if (!a || !b) return null
              const lit = litEdges.has(`${e.from}->${e.to}`)
              return (
                <path
                  key={i}
                  d={elbowPath(a.x, a.y + a.r, b.x, b.y - b.r)}
                  fill="none"
                  stroke={lit ? '#c4b5fd' : '#7c6aa8'}
                  strokeWidth={lit ? 2.4 : 1}
                  strokeOpacity={active ? (lit ? 0.95 : 0.06) : 0.3}
                  style={{ transition: 'stroke-opacity 120ms, stroke-width 120ms' }}
                />
              )
            })}
            {nodes.map((n) => (
              <GraphNode
                key={n.pubkey}
                node={n}
                dim={active && !litNodes.has(n.pubkey)}
                forceLabel={active && litNodes.has(n.pubkey)}
                onHover={n.kind === 'mid' ? setHovered : undefined}
                onClick={() => openProfile(n.pubkey)}
              />
            ))}
          </g>
        </svg>

        {/* Controls */}
        <div className="absolute right-2 top-2 flex flex-col gap-1">
          <CtrlBtn label="Zoom in" onClick={() => zoomBy(1.3)}><Plus className="h-3.5 w-3.5" /></CtrlBtn>
          <CtrlBtn label="Zoom out" onClick={() => zoomBy(1 / 1.3)}><Minus className="h-3.5 w-3.5" /></CtrlBtn>
          <CtrlBtn label="Reset view" onClick={() => setT(initial)}><Maximize2 className="h-3.5 w-3.5" /></CtrlBtn>
        </div>
      </div>
      {trimmed && <p className="text-center text-[11px] text-neutral-600">{trimmed}</p>}
    </div>
  )
}

function CtrlBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md border border-edge bg-panel/80 text-neutral-400 backdrop-blur transition-colors hover:border-edge-2 hover:text-neutral-100"
    >
      {children}
    </button>
  )
}

function GraphNode({ node, dim, forceLabel, onHover, onClick }: {
  node: GNode
  dim: boolean
  forceLabel?: boolean
  onHover?: (pk: string | null) => void
  onClick: () => void
}) {
  const { pubkey, x, y, r, kind, youLabel } = node
  const [profile, setProfile] = useState<UserProfile | null>(() => useUserStore.getState().getCachedProfile(pubkey))

  useEffect(() => {
    if (youLabel) return
    let cancelled = false
    const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')
    useUserStore.getState().fetchProfile(pubkey, relays).then((p) => { if (!cancelled) setProfile(p) })
    return () => { cancelled = true }
  }, [pubkey, youLabel])

  const name = youLabel ? 'You' : (profile?.display_name || profile?.name || shortNpub(nip19.npubEncode(pubkey)))
  const short = name.length > 16 ? `${name.slice(0, 15)}…` : name
  const pic = !youLabel ? (profile?.picture as string | undefined) : undefined
  const ring = kind === 'target' ? '#a78bfa' : youLabel ? '#8b5cf6' : '#3a3a40'
  const bg = youLabel ? '#2a2140' : '#1c1c20'

  return (
    <g
      transform={`translate(${x} ${y})`}
      style={{ opacity: dim ? 0.25 : 1, transition: 'opacity 120ms', cursor: 'pointer' }}
      onPointerEnter={() => onHover?.(pubkey)}
      onPointerLeave={() => onHover?.(null)}
      onClick={(e) => { e.stopPropagation(); onClick() }}
    >
      <circle cx={0} cy={0} r={r} fill={bg} />
      {pic && <image href={pic} x={-r} y={-r} width={r * 2} height={r * 2} clipPath="url(#cg-clip)" preserveAspectRatio="xMidYMid slice" />}
      {!pic && <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fontSize={r} fill="#8a8a92">{name.slice(0, 1).toUpperCase()}</text>}
      <circle cx={0} cy={0} r={r} fill="none" stroke={ring} strokeWidth={kind === 'target' || youLabel ? 2.5 : 1.5} />
      {(kind !== 'mid' || r >= 16 || forceLabel) && (
        <text x={0} y={r + 13} textAnchor="middle" fontSize={11} fontWeight={kind === 'target' || youLabel ? 600 : 400} fill={kind === 'target' ? '#ddd6fe' : '#cfcfd4'}>
          {short}
        </text>
      )}
    </g>
  )
}
