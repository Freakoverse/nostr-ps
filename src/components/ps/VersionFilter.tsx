import { ChoiceMenu } from '@/components/lens/TieredList'
import { Chip } from './Cards'
import type { Release } from '@/lib/nostr/nipps'

/** 'all' or a version's release id. */
export const ALL_VERSIONS = 'all'

/**
 * "From all versions / vN" dropdown for a release's tabs, defaulting to all.
 * Hidden unless more than one version actually has items, so a single-version
 * proposal shows no extra control. `counts` maps a version's release id to how
 * many items sit under it.
 */
export function VersionFilterMenu({ versions, counts, value, onChange }: {
  versions: Release[]
  counts: Map<string, number>
  value: string
  onChange: (v: string) => void
}) {
  const withItems = versions.filter((v) => (counts.get(v.id) ?? 0) > 0)
  if (withItems.length <= 1) return null
  const total = withItems.reduce((n, v) => n + (counts.get(v.id) ?? 0), 0)
  return (
    <ChoiceMenu
      value={value}
      onChange={onChange}
      ariaLabel="Filter by version"
      options={[
        { id: ALL_VERSIONS, label: 'From all versions', hint: 'Every version in one list', count: total },
        ...withItems.map((v) => ({ id: v.id, label: `v${v.version}`, hint: '', count: counts.get(v.id) ?? 0 })),
      ]}
    />
  )
}

/** Small "v1.2" marker shown on an item to say which version it belongs to. */
export function VersionChip({ version }: { version: string }) {
  return <Chip className="font-mono text-neutral-400">v{version}</Chip>
}
