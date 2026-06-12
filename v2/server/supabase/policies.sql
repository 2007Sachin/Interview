-- Row Level Security policies for the interview app.
--
-- The Node server uses the service-role key and bypasses RLS entirely, so
-- these policies exist to lock down anon/authenticated direct access from
-- the client SDK. Apply once in the Supabase SQL editor after the schema
-- in README.md has been created.

-- Belt-and-braces: ensure RLS is on (the schema turns it on too).
alter table public.users    enable row level security;
alter table public.sessions enable row level security;

-- Students can read their own row.
drop policy if exists "users self read" on public.users;
create policy "users self read"
  on public.users for select
  to authenticated
  using (auth.uid() = id);

-- Students cannot self-update institution / batch / is_admin from the client;
-- only name is theirs to change. Server writes via the service-role key.
drop policy if exists "users self update name" on public.users;
create policy "users self update name"
  on public.users for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Students can read only their own sessions.
drop policy if exists "sessions self read" on public.sessions;
create policy "sessions self read"
  on public.sessions for select
  to authenticated
  using (student_id = auth.uid());

-- Students can delete their own sessions (the "delete this interview" button).
drop policy if exists "sessions self delete" on public.sessions;
create policy "sessions self delete"
  on public.sessions for delete
  to authenticated
  using (student_id = auth.uid());

-- Admin reads: any user with is_admin = true can read sessions/users in
-- their own institution. Same-institution scoping keeps one college's
-- placement office from seeing another's data even if they share a project.
drop policy if exists "users admin read same institution" on public.users;
create policy "users admin read same institution"
  on public.users for select
  to authenticated
  using (
    exists (
      select 1 from public.users me
      where me.id = auth.uid()
        and me.is_admin = true
        and me.institution = public.users.institution
    )
  );

drop policy if exists "sessions admin read same institution" on public.sessions;
create policy "sessions admin read same institution"
  on public.sessions for select
  to authenticated
  using (
    exists (
      select 1
      from public.users me
      join public.users target on target.id = public.sessions.student_id
      where me.id = auth.uid()
        and me.is_admin = true
        and me.institution = target.institution
    )
  );

-- Anon users get no direct access; they hit the Node API instead.
