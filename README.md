# EVAS Translation Meetings

Internal real-time translation meeting app for EVAS buyer calls.

## Stack

- Next.js App Router
- LiveKit for video/audio rooms, screen sharing, and recording integration
- OpenAI Realtime Translation for interpretation and captions
- Supabase Auth, Postgres, Storage, and server-side operations

## Local setup

1. Install dependencies:

```bash
pnpm install
```

2. Create `.env.local` from `.env.example` and fill service credentials.

3. Run development server:

```bash
pnpm dev
```

## Database naming

All EVAS translation app-owned Supabase objects use the `rt_` prefix
(`rt_meetings`, `rt_meeting_participants`, `rt_translation_sessions`, etc.).
This keeps the internal meeting app isolated and easy to manage inside a
Supabase project that may already contain unrelated tables.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Or run the full local gate:

```bash
pnpm verify
```

## Production preflight

Before an internal buyer meeting or deployment, run:

```bash
pnpm production:check
```

For an all-up report that continues after failures and shows every remaining gate in one run, use:

```bash
pnpm readiness:next
pnpm vercel:env:sync
pnpm readiness:report
```

Or run the production checks individually:

```bash
pnpm preflight
pnpm deployment:smoke
pnpm deployed:preflight
pnpm livekit:smoke
pnpm openai:smoke
pnpm supabase:schema:smoke
pnpm recording:storage:smoke
pnpm translation:worker:smoke
pnpm translation:worker:status
```

`pnpm preflight` prints missing/blocked production settings without exposing secret values and exits non-zero while blockers remain.
`pnpm deployment:smoke` verifies the deployed `NEXT_PUBLIC_APP_URL` is public HTTPS and serves `/api/health` plus `/login`.
`pnpm deployed:preflight` calls the protected deployed internal preflight endpoint with `INTERNAL_WORKER_TOKEN` and verifies the Vercel function sees the expected production env/readiness state.
`pnpm vercel:env:sync` is a secret-safe dry-run plan for syncing `.env.local` into Vercel production using `--value` so CLI stdin newlines are not accidentally stored. Add `-- --apply` only after the plan shows every required value is present.
`pnpm livekit:smoke` verifies LiveKit API credentials by listing rooms.
`pnpm openai:smoke` verifies OpenAI API authentication, configured model visibility where applicable, and actual Realtime Translation client-secret/WebSocket session-update compatibility.
`pnpm supabase:schema:smoke` verifies the configured Supabase project has the required `rt_*` tables and columns after migrations.
`pnpm recording:storage:configure` copies recording S3 credentials from the current process environment into `.env.local` without printing values; `pnpm recording:storage:finalize -- --dry-run` shows the post-credential promotion plan; `pnpm recording:storage:smoke` writes, reads, and deletes a small S3 object with the configured recording credentials.
`pnpm recording:storage:setup` prints the project-specific Supabase Dashboard S3 Configuration URL and the exact post-key commands. After generating keys, `pnpm recording:storage:prompt` lets an operator paste them into the local terminal without echoing the values back, then `pnpm recording:storage:finalize` promotes and verifies them.
For server interpretation, keep the worker running separately:

```bash
pnpm translation:worker
```

Before configuring separate web and worker services, print the environment manifest:

```bash
pnpm env:manifest
pnpm env:template web
pnpm env:template worker
pnpm env:check web
pnpm env:check worker
```

For bounded startup smoke tests, run `pnpm translation:worker:smoke`; for Live QA, start and verify the long-running worker with `pnpm translation:worker:start` and `pnpm translation:worker:status`. After two-device QA evidence is filled, run the final gate and completion audit:

```bash
pnpm liveqa:plan
pnpm readiness:report -- --json=/tmp/readiness-results.json
pnpm completion:audit /tmp/readiness-results.json
pnpm readiness:check
```

`pnpm liveqa:plan` prints the exact two-device run script for Korean ↔ English/Russian translation, recording, notes, cleanup, and checklist evidence. It does not mark the checklist as passed; observed results must still be recorded in `.scratch/realtime-translation-meeting-app/qa/LIVE-QA-CHECKLIST.md`.

For a quick OpenAI Realtime Translation audio estimate before a buyer meeting:

```bash
pnpm cost:estimate -- --minutes=60 --lanes=2
```

At the default `$0.034 / minute / lane` rate, 60 minutes is `$2.04` for one active translation lane and `$4.08` for two active lanes. A lane means one source-language → one listening-language translated audio track; multiple listeners sharing the same target language should reuse the same lane.

If recording is explicitly accepted as disabled until Supabase S3 keys are configured, run the narrower internal translation pilot gate:

```bash
pnpm pilot:check
```

This checks code, deployment, LiveKit, OpenAI Realtime, Supabase schema, and the long-running translation worker. It does **not** replace `pnpm readiness:check` for the full product because recording storage and the formal Live QA checklist remain required for final completion.

## Deployment

- Deployment guide: `docs/deployment.md`
- Docker image: `Dockerfile`
- Process split for compatible platforms: `Procfile` (`web` and `worker`)

The LiveKit Node translation worker is a long-running Node process. Do not deploy it as a serverless/edge function.

## Planning artifacts

- PRD: `.scratch/realtime-translation-meeting-app/PRD.md`
- Test spec: `.scratch/realtime-translation-meeting-app/TEST-SPEC.md`
- Issues: `.scratch/realtime-translation-meeting-app/issues/`
