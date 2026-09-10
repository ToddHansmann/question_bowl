/**
 * The earliest checkpoint the *running application* has, as opposed to the
 * build that produced it. `vite.config.ts` already refuses to build for
 * production without `VITE_PRODUCTION_HOSTNAME` set, and `restInsert`
 * (supabase.ts) already refuses to write without one that matches the
 * page's own hostname — but neither of those helps if a production bundle
 * somehow gets deployed without ever going through this repo's own `vite
 * build` (a hand-assembled deploy, a build script that bypassed it, a
 * misconfigured CI step). This is the gap those two don't cover: the moment
 * a real visitor's browser actually loads that bundle.
 *
 * Deliberately a module with no imports of its own, imported first — before
 * `App`, before anything that has its own startup side effects (analytics'
 * `initTestModeFromUrl`, in particular) — because ES modules fully evaluate
 * every import before the importing module's own body runs, in the order
 * those imports are *written*. Import order in main.tsx is what makes this
 * genuinely first, not just textually first.
 *
 * `import.meta.env.PROD` only — never `DEV`, and never a hostname check.
 * This throws in a production build with the variable missing or empty,
 * full stop. It does not, and must not, try to guess at whether the current
 * hostname is "close enough" to be forgiven; that judgment already belongs
 * to `restInsert`, which runs on every write rather than once at load and
 * so is the right place for it.
 *
 * A build that never happened and a write that refuses itself are both
 * invisible to whoever opens the deployed page. This isn't: an uncaught
 * throw here stops `main.tsx` before it ever calls `createRoot(...).render`,
 * so a misconfigured deployment shows a blank page and one unmistakable
 * console error instead of something that looks like it works.
 */
if (import.meta.env.PROD && !import.meta.env.VITE_PRODUCTION_HOSTNAME) {
  throw new Error(
    'Question Bowl: VITE_PRODUCTION_HOSTNAME is not set. This build is running in ' +
      "production without it, which should not be possible — this repo's own " +
      'build (vite.config.ts) refuses to produce one. Set it in the deployment ' +
      "platform's environment variables (Production scope) to this site's real " +
      'hostname, then rebuild and redeploy. See "Keeping test traffic out of the ' +
      'numbers" in README.md.',
  )
}
