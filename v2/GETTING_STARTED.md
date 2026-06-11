# Getting Started (no coding experience needed)

This guide takes you from a blank computer to running the interview app locally, with exact
commands to copy-paste. Commands go in your **terminal** (Mac: Terminal app; Windows:
PowerShell or "Git Bash" after installing Git).

## 1 · Prerequisites (one-time)

**Git** — check if you have it:

```bash
git --version
```

If you see something like `git version 2.x`, you're set. If not, install it from
https://git-scm.com (accept all defaults).

**Node.js LTS** — check if you have it:

```bash
node --version
```

You want `v20` or newer. If not, install the **LTS** version from https://nodejs.org.

**Tell Git who you are** (one-time, used for commits):

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

## 2 · Getting the code

First, merge this PR on GitHub (green **Merge pull request** button).

**First time** — download the project:

```bash
git clone https://github.com/MahammadWahab540/pathwisse-mockinterview.git
cd pathwisse-mockinterview
```

**Afterwards** — to get the latest changes any time:

```bash
git pull
```

**Want to test the PR branch *before* merging?** From inside the project folder:

```bash
git fetch origin
git checkout claude/focused-sagan-4mpc9x
```

## 3 · Setup

```bash
cd v2
cp .env.example .env
```

(Windows PowerShell: `copy .env.example .env`)

Now open the new `v2/.env` file in any text editor and paste in your Groq API key:

1. Go to https://console.groq.com, sign up (free), open **API Keys**, create a key.
2. In `.env`, set `GROQ_API_KEY=gsk_...your key...`
3. Leave `STORAGE_BACKEND=file` as it is — no database needed locally.

Install everything (one-time, and again whenever dependencies change):

```bash
npm run install:all
```

## 4 · Running locally

You need **two terminals**, both open at the same time.

**Terminal 1 — the backend:**

```bash
cd v2/server
npm run dev
```

Success looks like:

```
[startup] interview server listening on http://localhost:3001
[startup] storage=file stt=whisper-large-v3-turbo fast=llama-3.1-8b-instant smart=llama-3.3-70b-versatile
```

**Terminal 2 — the frontend:**

```bash
cd v2/web
npm run dev
```

Success looks like Vite printing:

```
  ➜  Local:   http://localhost:5173/
```

Open **http://localhost:5173** in Chrome or Edge, allow microphone access when asked, and
start practicing. (The first time Asha speaks, her voice model downloads — give it a minute.)

## 5 · Verifying each stage

The full checklist lives in [README.md → Stage verification](./README.md#stage-verification).
The short version:

- **Stage 1** — run a 2-question skill interview (`TOTAL_QUESTIONS=2` in `.env`); your spoken
  answers come back as accurate transcripts.
- **Stage 2** — go start-to-finish through all six screens; the orb's state (speaking /
  listening / thinking) matches what's actually happening at every step.
- **Stage 3** — finish an interview; the coaching report shows readiness level, highlights,
  one thing to fix, a SWOT grid traceable to your transcript, and per-question cards;
  "Save as PDF" prints cleanly.
- **Stage 4** — simulate failures (block the mic, kill the backend mid-answer, wrong API key,
  refresh mid-interview, silent answer) and confirm each recovers without a dead end.
- **Stage 5** — point `.env` at a real Supabase project (`STORAGE_BACKEND=supabase`) and run
  an interview end-to-end; the session row appears in Supabase.

## 6 · Pushing your local edits back

After changing files:

```bash
git add .
git commit -m "describe what you changed"
git push
```

## 7 · Deploying

See [README.md → Deploy to Railway](./README.md#deploy-to-railway) — two services
(frontend + backend), the full environment-variable table, and the Supabase schema to run
first. No GPU, no Python service.
