# Asha — AI Mock-Interview Practice

A confidence-building practice tool for college students who fear interviews. Asha (the AI
interviewer, name configurable via `INTERVIEWER_NAME`) runs a short spoken interview
(8 questions, ~7 minutes) and then delivers a coaching-style report. The student always
controls the pace; the tone everywhere is encouraging coach, never judge.

> **New here and not a coder?** Follow [GETTING_STARTED.md](./GETTING_STARTED.md) — it walks
> through everything with copy-pasteable commands.

## Architecture

Turn-based, not streaming: every interaction is a plain HTTP request/response.
No websockets, no Python service, no browser SpeechRecognition, no paid voice services.

| Piece | Choice |
| --- | --- |
| Frontend | React + Vite + TypeScript (strict), `web/` |
| Backend | Single Node + Express + TypeScript service, `server/` |
| Speech-to-text | Groq-hosted Whisper (`GROQ_STT_MODEL`, default `whisper-large-v3-turbo`) |
| Per-turn LLM | `GROQ_MODEL_FAST` (default `llama-3.1-8b-instant`) — acknowledgements, follow-up decisions, advancing |
| Brief + report LLM | `GROQ_MODEL_SMART` (default `llama-3.3-70b-versatile`) — interview brief and final coaching report only |
| Text-to-speech | Kokoro (`kokoro-js`) running in the browser — $0, model cached after first download |
| Storage | `SessionStore` interface: JSON file store (default) or Supabase (`STORAGE_BACKEND`) |

One secret runs the whole app in development: `GROQ_API_KEY`. A per-session cost estimate
(audio seconds transcribed + tokens per model) is logged server-side after every interview.

## Setup

```bash
cd v2
cp .env.example .env        # then paste your GROQ_API_KEY into .env
npm run install:all         # installs server/ and web/
```

## Running locally

Terminal 1 — backend (http://localhost:3001):

```bash
cd v2/server
npm run dev
```

Success looks like: `[startup] interview server listening on http://localhost:3001`.

Terminal 2 — frontend (http://localhost:5173, proxies `/api` to the backend):

```bash
cd v2/web
npm run dev
```

Success looks like Vite printing `Local: http://localhost:5173/`.

## Checks (run after every change)

```bash
cd v2
npm run lint
npm test
npm run build
```

---

## Stage verification

### Stage 1 — core turn loop

1. In `v2/.env` set `GROQ_API_KEY` and, for a quick run, `TOTAL_QUESTIONS=2`.
2. Start backend and frontend as above, open http://localhost:5173.
3. Enter a skill (e.g. `SQL`), pick a level, click **Start practicing**.
   - The first question appears on screen and is spoken aloud (first run downloads the
     Kokoro voice model — give it a moment; the app works text-only meanwhile).
4. Click **Answer**, speak a short answer out loud, click **Done**.
   - Verify the **"What I heard"** card shows an accurate transcript of what you said.
   - Asha either asks one short follow-up (if your answer was shallow) or moves on.
5. Answer the second question the same way. After it, the screen says the round is complete.
6. Check the server terminal: a `[cost] session=… estimate=$…` line appears once the
   background report finishes (report UI lands in Stage 3).
7. Restore `TOTAL_QUESTIONS=8` (or delete the line) when done.

### Stage 2 — full student journey

1. Start backend + frontend as above (a short run with `TOTAL_QUESTIONS=2` is fine), open
   http://localhost:5173.
2. **Start**: the three chips ("A skill interview" / "Defend my capstone" / "My resume")
   switch the input below. Pick *A skill interview*, enter a skill, click **Set up my
   interview**.
3. **Briefing**: shows interview length, the question count, how it works, and what you'll
   get. One **Continue** button.
4. **Mic check** ("Joining your interview"): *Test my microphone* — speak and watch the level
   bar move until it confirms "Heard you loud and clear". *Hear Asha's voice* plays a TTS
   line (first play downloads the voice model).
5. **Meet your interviewer**: the orb appears, pulses while speaking the intro
   ("Hi, I'm Asha…"), then settles. Click **Start the interview**.
6. **Interview room** — confirm the character state matches reality at every step:
   - orb pulses with amber waveform rings + "Asha is speaking…" while the question plays;
   - calm green ripples + "Asha is listening…" while you record;
   - orbital shimmer + "Catching every word…/Asha is thinking…" while transcribing/deciding;
   - progress shows "Question N of M" with the animated amber bar;
   - your latest transcript appears under the question after each answer;
   - bottom call-style toolbar: **Answer/Done**, **Repeat question**, **Type instead**,
     **End interview** (asks once, then ends and still produces a report).
7. **Wrap-up**: Asha speaks a warm closing line while the report generates in the
   background; the screen transitions on its own when it's ready (full report page is
   Stage 3).

### Stage 3 — the coaching report

1. Complete an interview (or click **End interview** partway through — a partial round must
   still produce a report).
2. After wrap-up the report page renders. Check every section, in this order:
   1. Readiness level badge ("needs practice" / "developing" / "interview-ready") shown
      more prominently than the numeric score, with the summary underneath;
   2. **What you did well** — 2–3 highlights, each quoting or referencing something you
      actually said;
   3. **Your one thing to fix** — a single focused card (title / why / how);
   4. SWOT as a clean 2×2 card grid — verify every point is traceable to your transcript;
   5. Per-question cards with answer summary, score, feedback and how to improve;
   6. Closing call-to-action: **Interview again** returns to the start screen with your
      setup pre-filled.
3. Click **Save as PDF** — the browser print dialog opens with a clean, print-friendly
   layout (no buttons, no animations).
4. Refresh-resilience of the report itself comes in Stage 4; for now verify the report also
   persisted server-side: the session JSON under `v2/server/data/sessions/` contains a
   `report` object.

### Stage 4 — reliability & edge cases

Simulate each failure and confirm the recovery path (no dead-end screens anywhere):

1. **Mic permission denied**: block the mic in browser site settings, then go through the
   mic check — you get clear unblock instructions plus a "Continue — I'll type my answers"
   path. Inside the interview, clicking **Answer** with a blocked mic opens the type-instead
   panel automatically.
2. **Audio upload failure**: stop the backend (`Ctrl+C` in the server terminal) mid-interview,
   record an answer — the client auto-retries once, then keeps your clip and shows a
   **Try again** button. Restart the backend and click it; the answer goes through.
3. **Groq API error / rate limit**: set a wrong `GROQ_API_KEY` and restart the server. The
   server retries with backoff, then the UI shows a friendly "give it a second" message with
   a retry — never a crash. (Transcription falls back the same way.)
4. **Refresh mid-interview**: refresh the tab during the interview — you land back on the
   exact current question ("Picking up where you left off…"), because the server owns the
   question index and state. Refresh after finishing — you land on your report.
5. **Empty / inaudible answer**: click Answer and say nothing (or send `...` as text) — you
   get "I didn't catch that — try again, or type your answer instead." and the question does
   not advance.
6. **Input limits**: recordings auto-stop at 3 minutes and submit; capstone PDFs over 10 MB
   are rejected with a clear message; all user text is sanitized before reaching prompts.

### Stage 5 — production prep (Supabase)

1. Create a free project at https://supabase.com, then run the [table schema](#supabase-table-schema)
   below in its SQL editor.
2. In `v2/.env` set:
   ```
   STORAGE_BACKEND=supabase
   SUPABASE_URL=https://<your-project>.supabase.co
   SUPABASE_SERVICE_KEY=<service_role key from Project Settings → API>
   ```
3. Restart the backend and run a complete interview end-to-end (start → report).
4. Verify in Supabase Table Editor: the `sessions` row exists, `status` is `done`,
   `cost_usd` is populated, and `data` contains the brief, transcripts and report.
5. Refresh mid-interview still resumes (state now comes from Supabase).

---

## Supabase table schema

Run this once in the Supabase SQL editor:

```sql
create table public.users (
  id uuid primary key,
  handle text not null unique,      -- email or college ID, the student's choice
  name text not null default '',
  created_at timestamptz not null default now(),
  institution text not null default '',  -- derived from the handle's domain at signup
  batch text not null default '',        -- batch/department, set manually for v1
  is_admin boolean not null default false
);

create table public.sessions (
  id uuid primary key,
  created_at timestamptz not null default now(),
  mode text not null,
  kind text not null default 'interview',       -- 'interview' | 'drill'
  topic_key text not null default '',           -- groups repeat attempts ("skill:sql")
  difficulty text not null default 'standard',  -- 'easy' | 'standard' | 'hard'
  student_id uuid references public.users(id) on delete cascade,
  status text not null,
  report_status text not null default 'none',
  score numeric,                                -- promoted from the report
  readiness text,                               -- promoted from the report
  cost_usd numeric not null default 0,          -- attributed per student via student_id
  data jsonb not null
);

-- Derived per-student/per-topic progress (score trend + readiness journey).
create view public.student_progress as
select student_id,
       topic_key,
       count(*)                                  as attempts,
       avg(score)                                as avg_score,
       max(score)                                as best_score,
       (array_agg(readiness order by created_at desc))[1] as latest_readiness,
       max(created_at)                           as last_attempt_at
from sessions
where student_id is not null and score is not null
group by student_id, topic_key;

-- The backend uses the service-role key, so lock the tables down for anon users.
alter table public.sessions enable row level security;
alter table public.users enable row level security;
```

One row per interview. The whole session — brief, per-question transcripts, the coaching
report and the cost log — lives in `data` (jsonb); key fields are promoted to columns for
cheap queries. Deleting a user cascades to their sessions (the server also deletes
explicitly so the file backend behaves identically).

### Identity model (v1)

"Save your progress" is deliberately lightweight: the student enters an email or college ID
**after** their first interview, the server issues a student id, and the browser keeps it in
localStorage. There is no password and no email verification yet, so progress lives in the
browser where the student practices; signing in from a second device with the same handle is
refused rather than leaking someone's history. Production upgrade path: swap the
`POST /api/student` handler for Supabase Auth email OTP — the storage schema already fits.

## The progress loop (demo)

1. Run backend + frontend (`TOTAL_QUESTIONS=2` makes this quick), finish one skill
   interview on e.g. `sql`.
2. On the report, use **Save your progress** (any email/ID). The interview is claimed.
3. Click **Re-interview on sql** and finish round two. The new brief avoids round one's
   questions (server passes them as exclusions), and the report gains a **Since last time**
   note judging whether your previous "one thing to fix" improved.
4. Go to **My interviews** → **Progress** on the sql row: score trend sparkline, readiness
   journey, the "What changed" comparison, and per-attempt report links.
5. Back home, hit **Weak spot drill**: a 3-question mini-interview generated only from your
   accumulated weaknesses — finish it and it lands in history like any round.
6. Difficulty: start a new interview and pick easy/standard/hard — hard probes much more
   aggressively with follow-ups; the level is recorded in history.
7. Privacy: delete a single interview (✕ on its row) or **Delete my data** for the full
   cascade.

## Institution admin dashboard (`/admin`)

A read-only view for the placement office: *are my students practicing, and are they
getting interview-ready?* Open **http://localhost:5173/admin** (or `<frontend-url>/admin`
in production).

**Access** — either of:

1. `ADMIN_KEY` from the server env, typed into the `/admin` unlock screen; or
2. an admin-flagged user (requests carrying their `X-Student-Id`). Set the flag manually
   for v1:
   - Supabase: `update users set is_admin = true where handle = 'placement@college.edu';`
   - File backend: edit `server/data/students/<id>.json` and set `"isAdmin": true`.

**Institution & batch mapping (v1)** — `institution` is derived from the signup handle's
email domain; `batch` starts empty and is set by manual mapping:
`update users set batch = 'CSE-2026' where handle like '%@cse.college.edu';`
(file backend: edit the student JSON).

**Dashboard sections** (`GET /api/admin/overview`): stat cards (active students this week,
interviews this week vs last, average score vs last week, readiness mix as a stacked bar),
interviews/day for 30 days, readiness funnel with movement vs ~30 days ago, hot topics with
average scores, and anonymized common-weakness patterns ("42% of students struggle with
concise answers") bucketed by keyword from `oneThingToFix` + SWOT weaknesses. The roster
(`GET /api/admin/roster?q=&batch=`) is searchable, batch-filterable, exports CSV
client-side, and clicks through to a student's history (`GET /api/admin/student/:id`).
Aggregates are computed in Node from the store, so they work identically on the file and
Supabase backends; the equivalent Supabase SQL for ad-hoc analysis:

```sql
-- interviews per day, last 30 days
select created_at::date as day, count(*) from sessions
where created_at > now() - interval '30 days' group by 1 order by 1;

-- readiness funnel (latest readiness per student)
select readiness, count(*) from (
  select distinct on (student_id) student_id, readiness
  from sessions where student_id is not null and readiness is not null
  order by student_id, created_at desc
) latest group by readiness;

-- hot topics
select topic_key, count(*) as attempts, round(avg(score), 1) as avg_score
from sessions where kind = 'interview' group by topic_key order by attempts desc;
```

**Tone guardrails**: the UI frames everything as progress and cohort patterns — there are
no leaderboards and no student-vs-student ranking views, by design. Students are told at
"save your progress" that their college can see practice progress.

**Demo with seeded data**:

```bash
cd v2/server
npm run seed          # ~30 fake students, ~95 interviews, varied histories
npm run dev           # with ADMIN_KEY=devkey (or any value) in v2/.env
```

Then open http://localhost:5173/admin, enter your `ADMIN_KEY`, and every dashboard section
is populated; the roster search/filter/CSV and student drill-down work against the seeded
cohort. (Seeding respects `STORAGE_BACKEND`, so the same command fills Supabase.)

## Admin peek

Two ways to see interviews/day and average cost per interview:

1. **HTTP endpoint** (works with both storage backends): set `ADMIN_KEY` to a long random
   string, then `GET /api/admin/stats?key=<ADMIN_KEY>` returns
   `{ "days": [{ "day": "2026-06-11", "interviews": 12, "avgCostUsd": 0.0021 }, …] }`.
2. **Supabase SQL** (production):
   ```sql
   select date_trunc('day', created_at)::date as day,
          count(*)                            as interviews,
          round(avg(cost_usd), 6)             as avg_cost_usd
   from sessions
   group by 1
   order by 1 desc;
   ```

## Deploy to Railway

Two services from this repo — **no GPU and no Python service are needed**; TTS runs in the
visitor's browser. Once the repo is connected, pushes to `main` auto-deploy both services.

### Service 1 — backend (Node)

| Setting | Value |
| --- | --- |
| Root directory | `v2/server` |
| Build command | `npm install && npm run build` |
| Start command | `npm start` |

### Service 2 — frontend (static build)

| Setting | Value |
| --- | --- |
| Root directory | `v2/web` |
| Build command | `npm install && npm run build` |
| Start command | `npx serve -s dist -l $PORT` (or use a Railway static-site builder) |

### Environment variables

| Variable | Service | Value |
| --- | --- | --- |
| `GROQ_API_KEY` | backend | your Groq key (the app's one real secret) |
| `GROQ_STT_MODEL` | backend | `whisper-large-v3-turbo` (default) |
| `GROQ_MODEL_FAST` | backend | `llama-3.1-8b-instant` (default) |
| `GROQ_MODEL_SMART` | backend | `llama-3.3-70b-versatile` (default) |
| `STORAGE_BACKEND` | backend | `supabase` |
| `SUPABASE_URL` | backend | `https://<project>.supabase.co` |
| `SUPABASE_SERVICE_KEY` | backend | service-role key (production secret) |
| `FRONTEND_ORIGIN` | backend | the frontend service's public URL (enables CORS) |
| `INTERVIEWER_NAME` | backend | optional, default `Asha` |
| `ADMIN_KEY` | backend | optional, enables `/api/admin/stats` |
| `PORT` | backend | set by Railway automatically |
| `VITE_API_BASE` | frontend (build-time) | the backend service's public URL |

Real secrets (`GROQ_API_KEY`, `SUPABASE_SERVICE_KEY`) live only in Railway/`.env` — never
commit them; `.env` is gitignored and `.env.example` documents every variable.
