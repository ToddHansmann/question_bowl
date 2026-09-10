import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, mode }) => {
  /*
   * The earliest point any of this can be caught: before `dist/` exists at
   * all. `command === 'build'` is what `vite build` sets — the same thing
   * that makes `import.meta.env.PROD` true in the bundle it produces — so
   * this check and that one are checking the same question at two different
   * times. Catching it here means a misconfigured Vercel deploy never
   * produces a build to deploy in the first place, rather than deploying one
   * that quietly writes nothing (the old failure mode) or one that throws
   * the instant a real visitor opens it (src/production-config.ts, still in
   * place as the next layer down — see its own comment for why this alone
   * isn't enough).
   *
   * `loadEnv` rather than `process.env` directly: it's what Vite itself uses
   * to populate `import.meta.env`, reading `.env`/`.env.production`/
   * `.env.local` the same way the real build will — so this checks exactly
   * what the bundle is about to be given, not a guess at it.
   */
  if (command === 'build') {
    // '.' rather than `process.cwd()` — this file has no other reason to
    // need `@types/node`, and Node resolves a relative path against the
    // process's own cwd for free, which is the same directory either way
    // when `vite build` is run from the project root (as it always is here).
    const env = loadEnv(mode, '.', 'VITE_')
    if (!env.VITE_PRODUCTION_HOSTNAME) {
      throw new Error(
        'Question Bowl: VITE_PRODUCTION_HOSTNAME is not set — refusing to build. ' +
          'This is a required environment variable: without it, a deployed build ' +
          "would write nothing at all (see restInsert in src/supabase.ts) and there'd " +
          'be no build-time signal that anything was wrong. Set it — in Vercel: ' +
          'Settings → Environment Variables, scoped to Production — to this ' +
          "site's real hostname (e.g. questionbowl.vercel.app) and build again. " +
          'See "Keeping test traffic out of the numbers" in README.md.',
      )
    }
  }

  return {
    plugins: [react()],
  }
})
