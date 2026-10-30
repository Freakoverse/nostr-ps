import { useSeoMeta } from '@/hooks/useSeoMeta'

export function AboutPage() {
  useSeoMeta({ title: 'About', description: 'How NIP-PS works: drafts, releases, adoption claims, reviews, and the lens.' })

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-12">
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
        version. Anyone can publish a backup of a release so it survives relay loss and deletion
        requests.
      </Section>

      <Section title="Adoption claims">
        An implementer publishes a claim: "we implement this release." One live claim per
        implementer per proposal, replaced when they move to a newer version. A claim is a
        statement, not a fact. Publishing one does not make it true.
      </Section>

      <Section title="Reviews">
        Anyone can review a release (recommend, not recommend, unsure) or an adoption claim
        (legit, fake). The two vocabularies never mix: disliking a spec says nothing about
        whether an implementer exists, and verifying an implementer says nothing about whether
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
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-neutral-100">{title}</h2>
      <p className="text-sm leading-relaxed text-neutral-400">{children}</p>
    </section>
  )
}
