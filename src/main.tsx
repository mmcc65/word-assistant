import { StrictMode } from 'react'
import { Capacitor } from '@capacitor/core'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './styles.css'

// Packaged shells already contain the complete site. A service worker can keep
// stale JS/CSS after an APK or desktop update, so reserve it for browser PWAs.
const isPackagedShell = window.location.hostname === 'app.cet6.local' || Capacitor.isNativePlatform()
if (isPackagedShell) {
  void navigator.serviceWorker?.getRegistrations().then((registrations) => {
    for (const registration of registrations) void registration.unregister()
  })
} else {
  registerSW({ immediate: true })
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
