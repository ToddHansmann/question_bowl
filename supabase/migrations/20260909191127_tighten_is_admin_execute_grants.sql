-- Recorded from supabase_migrations.schema_migrations on 2026-09-13.
-- Already applied to QB Production; committed so the repo holds the full history.

-- is_admin() only ever reports on the caller (always false for anon), so
-- exposing it was not a leak — but nothing anon does needs it. Every RLS
-- policy that calls it is a SELECT policy granted `to authenticated`, so
-- anon never evaluates it. Drop the grant and shrink the public surface.
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
