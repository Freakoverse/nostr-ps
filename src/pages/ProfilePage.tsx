import { shortNpub } from '@/lib/utils'
import { BackButton } from '@/components/shared/BackButton'
import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { nip19 } from 'nostr-tools'
import { useSettingsStore } from '@/stores/settingsStore'
import { useAuthStore } from '@/stores/authStore'
import { useLoginModalStore } from '@/stores/loginModalStore'
import { useUserStore, type UserProfile } from '@/stores/userStore'
import { useSeoMeta } from '@/hooks/useSeoMeta'
import { useDnnStore } from '@/stores/dnnStore'
import { dnnService } from '@/lib/dnn/dnnService'
import { isValidDnnFormat } from '@/lib/dnn/dnnUtils'
import { formatDnnId } from '@/lib/dnn/formatDnnId'
import { ProfileCard } from '@/components/social/ProfileCard'
import { DraftsTab, ReleasesTab, AdoptedTab, ReviewsTab, VerdictsTab } from '@/components/ps/ProfileTabs'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { User } from 'lucide-react'

const tabTrigger = 'py-1.5 data-[state=active]:bg-edge data-[state=active]:text-purple-400'
const hideInactive = 'mt-4 data-[state=inactive]:hidden'

const TABS = ['drafts', 'releases', 'adopted', 'reviews', 'verdicts'] as const
type ProfileTab = typeof TABS[number]

export default function ProfilePage() {
  const { npub } = useParams<{ npub: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: ProfileTab = (TABS as readonly string[]).includes(searchParams.get('tab') ?? '')
    ? (searchParams.get('tab') as ProfileTab)
    : 'drafts'
  const setTab = (v: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', v)
    setSearchParams(next, { replace: true })
  }
  const { pubkey: authedPubkey } = useAuthStore()

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [targetPubkey, setTargetPubkey] = useState<string | null>(null)
  const targetPubkeyRef = useRef<string | null>(null)
  targetPubkeyRef.current = targetPubkey

  // Resolve the URL param — an npub, a DNN ID, or a hex pubkey.
  useEffect(() => {
    if (!npub) {
      if (authedPubkey) navigate(`/profile/${nip19.npubEncode(authedPubkey)}`, { replace: true })
      return
    }
    let cancelled = false
    if (npub.startsWith('npub1')) {
      try {
        const decoded = nip19.decode(npub)
        setTargetPubkey(decoded.type === 'npub' ? (decoded.data as string) : null)
      } catch {
        setTargetPubkey(null)
      }
    } else if (isValidDnnFormat(npub)) {
      // If this DNN ID already belongs to the loaded profile (e.g. we just
      // hot-swapped the URL), keep it — don't reset/refetch.
      const cur = targetPubkeyRef.current
      const curDnn = cur ? useDnnStore.getState().getVerifiedDnnId(cur) : null
      if (curDnn && formatDnnId(curDnn).toLowerCase() === npub.toLowerCase()) return
      setTargetPubkey(null)
      ;(async () => {
        await useDnnStore.getState().initService()
        const res = await dnnService.resolve(npub)
        if (cancelled) return
        if (res?.npub) {
          try { setTargetPubkey(nip19.decode(res.npub).data as string) } catch { setTargetPubkey(null) }
        } else setTargetPubkey(null)
      })()
    } else if (/^[0-9a-f]{64}$/i.test(npub)) {
      setTargetPubkey(npub.toLowerCase())
    } else {
      setTargetPubkey(null)
    }
    return () => { cancelled = true }
  }, [npub, authedPubkey, navigate])

  // Fetch profile + verify any DNN ID.
  useEffect(() => {
    if (!targetPubkey) return
    let cancelled = false
    async function load() {
      const relayUrls = useSettingsStore.getState().getAllEnabledRelayUrls('read')
      setProfileLoading(true)
      try {
        const p = await useUserStore.getState().fetchProfile(targetPubkey!, relayUrls)
        if (cancelled) return
        setProfile(p)
        useDnnStore.getState().verifyPubkey(targetPubkey!, p?.nip05 as string | undefined)
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setProfileLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [targetPubkey])

  // Hot-swap the URL to the DNN ID once it's verified (when arrived via npub).
  const verifiedDnnId = useDnnStore((s) => (targetPubkey ? s.getVerifiedDnnId(targetPubkey) : null))
  useEffect(() => {
    if (targetPubkey && verifiedDnnId && npub?.startsWith('npub1')) {
      navigate(`/profile/${formatDnnId(verifiedDnnId)}`, { replace: true })
    }
  }, [targetPubkey, verifiedDnnId, npub, navigate])

  useSeoMeta(profile ? {
    title: profile.display_name || profile.name || (npub ? shortNpub(npub) : 'Profile'),
    description: profile.about,
    image: profile.picture,
    type: 'profile',
  } : null)

  if (!targetPubkey && !npub) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <User className="h-12 w-12 text-neutral-500" />
        <h2 className="text-xl font-semibold text-neutral-200">No profile selected</h2>
        <p className="text-neutral-400 text-sm">Log in to view your profile.</p>
        <Button variant="outline" onClick={() => useLoginModalStore.getState().open()}>Log In</Button>
      </div>
    )
  }

  return (
    <div className="mx-auto py-6">
      <BackButton className="mb-4" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column: tabbed activity */}
        <div className="lg:col-span-2 min-w-0">
          {targetPubkey ? (
            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <TabsList className="grid h-auto w-full grid-cols-5 items-stretch bg-panel border border-edge">
                <TabsTrigger value="drafts" className={tabTrigger}>Drafts</TabsTrigger>
                <TabsTrigger value="releases" className={tabTrigger}>Releases</TabsTrigger>
                <TabsTrigger value="adopted" className={tabTrigger}>Adopted</TabsTrigger>
                <TabsTrigger value="reviews" className={tabTrigger}>Reviews</TabsTrigger>
                <TabsTrigger value="verdicts" className={tabTrigger}>Verdicts</TabsTrigger>
              </TabsList>

              <TabsContent value="drafts" forceMount className={hideInactive}>
                <DraftsTab pubkey={targetPubkey} />
              </TabsContent>
              <TabsContent value="releases" forceMount className={hideInactive}>
                <ReleasesTab pubkey={targetPubkey} />
              </TabsContent>
              <TabsContent value="adopted" forceMount className={hideInactive}>
                <AdoptedTab pubkey={targetPubkey} />
              </TabsContent>
              <TabsContent value="reviews" forceMount className={hideInactive}>
                <ReviewsTab pubkey={targetPubkey} />
              </TabsContent>
              <TabsContent value="verdicts" forceMount className={hideInactive}>
                <VerdictsTab pubkey={targetPubkey} />
              </TabsContent>
            </Tabs>
          ) : (
            <Skeleton className="h-10 w-full rounded-lg bg-panel-2" />
          )}
        </div>

        {/* Right column: author card */}
        <div className="lg:sticky lg:top-20 self-start space-y-6">
          {targetPubkey && !profileLoading ? (
            <ProfileCard pubkey={targetPubkey} />
          ) : (
            <div className="overflow-hidden rounded-lg bg-panel">
              <Skeleton className="h-35 w-full rounded-none bg-panel-2" />
              <div className="px-4 pb-4">
                <Skeleton className="-mt-8 h-16 w-16 rounded-full bg-panel-2 ring-4 ring-panel" />
                <Skeleton className="mt-3 h-4 w-32 bg-panel-2" />
                <Skeleton className="mt-2 h-3 w-24 bg-panel-2" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
