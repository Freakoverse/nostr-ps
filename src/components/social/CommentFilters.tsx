import { useEffect, useState } from 'react'
import { Pickaxe } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'

/** Comment view filters. Kept as an object so more can be added over time. */
export interface CommentFilterState {
  /** Show only top-level comments written by the post's author. */
  authorOnly: boolean
  /** Proof-of-work floor for this thread only; null means the value from Settings. */
  minPow: number | null
}

export const DEFAULT_COMMENT_FILTERS: CommentFilterState = {
  authorOnly: false,
  minPow: null,
}

interface CommentFiltersProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  filters: CommentFilterState
  onChange: (filters: CommentFilterState) => void
  /** The content-filter difficulty from Settings, used when no temporary value is set. */
  settingsPow: number
}

export function CommentFilters({ open, onOpenChange, filters, onChange, settingsPow }: CommentFiltersProps) {
  const effective = filters.minPow ?? settingsPow
  const [pending, setPending] = useState(effective)
  useEffect(() => { if (open) setPending(effective) }, [open, effective])
  const overridden = filters.minPow !== null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Comment filters</DialogTitle>
          <DialogDescription>Adjust what you see in this thread.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-md border border-edge bg-panel px-3 py-2.5">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-neutral-200">Author only comments</p>
              <p className="text-xs text-neutral-500">
                Show only comments from the post&apos;s author, not replies to comments.
              </p>
            </div>
            <Switch
              checked={filters.authorOnly}
              onCheckedChange={(v) => onChange({ ...filters, authorOnly: v })}
              className="shrink-0"
            />
          </div>

          <div className="space-y-3 rounded-md border border-edge bg-panel px-3 py-2.5">
            <div className="space-y-0.5">
              <p className="flex items-center gap-2 text-sm font-medium text-neutral-200">
                <Pickaxe className="h-4 w-4 text-purple-400" /> Proof-of-work floor
                <span className="ml-auto font-mono text-xs text-neutral-400">{effective} bits{overridden ? ' · temporary' : ''}</span>
              </p>
              <p className="text-xs text-neutral-500">
                Comments with less proof of work than this are folded. Your Settings value is {settingsPow} bits; a value set here applies to this thread only and does not change Settings.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Slider min={0} max={32} step={1} value={[pending]} onValueChange={([v]) => setPending(v)} className="flex-1" />
              <span className="w-8 text-right font-mono text-sm text-neutral-200">{pending}</span>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {/* Reset puts the slider back on the Settings value and drops any temporary override. */}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setPending(settingsPow); if (overridden) onChange({ ...filters, minPow: null }) }}
                disabled={pending === settingsPow && !overridden}
                className="text-neutral-400"
              >
                Reset to default ({settingsPow})
              </Button>
              <Button size="sm" variant="outline" onClick={() => onChange({ ...filters, minPow: pending })} disabled={pending === effective} className="border-edge">
                Set temporarily
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
