import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Toaster } from 'sonner'
import { RefreshIndicator } from '@/components/shared/RefreshIndicator'
import { useSettingsStore } from '@/stores/settingsStore'
import { useAuthStore } from '@/stores/authStore'
import { useNotificationsStore } from '@/stores/notificationsStore'
import { useBlockStore } from '@/stores/blockStore'
import { useDnnStore } from '@/stores/dnnStore'
import { useRelayCapabilityStore } from '@/stores/relayCapabilityStore'
import { useLoginModalStore } from '@/stores/loginModalStore'
import { bindLensToAuth } from '@/stores/lensStore'
import { StorageKey } from '@/lib/constants'
import { restoreSession } from '@/lib/auth/restore'
import { MainLayout } from '@/components/layout/MainLayout'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import ProfilePage from '@/pages/ProfilePage'
import { NotificationsPage } from '@/pages/NotificationsPage'
import SettingsPage from '@/pages/SettingsPage'
import { AboutPage } from '@/pages/AboutPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { DraftsPage } from '@/pages/DraftsPage'
import { DraftPage } from '@/pages/DraftPage'
import { DraftEditPage } from '@/pages/DraftEditPage'
import { ReleaseCreatePage } from '@/pages/ReleaseCreatePage'
import { ProposalsPage } from '@/pages/ProposalsPage'
import { ReleasePage } from '@/pages/ReleasePage'

/** Renders the login screen as a full-screen overlay, keeping the current page mounted. */
function LoginModalHost() {
  const isOpen = useLoginModalStore((s) => s.isOpen)
  const close = useLoginModalStore((s) => s.close)
  if (!isOpen) return null
  return <LoginPage onClose={close} />
}

export default function App() {
  useEffect(() => {
    // Rehydrate persisted settings + login on startup (e.g. new tab / reload).
    useSettingsStore.getState().loadFromStorage()
    // Probe relays' NIP-11 to learn which support NIP-50 search (cached locally).
    const probeRelayCaps = () =>
      useRelayCapabilityStore.getState().probeRelays(useSettingsStore.getState().getAllEnabledRelayUrls())
    probeRelayCaps()

    restoreSession().finally(() => {
      useBlockStore.getState().loadBlockList()
      // Pull the user's published relay (10002) + blossom (10063) lists, then
      // re-probe so their relays get marked too.
      const pk = useAuthStore.getState().pubkey
      if (pk) {
        useSettingsStore.getState().loadUserLists(pk).finally(probeRelayCaps)
        useNotificationsStore.getState().refresh(pk)
      }
    })

    // Start the DNN naming service (resolves/verifies DNN IDs).
    useDnnStore.getState().initService()

    // Keep the lens's "my graph" source in step with login.
    const unbindLens = bindLensToAuth()

    // Keep login state in sync across tabs.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== StorageKey.CURRENT_ACCOUNT) return
      const auth = useAuthStore.getState()
      if (!e.newValue) {
        // Logged out in another tab.
        if (auth.pubkey) auth.logout()
      } else if (e.newValue !== auth.pubkey) {
        // Logged in / switched account in another tab.
        restoreSession()
      }
    }
    window.addEventListener('storage', onStorage)

    // Reload per-account state whenever the logged-in account changes.
    let prevPk = useAuthStore.getState().pubkey
    const unsubAuth = useAuthStore.subscribe((s) => {
      if (s.pubkey !== prevPk) {
        prevPk = s.pubkey
        if (s.pubkey) {
          useBlockStore.getState().loadBlockList()
          useSettingsStore.getState().loadUserLists(s.pubkey).finally(probeRelayCaps)
          useNotificationsStore.getState().refresh(s.pubkey)
        } else {
          useBlockStore.getState().reset()
          useSettingsStore.getState().resetUserLists()
        }
      }
    })

    // Cooperative rebroadcasting: 30s after load, every visitor (logged in or
    // not) checks that the operator's site-config events are still widely
    // replicated and re-broadcasts any that relays have purged.
    const redundancyTimer = setTimeout(() => {
      import('@/lib/nostr/eventRedundancy').then(({ ensureAdminEventsRedundancy }) => {
        ensureAdminEventsRedundancy()
      })
    }, 30_000)

    return () => {
      window.removeEventListener('storage', onStorage)
      unsubAuth()
      unbindLens()
      clearTimeout(redundancyTimer)
    }
  }, [])

  return (
    <>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/:npub" element={<ProfilePage />} />
          <Route path="/proposals" element={<ProposalsPage />} />
          <Route path="/release/:nevent" element={<ReleasePage />} />
          <Route path="/drafts" element={<DraftsPage />} />
          <Route path="/draft/:naddr" element={<DraftPage />} />
          <Route path="/draft/:naddr/edit" element={<DraftEditPage />} />
          <Route path="/draft/:naddr/release" element={<ReleaseCreatePage />} />
          <Route path="/submit-draft" element={<DraftEditPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
      <LoginModalHost />
      <RefreshIndicator />
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'hsl(270 12% 12%)',
            border: '1px solid hsl(270 10% 18%)',
            color: 'hsl(270 5% 95%)',
          },
        }}
      />
    </>
  )
}
