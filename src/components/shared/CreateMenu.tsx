import { useNavigate } from 'react-router-dom'
import { FileText, ChevronRight } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { useAuthStore } from '@/stores/authStore'
import { useLoginModalStore } from '@/stores/loginModalStore'

/**
 * "What do you want to publish?" — the single entry point to every publish
 * flow. Releases, claims and reviews start from the thing they target, so the
 * only thing you create from nowhere is a draft.
 */
const OPTIONS = [
  { to: '/submit-draft', icon: FileText, title: 'Draft', desc: 'Start a new proposal. Drafts are editable and open for discussion.' },
] as const

export function CreateMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const go = (to: string) => {
    onOpenChange(false)
    // Publishing needs a signer either way; ask up front rather than after the
    // user has filled in a whole form.
    if (!isAuthenticated) { useLoginModalStore.getState().open(); return }
    navigate(to)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-edge bg-dialog sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Create</DialogTitle>
          <DialogDescription className="text-neutral-400">What would you like to publish?</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-1">
          {OPTIONS.map(({ to, icon: Icon, title, desc }) => (
            <button
              key={to}
              type="button"
              onClick={() => go(to)}
              className="group flex w-full items-center gap-3 rounded-lg border border-edge bg-panel-2 px-3 py-3 text-left transition-colors hover:border-purple-500/40 hover:bg-edge"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
                <Icon size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-neutral-100">{title}</span>
                <span className="block text-[11px] leading-relaxed text-neutral-500">{desc}</span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-neutral-600 transition-colors group-hover:text-purple-400" />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
