import { sdk } from '@farcaster/miniapp-sdk'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

export interface QuickAuthProfile {
  fid: number
  username?: string
  displayName?: string
  pfpUrl?: string
  primaryAddress?: string
  ensName?: string
}

// Verified once per app session. Pages remount on navigation (Home →
// Settings → Home), and that must not look like signing in again.
const SESSION_KEY = 'shootris_quick_auth_profile'

function readSession(): QuickAuthProfile | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as QuickAuthProfile) : null
  } catch {
    return null
  }
}

/** Best available public handle: @username, then ENS, then display name, then fid. */
export function profileLabel(p: QuickAuthProfile): string {
  if (p.username) return `@${p.username}`
  if (p.ensName) return p.ensName
  if (p.displayName) return p.displayName
  return `FID ${p.fid}`
}

let inFlight: Promise<QuickAuthProfile | null> | null = null

export function useQuickAuth(isInFarcaster: boolean): QuickAuthProfile | null {
  const [profile, setProfile] = useState<QuickAuthProfile | null>(null)

  useEffect(() => {
    if (!isInFarcaster) return
    const cached = readSession()
    if (cached) {
      setProfile(cached)
      return
    }

    inFlight ??= (async () => {
      try {
        const response = await sdk.quickAuth.fetch('/api/me')
        if (!response.ok) {
          toast.error('Farcaster sign-in failed', { description: 'Unable to verify your Farcaster identity' })
          return null
        }
        const data = (await response.json()) as QuickAuthProfile
        try {
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(data))
        } catch {
          // no session storage — the next page load just verifies again
        }
        toast.success(`Signed in as ${profileLabel(data)}`, {
          description: data.displayName && data.username ? data.displayName : undefined,
          duration: 3000,
        })
        return data
      } catch (error) {
        console.error('Quick Auth error:', error)
        return null
      } finally {
        inFlight = null
      }
    })()

    let cancelled = false
    inFlight.then((p) => {
      if (!cancelled && p) setProfile(p)
    })
    return () => {
      cancelled = true
    }
  }, [isInFarcaster])

  return profile
}
