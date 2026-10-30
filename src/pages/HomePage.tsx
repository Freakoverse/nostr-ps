import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSeoMeta } from '@/hooks/useSeoMeta'

/**
 * Landing page. The proposal and draft listings are the real entry points;
 * this is the one-paragraph explanation and two doors in.
 */
export function HomePage() {
  useSeoMeta({ description: 'Permissionless standards for Nostr: anyone can propose, adoption is the signal, trust is a lens you choose.' })

  return (
    <div className="space-y-10 py-12">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">Permissionless Standards</h1>
        <p className="text-lg text-neutral-400 leading-relaxed">
          Anyone may propose a standard. Nothing is official. What matters is who implements
          it, read through the trust graph of whoever is looking.
        </p>
        <p className="text-sm text-neutral-500 leading-relaxed">
          Drafts are editable and open for discussion. Releases are frozen snapshots that
          implementers build against. Adoption claims and reviews are published by the people
          who make them, and you decide whose opinions count.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          to="/proposals"
          className="group rounded-xl border border-edge bg-panel p-5 transition-colors hover:border-purple-500/40"
        >
          <div className="flex items-center gap-2 text-purple-400">
            <BookOpen size={18} />
            <span className="text-sm font-semibold">Proposals</span>
          </div>
          <p className="mt-2 text-sm text-neutral-400">
            Released specs, ranked by adoption and filtered by your lens.
          </p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs text-neutral-500 group-hover:text-purple-400">
            Browse <ArrowRight size={12} />
          </span>
        </Link>
        <Link
          to="/drafts"
          className="group rounded-xl border border-edge bg-panel p-5 transition-colors hover:border-purple-500/40"
        >
          <div className="flex items-center gap-2 text-purple-400">
            <FileText size={18} />
            <span className="text-sm font-semibold">Drafts</span>
          </div>
          <p className="mt-2 text-sm text-neutral-400">
            Work in progress. Read, comment, and implement experimentally.
          </p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs text-neutral-500 group-hover:text-purple-400">
            Browse <ArrowRight size={12} />
          </span>
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <Button asChild className="bg-purple-600 hover:bg-purple-700 text-white">
          <Link to="/submit-draft">Start a draft</Link>
        </Button>
        <Link to="/about" className="text-sm text-neutral-400 hover:text-foreground">
          How this works
        </Link>
      </div>
    </div>
  )
}
