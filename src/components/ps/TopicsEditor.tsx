import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const MAX_TOPICS = 20
const MAX_LEN = 40

/** Normalize one hashtag: lowercase, no leading '#', no spaces. */
function normalize(raw: string): string {
  return raw.trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-').slice(0, MAX_LEN)
}

/** Edit the `t` tags: the hashtags a proposal is filed under. Type, add, repeat. */
export function TopicsEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('')

  const add = () => {
    const t = normalize(draft)
    setDraft('')
    if (!t || value.includes(t) || value.length >= MAX_TOPICS) return
    onChange([...value, t])
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-md border border-edge bg-panel-2 px-2 py-0.5 text-xs text-neutral-300">
              <span className="text-neutral-400">#</span>{t}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} className="text-neutral-500 hover:text-red-400" aria-label={`Remove topic ${t}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. chat, groups, moderation"
          className="flex-1 border-edge bg-panel"
          maxLength={MAX_LEN + 1}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }}
        />
        <Button type="button" variant="outline" size="icon" onClick={add} className="border-edge" aria-label="Add topic"><Plus className="h-4 w-4" /></Button>
      </div>
      <p className="text-[11px] text-neutral-600">One per add. Lowercased, no spaces, up to {MAX_TOPICS}.</p>
    </div>
  )
}
