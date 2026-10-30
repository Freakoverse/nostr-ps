import { useEffect } from 'react'
import { BackButton } from '@/components/shared/BackButton'
import { Bell } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useLoginModalStore } from '@/stores/loginModalStore'
import { useNotificationsStore } from '@/stores/notificationsStore'
import { NotificationsView } from '@/components/social/NotificationsView'
import { Button } from '@/components/ui/button'
import { useSeoMeta } from '@/hooks/useSeoMeta'

export function NotificationsPage() {
  const pubkey = useAuthStore((s) => s.pubkey)
  useSeoMeta({ title: 'Notifications' })

  // Opening the page marks everything seen (publishes the NIP-78 marker).
  useEffect(() => {
    if (pubkey) useNotificationsStore.getState().markSeen(pubkey)
  }, [pubkey])

  if (!pubkey) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Bell className="h-12 w-12 text-neutral-500" />
        <h2 className="text-xl font-semibold text-neutral-200">Notifications</h2>
        <p className="text-neutral-400 text-sm">Log in to see comments on your drafts and releases.</p>
        <Button variant="outline" onClick={() => useLoginModalStore.getState().open()}>Log In</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 py-8">
      <BackButton />
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <p className="text-sm text-neutral-400">Comments on your drafts and releases.</p>
      </div>
      <NotificationsView myPubkey={pubkey} />
    </div>
  )
}
