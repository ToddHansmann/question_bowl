import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

/**
 * One route, and it is not the deck's. The deck stays statically imported so
 * it still paints on the first tick — no extra round trip for the people the
 * app is actually for. /admin is `lazy`, so the dashboard, its stylesheet
 * and the auth half of the Supabase SDK are a separate chunk that a player
 * never downloads.
 *
 * A path check rather than a router: there are two screens, and a router
 * would be more code than the thing it routes to. Needs the SPA rewrite in
 * vercel.json so /admin reaches index.html at all.
 */
const Admin = lazy(() => import('./Admin'))

const isAdmin = window.location.pathname.replace(/\/+$/, '') === '/admin'
if (isAdmin) document.documentElement.classList.add('adm-root')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAdmin ? (
      <Suspense fallback={null}>
        <Admin />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
