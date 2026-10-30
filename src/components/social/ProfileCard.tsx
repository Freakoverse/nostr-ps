import { shortNpub } from '@/lib/utils'
import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { nip19 } from 'nostr-tools'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { User, Globe, MoreHorizontal, Eye, Pencil, ShieldBan, Loader2, AlertTriangle, RefreshCw, Flag } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/authStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useUserStore, type UserProfile } from '@/stores/userStore'
import { useBlockStore, type BlockType } from '@/stores/blockStore'
import { useDnnStore } from '@/stores/dnnStore'
import { IdentityLine } from '@/components/social/IdentityLine'
import { SafeImage } from '@/components/shared/SafeImage'
import { FollowButton } from '@/components/social/FollowButton'
import { BlockTypeModal } from '@/components/social/BlockTypeModal'
import { EditProfileDialog } from '@/components/social/EditProfileDialog'
import { ReportDialog } from '@/components/shared/ReportDialog'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'

interface ProfileCardProps {
  pubkey: string
}

const iconBtn =
  'flex flex-1 items-center justify-center rounded-lg border border-edge p-2 text-neutral-400 transition-colors hover:border-edge-2 hover:text-foreground'

/** Author card: banner, avatar, identity, follow, block/report menu. */
export function ProfileCard({ pubkey }: ProfileCardProps) {
  const myPubkey = useAuthStore(s => s.pubkey)
  const [profile, setProfile] = useState<UserProfile | null>(null)

  const npub = nip19.npubEncode(pubkey)
  const profileHref = `/profile/${npub}`
  const displayName = profile?.display_name || shortNpub(npub)
  const isSelf = myPubkey === pubkey

  const navigate = useNavigate()

  // Block state
  const blocked = useBlockStore(s => s.blockedPubkeys.has(pubkey))
  const blockLoaded = useBlockStore(s => s.loaded)
  const loadBlockList = useBlockStore(s => s.loadBlockList)
  const blockUser = useBlockStore(s => s.blockUser)
  const unblockUser = useBlockStore(s => s.unblockUser)

  const [editOpen, setEditOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [blockTypeOpen, setBlockTypeOpen] = useState(false)
  const [warnOpen, setWarnOpen] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pendingFromScratch, setPendingFromScratch] = useState(false)

  // Fetch the profile + verify any DNN ID.
  useEffect(() => {
    let cancelled = false
    const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')
    useUserStore.getState().fetchProfile(pubkey, relays).then(p => {
      if (cancelled) return
      setProfile(p)
      useDnnStore.getState().verifyPubkey(pubkey, p?.nip05 as string | undefined)
    })
    return () => { cancelled = true }
  }, [pubkey])

  // Load block list so we know if this user is already blocked.
  useEffect(() => {
    if (myPubkey && !isSelf) loadBlockList()
  }, [myPubkey, isSelf, loadBlockList])

  const handleBlockClick = async () => {
    if (!myPubkey) { toast.error('Log in to block'); return }
    if (blocked) {
      setBusy(true)
      const res = await unblockUser(pubkey)
      setBusy(false)
      if (res.success) toast.success('Unblocked')
      else toast.error(res.error || 'Failed to unblock')
      return
    }
    if (blockLoaded) { setPendingFromScratch(false); setBlockTypeOpen(true) }
    else setWarnOpen(true)
  }

  const handleRetry = async () => {
    setRetrying(true)
    const found = await loadBlockList(true)
    setRetrying(false)
    setWarnOpen(false)
    setPendingFromScratch(!found)
    setBlockTypeOpen(true)
  }

  const handleSelectType = async (type: BlockType) => {
    setBlockTypeOpen(false)
    setBusy(true)
    const res = await blockUser(pubkey, type, pendingFromScratch)
    setBusy(false)
    if (res.success) toast.success(type === 'public' ? 'Blocked publicly' : 'Blocked privately')
    else toast.error(res.error || 'Failed to block')
  }

  const websiteUrl = profile?.website
    ? (profile.website.startsWith('http') ? profile.website : `https://${profile.website}`)
    : null

  return (
    <div className="overflow-hidden rounded-lg bg-panel shadow-md shadow-black/20">
      {/* Banner */}
      <Link to={profileHref} className="block">
        <div className="relative h-35 w-full bg-gradient-to-br from-purple-900/40 to-panel-2">
          {profile?.banner && (
            <SafeImage src={profile.banner as string} alt="" className="h-full w-full object-cover" />
          )}
        </div>
      </Link>

      <div className="px-4 pb-4">
        {/* Avatar overlapping the banner */}
        <Link to={profileHref} className="inline-block">
          <Avatar className="-mt-8 h-16 w-16 ring-4 ring-panel">
            {profile?.picture ? <AvatarImage src={profile.picture as string} alt={displayName} /> : null}
            <AvatarFallback className="bg-gradient-to-br from-purple-600 to-purple-800 text-white">
              <User className="h-7 w-7" />
            </AvatarFallback>
          </Avatar>
        </Link>

        {/* Name + 3-dot menu */}
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <Link to={profileHref} className="block">
              <p className="font-semibold text-foreground truncate hover:text-purple-300 transition-colors">
                {displayName}
              </p>
            </Link>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="shrink-0 rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-edge hover:text-foreground" aria-label="More">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-panel border-edge">
              <DropdownMenuItem onClick={() => navigate(profileHref)} className="cursor-pointer">
                <Eye className="h-4 w-4 mr-2" /> View profile
              </DropdownMenuItem>
              {isSelf && (
                <DropdownMenuItem onClick={() => setEditOpen(true)} className="cursor-pointer">
                  <Pencil className="h-4 w-4 mr-2" /> Edit profile
                </DropdownMenuItem>
              )}
              {!isSelf && (
                <>
                  <DropdownMenuSeparator className="bg-edge" />
                  <DropdownMenuItem onClick={() => setReportOpen(true)} className="cursor-pointer">
                    <Flag className="h-4 w-4 mr-2" /> Report user
                  </DropdownMenuItem>
                  {myPubkey && (
                    <DropdownMenuItem
                      onClick={handleBlockClick}
                      className="cursor-pointer text-red-400 focus:text-red-300"
                    >
                      {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldBan className="h-4 w-4 mr-2" />}
                      {blocked ? 'Unblock user' : 'Block user'}
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-2">
          <IdentityLine pubkey={pubkey} npub={npub} nip05={profile?.nip05 as string | undefined} />
        </div>

        {profile?.about && (
          <p className="mt-2 text-sm text-neutral-400 line-clamp-3">{profile.about as string}</p>
        )}

        {/* Follow */}
        {!isSelf && <FollowButton pubkey={pubkey} className="mt-3 w-full" />}

        {websiteUrl && (
          <div className="mt-2 flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className={iconBtn} aria-label="Website">
                  <Globe className="h-4 w-4" />
                </a>
              </TooltipTrigger>
              <TooltipContent>Website</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Modals */}
      <BlockTypeModal
        open={blockTypeOpen}
        onOpenChange={setBlockTypeOpen}
        onSelect={handleSelectType}
        displayName={displayName}
      />

      <EditProfileDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        profile={profile}
        onSaved={(m) => setProfile(p => ({ ...(p ?? { pubkey, npub, created_at: 0 }), ...m }))}
      />

      <ReportDialog open={reportOpen} onOpenChange={setReportOpen} pubkey={pubkey} />

      {/* Block-list-not-loaded warning (mirrors the follow flow) */}
      <Dialog open={warnOpen} onOpenChange={setWarnOpen}>
        <DialogContent className="bg-panel border-edge">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-neutral-100">
              <AlertTriangle className="h-5 w-5 text-yellow-400" />
              Block list not loaded
            </DialogTitle>
            <DialogDescription className="text-neutral-400">
              We couldn't load your existing block list: it either failed to load or you don't have one yet.
              Creating a new list now could overwrite an existing one you have elsewhere, so retrying is recommended.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setWarnOpen(false)} className="border-edge">
              Cancel
            </Button>
            <Button variant="outline" onClick={handleRetry} disabled={retrying} className="border-edge">
              {retrying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Retry fetch
            </Button>
            <Button onClick={() => { setWarnOpen(false); setPendingFromScratch(true); setBlockTypeOpen(true) }} className="bg-red-600 hover:bg-red-700">
              Block anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
