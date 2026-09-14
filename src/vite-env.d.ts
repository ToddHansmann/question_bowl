/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /**
   * The only hostname `restInsert` (supabase.ts) will ever write from in a
   * production build — nothing is hardcoded. Typed optional because a
   * missing value is a real, handled state (writes refuse and warn, they
   * don't guess) rather than a build error, but it needs to be set in
   * Vercel's Production environment for the deployed site to write anything.
   */
  readonly VITE_PRODUCTION_HOSTNAME?: string
  /** Build-level feature flag overrides, e.g. `experimentalQuestions,-onboarding`. See src/flags.ts. */
  readonly VITE_FLAGS?: string
  /** Optional build identifier recorded on each play session (e.g. a commit sha). */
  readonly VITE_APP_BUILD?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
