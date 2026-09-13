/**
 * Minimal typings for the two Google Identity Services methods Okane uses —
 * no @types/google.accounts dependency for a two-method surface.
 */
interface GoogleAccountsId {
  initialize(config: {
    client_id: string
    callback: (response: { credential?: string }) => void
    use_fedcm_for_button?: boolean
  }): void
  renderButton(
    parent: HTMLElement,
    options: {
      theme?: 'outline' | 'filled_blue' | 'filled_black'
      size?: 'large' | 'medium' | 'small'
      width?: number
      locale?: string
      text?: 'signin_with' | 'signup_with' | 'continue_with'
    },
  ): void
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } }
  }
}

// Loaded once, shared across every mount — re-injecting the script tag would
// double-register GIS's internal handlers.
let loadPromise: Promise<GoogleAccountsId> | null = null

export function loadGoogleIdentity(): Promise<GoogleAccountsId> {
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts.id) {
      resolve(window.google.accounts.id)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => {
      if (window.google?.accounts.id) resolve(window.google.accounts.id)
      else reject(new Error('Google Identity Services loaded but window.google is missing'))
    }
    script.onerror = () => reject(new Error('Failed to load Google Identity Services script'))
    document.head.appendChild(script)
  })

  return loadPromise
}
