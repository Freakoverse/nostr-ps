import { useEffect, useMemo, useState } from 'react'

/**
 * Client-side pagination over a progressively loaded list. When the user is
 * on the last page or the one before it, `loadMore` is called so the next
 * batch is usually already there when they click "next". The page count
 * grows as items arrive; the current page is clamped if filtering shrinks it.
 */
export function usePaged<T>(
  items: T[],
  perPage: number,
  opts: { loadMore: () => void; reachedEnd: boolean; loading: boolean; resetKey?: unknown },
) {
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(items.length / perPage))
  const current = Math.min(page, totalPages)
  const paged = useMemo(() => items.slice((current - 1) * perPage, current * perPage), [items, current, perPage])

  // A new search or sort starts over at page 1.
  useEffect(() => { setPage(1) }, [opts.resetKey])

  useEffect(() => {
    if (!opts.loading && !opts.reachedEnd && current >= totalPages - 1) opts.loadMore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, totalPages, opts.reachedEnd, opts.loading])

  return { page: current, setPage, totalPages, paged }
}
