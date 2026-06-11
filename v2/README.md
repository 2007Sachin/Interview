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
