import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { KindRef } from '@/lib/nostr/nipps'
import { LIMITS } from '@/lib/limits'
import { CharCounter, LimitCounter } from '@/components/shared/CharCounter'

/** Edit the `k` tags: the event kinds a proposal defines or uses (§4.1). */
export function KindsEditor({ value, onChange }: { value: KindRef[]; onChange: (v: KindRef[]) => void }) {
  const [kind, setKind] = useState('')
  const [name, setName] = useState('')

  const add = () => {
    const k = Number(kind.trim())
    if (!Number.isInteger(k) || k < 0) return
    if (value.some((x) => x.kind === k) || value.length >= LIMITS.kinds) { setKind(''); setName(''); return }
    const label = name.trim().slice(0, LIMITS.kindNameLength)
    onChange([...value, label ? { kind: k, name: label } : { kind: k }])
    setKind(''); setName('')
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((k) => (
            <span key={k.kind} className="inline-flex items-center gap-1 rounded-md border border-edge bg-panel-2 px-2 py-0.5 text-xs text-neutral-300">
              <span className="font-mono text-purple-300">{k.kind}</span>
              {k.name && <span className="text-neutral-400">{k.name}</span>}
              <button type="button" onClick={() => onChange(value.filter((x) => x.kind !== k.kind))} className="text-neutral-500 hover:text-red-400" aria-label={`Remove kind ${k.kind}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input value={kind} onChange={(e) => setKind(e.target.value.replace(/D+/g, '').slice(0, 5))} placeholder="Kind, e.g. 30817" inputMode="numeric" pattern="[0-9]*" className="w-36 border-edge bg-panel" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" maxLength={LIMITS.kindNameLength} className="flex-1 border-edge bg-panel" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <Button type="button" variant="outline" size="icon" onClick={add} className="border-edge" aria-label="Add kind"><Plus className="h-4 w-4" /></Button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <CharCounter value={name} max={LIMITS.kindNameLength} className="text-left" />
        <LimitCounter current={value.length} max={LIMITS.kinds} always className="ml-auto" />
      </div>
      <p className="text-[11px] text-neutral-600">Kinds listed here let clients measure real usage of the spec, not just claims. Up to {LIMITS.kinds}.</p>
    </div>
  )
}
