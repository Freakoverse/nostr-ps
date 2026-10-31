import { Markdown } from '@/components/shared/Markdown'
import { CollapsibleBody } from '@/components/shared/CollapsibleBody'
import { BackButton } from '@/components/shared/BackButton'
import specText from '../../docs/NIP-PS.md?raw'
import { useSeoMeta } from '@/hooks/useSeoMeta'

export function AboutPage() {
  useSeoMeta({ title: 'About', description: 'How NIP-PS works: drafts, releases, adoption claims, reviews, and the lens.' })

  return (
    <div className="space-y-8 py-6">
      <BackButton />
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">About</h1>
        <p className="text-neutral-400">
          NIP-PS does not establish standards. It establishes a common information layer from
          which standards can emerge. The market of implementations is the evidence, not the
          governing body.
        </p>
      </div>

      <Section title="Drafts">
        A draft is an editable proposal with a discussion thread. Authors are advised to keep a
        proposal in draft until it has been used in the field for a while and has stopped
        changing. Experimental implementations against a draft are expected; they just cannot
        be claimed as adoption yet.
      </Section>

      <Section title="Releases">
        A release is a frozen snapshot of a draft. It is immutable and identified by its event
        id, so an implementer can always say exactly what they implemented. Any change is a new
        version. Only the first release of a proposal is marked as the original, so listings ask
        relays for one event per proposal and a long version history costs nobody else anything.
        Anyone can publish a backup of a release so it survives relay loss and deletion requests.
      </Section>

      <Section title="Adoption claims">
        <p>
          An implementer publishes a claim: "we implement this release." One live claim per
          implementer per proposal, replaced when they move to a newer version. A claim is a
          statement, not a fact. Publishing one does not make it true.
        </p>
        <p>
          There are no NIP numbers here, so saying which standard you implement, in a README, a
          changelog, or a handler description, uses the rendering the specification below defines:
          title, version, author, and the release event id. For a made-up release titled
          NIP-EXAMPLE, version 1.2, it reads:
        </p>
        <pre className="overflow-x-auto rounded-lg border border-edge bg-well px-4 py-3 font-mono text-xs text-neutral-300">We implement NIP-EXAMPLE v1.2 by npub1qgm4k…sq6wz7c (0000…9f8e)</pre>
        <p className="text-xs text-neutral-500">
          Those values are deliberately fake. The npub,
          npub1qgm4k3t2z9rfdvxh6yl0cw5ep8ucn7a2s3jd4fvt8xg9mkl5r2hsq6wz7c, is not a real key and the id is not a real event, so nothing in the example can be
          confused with a real proposal. Shortened ids keep both ends, first four and last four
          characters, so they are never mistaken for a prefix. The claim event itself carries the
          full release id and spec id.
        </p>
      </Section>

      <Section title="Reviews">
        Anyone can review a release (recommend, not recommend, unsure) or an adoption claim
        (accurate, inaccurate). The two vocabularies never mix: disliking a spec says nothing about
        whether an implementer exists, and confirming an implementer says nothing about whether
        the spec is good.
      </Section>

      <Section title="The lens">
        Every ranking is a viewpoint. Claims and reviews are weighted by trust scores from
        sources you choose: NIP-85 trusted-assertion providers, any npub's graph, or your own.
        The active lens is always shown, can be changed by anyone, logged in or not, and can be
        turned off to see the raw market. Filtering demotes and collapses. It never hides.
      </Section>

      <Section title="No authority">
        There is no default official set, no global numbering, and no role that can hide a
        proposal or a claim. The operator's graph is the anonymous default viewpoint, and it is
        a setting, not a gate.
      </Section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-neutral-100">The specification</h2>
        <p className="text-sm leading-relaxed text-neutral-400">
          Everything above is derived from this document. It is the basis of the whole system, so it is
          reproduced here in full.
        </p>
        <div className="rounded-lg border border-edge bg-well p-5 sm:p-8">
          <CollapsibleBody maxHeight={720}>
            <Markdown content={specText} softBreaks className="[&_h1]:text-2xl [&_h2]:mt-8 [&_h2]:text-xl [&_h3]:mt-6 [&_h3]:text-base" />
          </CollapsibleBody>
        </div>
      </section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-neutral-100">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-neutral-400">{children}</div>
    </section>
  )
}
