# NIP-PS

> Permissionless Standards for Nostr. Anyone may propose; adoption is the signal; trust is a lens you choose.

Client application: a general Nostr client foundation (relay pool, auth, PoW, Blossom, DNN) with the NIP-PS kinds on top.

## Docs

- [NIP-PS spec](docs/NIP-PS.md) — the protocol: drafts, releases, backups, adoption claims, reviews.
- [Client lens](docs/CLIENT-LENS.md) — client-side trust scoring via NIP-85 providers and graph viewpoints.
- [Deploying](docs/deploying.md) — static build, GitHub Pages, nginx.

## Develop

```bash
npm install
npm run dev
```

## Layout

| Path | What |
|---|---|
| `src/lib/nostr/nipps.ts` | NIP-PS builders, parsers, fetchers, rollups |
| `src/lib/constants.ts` | Kind numbers (`KINDS.PS_*`), spec-id tag letter, operator key |
| `src/stores/lensStore.ts` | Trust lens: sources, scoring, threshold buckets |
| `src/components/lens/` | Trust badge, lens bar, tiered list, lens settings |
| `src/components/ps/` | Draft editor, cards, claim and review dialogs, profile tabs |
| `src/pages/` | Proposals, release, drafts, draft, draft editor, release creation |

## Routes

| Route | Page |
|---|---|
| `/proposals` | Released specs ranked by adoption |
| `/release/:nevent` | One release: body, versions, claims, reviews, backups, discussion |
| `/drafts` | Drafts in progress |
| `/draft/:naddr` | One draft with discussion and release detection |
| `/submit-draft`, `/draft/:naddr/edit` | Draft editor (new, edit, or fork) |
| `/draft/:naddr/release` | Freeze a draft into a release |
| `/profile/:npub` | Drafts, releases, claims, reviews by one person |
| `/settings` | Lens, network, preferences |

## Before deploying

- Set `ADMIN_PUBKEY` / `ADMIN_NPUB` in `src/lib/constants.ts` to the operator's key. It signs the announcement banner and is the anonymous default viewpoint.
- Kind numbers `8201`, `8202`, `30851`, `30852` are provisional (spec §12). `30817` is shared with an existing NIP directory on purpose.
- Replace `public/favicon.png`.
