import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { KindRef } from '@/lib/nostr/nipps'

/** Edit the `k` tags: the event kinds a proposal defines or uses (§4.1). */
export function KindsEditor({ value, onChange }: { value: KindRef[]; onChange: (v: KindRef[]) => void }) {
  const [kind, setKind] = useState('')
  const [name, setName] = useState('')

  const add = () => {
    const k = Number(kind.trim())
    if (!Number.isInteger(k) || k < 0) return
    if (value.some((x) => x.kind === k)) { setKind(''); setName(''); return }
    onChange([...value, name.trim() ? { kind: k, name: name.trim() } : { kind: k }])
    setKind(''); setName('')
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((k) => (
            <span key={k.kind} className="inline-flex items-center gap-1 rounded-md border border-[#2e2e2e] bg-[#212121] px-2 py-0.5 text-xs text-neutral-300">
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
        <Input value={kind} onChange={(e) => setKind(e.target.value)} placeholder="Kind, e.g. 30817" inputMode="numeric" className="w-36 border-[#262626] bg-[#1c1c1c]" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" className="flex-1 border-[#262626] bg-[#1c1c1c]" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <Button type="button" variant="outline" size="icon" onClick={add} className="border-[#262626]" aria-label="Add kind"><Plus className="h-4 w-4" /></Button>
      </div>
      <p className="text-[11px] text-neutral-600">Kinds listed here let clients measure real usage of the spec, not just claims.</p>
    </div>
  )
}
