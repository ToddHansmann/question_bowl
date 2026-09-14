-- Editorial workflow: the only write path into the catalog.
--
-- Every function is SECURITY DEFINER, refuses unless is_admin(), and records
-- the caller's email as the actor. Nothing here promotes anything on its
-- own; each call is one person's decision. See docs/implementation.md →
-- "Community questions" for the workflow these functions serve.
--
--   admin_sync_catalog(catalog, tag_scheme)   register the build's questions, revisions, statuses, tags
--   admin_editorial_queue(include_test)       submissions with their latest decision and status
--   admin_review_submission(...)              accept as draft / decline / mark duplicate
--   admin_revise_draft(question_id, text, reason)
--   admin_transition_question(question_id, to_status, reason)
--   admin_question_statuses()                 id → current status, for code/database drift checks

create function public.require_admin()
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := nullif(auth.jwt() ->> 'email', '');
begin
  if not public.is_admin() then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  return v_email;
end;
$$;

revoke all on function public.require_admin() from public, anon;
grant execute on function public.require_admin() to authenticated;

/* ------------------------------------------------------- catalog sync --- */

/*
 * Registers what a build of the app knows about. Called from the admin
 * dashboard with the bundle's own CATALOG and TAG_DIMENSIONS, so the
 * database can never disagree with the code about what a revision id means.
 *
 * Idempotent. Never deletes, never rewrites history:
 * - new question ids → question_catalog
 * - new wordings     → question_revisions (existing ones untouched)
 * - placement        → question_catalog.category / kind updated to current
 * - status           → for editor-authored questions (original, todd) the
 *                      code is the authority: a first status is recorded, and
 *                      a code change (e.g. a retirement) is recorded as a
 *                      transition by 'catalog-sync'. For community questions
 *                      the database is the authority; drift is reported,
 *                      never "fixed".
 * - tag scheme       → dimensions and values added; removed values deprecated
 * - tags             → a new assignment wherever the code's tags for the
 *                      current revision differ from the latest recorded
 *
 * p_catalog:    [{questionId, revisionId, text, origin, category, kind, status, archivedReason, tags}]
 * p_tag_scheme: {version, dimensions: [{key, label, description, kind, values: [{key, label, deprecated?}]}]}
 */
create function public.admin_sync_catalog(p_catalog jsonb, p_tag_scheme jsonb)
returns table (
  questions_added   integer,
  revisions_added   integer,
  statuses_recorded integer,
  tags_recorded     integer,
  community_drift   text[],
  skipped           text[]
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor       text := public.require_admin();
  v_scheme      smallint := (p_tag_scheme ->> 'version')::smallint;
  v_dim         jsonb;
  v_val         jsonb;
  v_pos         integer;
  v_q           jsonb;
  v_current     text;
  v_drift       text[] := '{}';
  v_skipped     text[] := '{}';
  v_q_added     integer := 0;
  v_r_added     integer := 0;
  v_s_added     integer := 0;
  v_t_added     integer := 0;
  v_n           integer;
  v_tag_key     text;
  v_tag_values  text[];
  v_latest      text[];
  v_code_keys   text[];
begin
  if jsonb_typeof(p_catalog) <> 'array' then
    raise exception 'catalog must be a JSON array';
  end if;

  -- Tag scheme: add, update labels, deprecate. Never delete.
  for v_dim in select * from jsonb_array_elements(p_tag_scheme -> 'dimensions') loop
    insert into public.tag_dimensions (dimension, kind, label, description, introduced_in_scheme)
    values (v_dim ->> 'key', v_dim ->> 'kind', v_dim ->> 'label', v_dim ->> 'description', v_scheme)
    on conflict (dimension) do update
      set label = excluded.label, description = excluded.description;

    v_pos := 0;
    v_code_keys := '{}';
    for v_val in select * from jsonb_array_elements(v_dim -> 'values') loop
      v_code_keys := v_code_keys || (v_val ->> 'key');
      insert into public.tag_values (dimension, value, position, label, deprecated, introduced_in_scheme)
      values (v_dim ->> 'key', v_val ->> 'key', v_pos, v_val ->> 'label',
              coalesce((v_val ->> 'deprecated')::boolean, false), v_scheme)
      on conflict (dimension, value) do update
        set position = excluded.position, label = excluded.label, deprecated = excluded.deprecated;
      v_pos := v_pos + 1;
    end loop;

    update public.tag_values
       set deprecated = true
     where dimension = v_dim ->> 'key' and not (value = any (v_code_keys));
  end loop;

  for v_q in select * from jsonb_array_elements(p_catalog) loop
    -- Community questions must already exist (they are born in admin_review_submission).
    if v_q ->> 'origin' = 'community'
       and not exists (select 1 from public.question_catalog where question_id = v_q ->> 'questionId') then
      v_skipped := v_skipped || format('%s: community question not in the database', v_q ->> 'questionId');
      continue;
    end if;

    -- Update-then-insert rather than ON CONFLICT: CHECK constraints are
    -- evaluated on the proposed row before conflict handling, and a
    -- community row proposed without its submission_id would fail one.
    update public.question_catalog
       set category = v_q ->> 'category', kind = coalesce(v_q ->> 'kind', 'question')
     where question_id = v_q ->> 'questionId';
    if not found then
      insert into public.question_catalog (question_id, origin, category, kind)
      values (v_q ->> 'questionId', v_q ->> 'origin', v_q ->> 'category', coalesce(v_q ->> 'kind', 'question'));
      v_q_added := v_q_added + 1;
    end if;

    begin
      insert into public.question_revisions (revision_id, question_id, text, recorded_by)
      values (v_q ->> 'revisionId', v_q ->> 'questionId', v_q ->> 'text', 'catalog-sync')
      on conflict (revision_id) do nothing;
      get diagnostics v_n = row_count;
      v_r_added := v_r_added + v_n;
    exception when check_violation then
      v_skipped := v_skipped || format('%s: revision id does not match its text', v_q ->> 'questionId');
      continue;
    end;

    select to_status into v_current
    from public.question_lifecycle_events
    where question_id = v_q ->> 'questionId'
    order by event_id desc limit 1;

    if v_q ->> 'origin' = 'community' then
      if v_current is distinct from v_q ->> 'status' then
        v_drift := v_drift || format('%s: build says %s, database says %s',
                                     v_q ->> 'questionId', v_q ->> 'status', coalesce(v_current, 'nothing'));
      end if;
    elsif v_current is null then
      insert into public.question_lifecycle_events (question_id, from_status, to_status, reason, actor)
      values (v_q ->> 'questionId', null, v_q ->> 'status',
              coalesce(v_q ->> 'archivedReason', 'Registered from questions.ts'), 'catalog-sync');
      v_s_added := v_s_added + 1;
    elsif v_current <> v_q ->> 'status' then
      if exists (select 1 from public.lifecycle_transitions
                 where from_status = v_current and to_status = v_q ->> 'status') then
        insert into public.question_lifecycle_events (question_id, from_status, to_status, reason, actor)
        values (v_q ->> 'questionId', v_current, v_q ->> 'status',
                coalesce(v_q ->> 'archivedReason', format('Changed in questions.ts (synced by %s)', v_actor)),
                'catalog-sync');
        v_s_added := v_s_added + 1;
      else
        v_skipped := v_skipped || format('%s: cannot move %s → %s', v_q ->> 'questionId', v_current, v_q ->> 'status');
      end if;
    end if;

    -- Tags for the current revision, dimension by dimension.
    if jsonb_typeof(v_q -> 'tags') = 'object' then
      for v_tag_key in select jsonb_object_keys(v_q -> 'tags') loop
        v_tag_values := case jsonb_typeof(v_q -> 'tags' -> v_tag_key)
          when 'array' then array(select jsonb_array_elements_text(v_q -> 'tags' -> v_tag_key))
          else array[v_q -> 'tags' ->> v_tag_key]
        end;
        select tag_values into v_latest
        from public.question_tag_assignments
        where revision_id = v_q ->> 'revisionId' and dimension = v_tag_key
        order by assignment_id desc limit 1;
        if v_latest is distinct from v_tag_values then
          begin
            insert into public.question_tag_assignments
              (revision_id, dimension, tag_values, scheme_version, source, assigned_by)
            values (v_q ->> 'revisionId', v_tag_key, v_tag_values, v_scheme, 'catalog_sync', v_actor);
            v_t_added := v_t_added + 1;
          exception when others then
            v_skipped := v_skipped || format('%s: tag %s rejected (%s)', v_q ->> 'questionId', v_tag_key, sqlerrm);
          end;
        end if;
      end loop;
    end if;
  end loop;

  return query select v_q_added, v_r_added, v_s_added, v_t_added, v_drift, v_skipped;
end;
$$;

/* ---------------------------------------------------- editorial queue --- */

create function public.admin_editorial_queue(include_test boolean default false)
returns table (
  submission_id      uuid,
  submitted_text     text,
  submitted_category text,
  submitted_at       timestamptz,
  is_test            boolean,
  decision           text,
  note               text,
  reviewer           text,
  reviewed_at        timestamptz,
  question_id        text,
  status             text,
  current_text       text,
  category           text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    s.id,
    s.suggested_text,
    s.suggested_category,
    s.created_at,
    s.is_test,
    r.decision,
    r.note,
    r.reviewer,
    r.reviewed_at,
    r.question_id,
    cs.status,
    rev.text,
    c.category
  from public.question_suggestions s
  left join lateral (
    select * from public.submission_reviews sr
    where sr.submission_id = s.id
    order by sr.review_id desc limit 1
  ) r on true
  left join public.question_catalog c on c.question_id = r.question_id
  left join public.question_current_status cs on cs.question_id = r.question_id
  left join lateral (
    select qr.text from public.question_revisions qr
    where qr.question_id = r.question_id
    order by qr.recorded_at desc limit 1
  ) rev on true
  where public.is_admin() and (include_test or not s.is_test)
  order by (r.decision is null) desc, s.created_at desc;
$$;

/* ------------------------------------------------------------ review --- */

/*
 * One editorial decision on a submission.
 * - accepted:  allocates a permanent com-#### id, records the (optionally
 *              edited) wording as its first revision, and puts it in Draft.
 * - declined:  records the decision. The submission itself is untouched.
 * - duplicate: records which existing question it repeats (p_duplicate_of).
 * A submission already accepted cannot be accepted again.
 */
create function public.admin_review_submission(
  p_submission_id uuid,
  p_decision      text,
  p_note          text default null,
  p_text          text default null,
  p_category      text default null,
  p_kind          text default 'question',
  p_duplicate_of  text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor       text := public.require_admin();
  v_submission  public.question_suggestions%rowtype;
  v_question_id text;
  v_text        text;
begin
  select * into v_submission from public.question_suggestions where id = p_submission_id for update;
  if not found then
    raise exception 'no submission %', p_submission_id;
  end if;

  if exists (select 1 from public.submission_reviews
             where submission_id = p_submission_id and decision = 'accepted') then
    raise exception 'submission % was already accepted', p_submission_id;
  end if;

  if p_decision = 'accepted' then
    v_question_id := 'com-' || lpad(nextval('public.community_question_number')::text, 4, '0');
    v_text := coalesce(nullif(trim(p_text), ''), v_submission.suggested_text);

    insert into public.question_catalog (question_id, origin, submission_id, category, kind)
    values (v_question_id, 'community', p_submission_id,
            coalesce(p_category, v_submission.suggested_category), coalesce(p_kind, 'question'));

    insert into public.question_revisions (revision_id, question_id, text, recorded_by)
    values (v_question_id || '@' ||
              left(encode(sha256(convert_to(normalize(v_text, NFC), 'UTF8')), 'hex'), 12),
            v_question_id, v_text, v_actor);

    insert into public.question_lifecycle_events (question_id, from_status, to_status, reason, actor)
    values (v_question_id, null, 'draft', coalesce(nullif(trim(p_note), ''), 'Accepted from community submission'), v_actor);

  elsif p_decision = 'duplicate' then
    if p_duplicate_of is null or not exists (select 1 from public.question_catalog where question_id = p_duplicate_of) then
      raise exception 'duplicate needs an existing question id';
    end if;
    v_question_id := p_duplicate_of;

  elsif p_decision <> 'declined' then
    raise exception 'decision must be accepted, declined or duplicate';
  end if;

  insert into public.submission_reviews (submission_id, decision, question_id, note, reviewer)
  values (p_submission_id, p_decision, v_question_id, p_note, v_actor);

  return v_question_id;
end;
$$;

/* ------------------------------------------------------------ revise --- */

/*
 * Rewords a Draft. Shipped questions (experimental, canon) are reworded in
 * questions.ts and picked up by admin_sync_catalog, so the code and the
 * database can never hold two different "current" wordings of something
 * players can see.
 */
create function public.admin_revise_draft(p_question_id text, p_text text, p_reason text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor    text := public.require_admin();
  v_status   text;
  v_revision text;
begin
  select status into v_status from public.question_current_status where question_id = p_question_id;
  if v_status is distinct from 'draft' then
    raise exception '% is %; only drafts are revised here — reword shipped questions in questions.ts',
      p_question_id, coalesce(v_status, 'unknown');
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'a revision needs a reason';
  end if;

  v_revision := p_question_id || '@' ||
    left(encode(sha256(convert_to(normalize(p_text, NFC), 'UTF8')), 'hex'), 12);

  insert into public.question_revisions (revision_id, question_id, text, recorded_by)
  values (v_revision, p_question_id, p_text, v_actor)
  on conflict (revision_id) do nothing;

  return v_revision;
end;
$$;

/* -------------------------------------------------------- transitions --- */

create function public.admin_transition_question(p_question_id text, p_to_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor   text := public.require_admin();
  v_current text;
begin
  select status into v_current from public.question_current_status where question_id = p_question_id;
  if v_current is null then
    raise exception '% has no status', p_question_id;
  end if;
  -- The trigger enforces the transition table; this just supplies from_status.
  insert into public.question_lifecycle_events (question_id, from_status, to_status, reason, actor)
  values (p_question_id, v_current, p_to_status, p_reason, v_actor);
end;
$$;

create function public.admin_question_statuses()
returns table (question_id text, origin text, status text, since timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.question_id, c.origin, cs.status, cs.since
  from public.question_catalog c
  left join public.question_current_status cs using (question_id)
  where public.is_admin()
  order by c.question_id;
$$;

/* ------------------------------------------------------------- grants --- */

revoke all on function public.admin_sync_catalog(jsonb, jsonb)                                   from public, anon;
revoke all on function public.admin_editorial_queue(boolean)                                     from public, anon;
revoke all on function public.admin_review_submission(uuid, text, text, text, text, text, text)  from public, anon;
revoke all on function public.admin_revise_draft(text, text, text)                               from public, anon;
revoke all on function public.admin_transition_question(text, text, text)                        from public, anon;
revoke all on function public.admin_question_statuses()                                          from public, anon;

grant execute on function public.admin_sync_catalog(jsonb, jsonb)                                  to authenticated;
grant execute on function public.admin_editorial_queue(boolean)                                    to authenticated;
grant execute on function public.admin_review_submission(uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.admin_revise_draft(text, text, text)                              to authenticated;
grant execute on function public.admin_transition_question(text, text, text)                       to authenticated;
grant execute on function public.admin_question_statuses()                                         to authenticated;

revoke all on function public.enforce_lifecycle_transition() from public, anon, authenticated;
revoke all on function public.enforce_tag_assignment()       from public, anon, authenticated;
revoke all on function public.reject_mutation()              from public, anon, authenticated;
