# Deployment guide

This app has two runtime processes:

1. **Web**: the Next.js app that serves the dashboard, meeting room, API routes, LiveKit tokens, recording controls, notes, and public meeting links.
2. **Worker**: the long-running LiveKit Node translation worker that joins rooms as `translation-worker`, subscribes to individual microphone tracks, sends audio to OpenAI Realtime Translation, and publishes interpreted audio back to LiveKit.

Do not treat the worker as a serverless function. It must be a long-running Node process.

## Recommended topology

- Supabase: Auth, Postgres, Storage, and S3-compatible recording output.
- LiveKit Cloud or a reachable LiveKit server.
- OpenAI API for realtime translation, transcription, and notes.
- One Node web service running `pnpm start`.
- One Node worker service running `pnpm translation:worker`.

The web and worker services must share the same production environment values.

Print the deploy-time environment manifest before configuring a provider:

```bash
pnpm env:manifest
pnpm env:manifest web
pnpm env:manifest worker
pnpm env:template web
pnpm env:template worker
pnpm env:check web
pnpm env:check worker
```

The manifest labels secrets without printing values. Use it to copy the same Supabase, LiveKit, OpenAI, internal-token, and translation-worker values into both the web and worker service environments where required.
The template commands print dotenv-style blank assignments with safe defaults for model/worker flags; fill them in the provider UI or secret store, not in committed files.
Run `pnpm env:check web` inside the deployed web service and `pnpm env:check worker` inside the deployed worker service before live QA; the check reports missing variable names only, never values.

## Pre-deploy checks

After setting environment variables and applying Supabase migrations:

```bash
pnpm production:check
```

To see all pass/fail gates in one run without stopping at the first blocker:

```bash
pnpm liveqa:plan
pnpm vercel:env:sync
pnpm readiness:report
```

If the combined gate fails, run the pieces individually:

```bash
pnpm verify
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

`pnpm liveqa:plan` prints the two-device human test script and does not mark any checklist item as passed. `pnpm vercel:env:sync` prints a secret-safe Vercel production env sync plan and should be applied after any `.env.local` production changes. `pnpm preflight` must have zero blockers before a buyer meeting. `pnpm deployment:smoke` confirms the deployed HTTPS origin serves `/api/health` and `/login`. `pnpm deployed:preflight` confirms the protected deployed Vercel function sees the same production readiness state using `INTERNAL_WORKER_TOKEN`. `pnpm livekit:smoke` confirms the configured LiveKit API URL/key/secret can list rooms. `pnpm openai:smoke` confirms the configured OpenAI key can authenticate and that Realtime Translation client-secret/WebSocket session-update payloads are accepted. `pnpm recording:storage:configure` can write supplied S3 credentials into `.env.local` without printing values. `pnpm recording:storage:finalize` runs the post-credential sequence: web env check, storage smoke, Vercel env sync, production redeploy, deployment smoke, and deployed preflight. `pnpm recording:storage:smoke` proves the configured recording bucket accepts S3 write/read/delete operations before LiveKit Egress is involved. `pnpm translation:worker:smoke` proves bounded worker startup/cleanup, and `pnpm translation:worker:status` verifies the supervised long-running worker is active for Live QA; real translation still requires the two-device live QA checklist.

## Docker deployment

Build once:

```bash
docker build -t rise-translate .
```

The Docker image has been smoke-built locally with Node 22 and pinned `pnpm@10.30.3`. Keep `packageManager` in `package.json` aligned with the Dockerfile so Corepack does not select an incompatible pnpm release. Node 22 is intentionally used for container runtime compatibility with native WebSocket expectations in the worker dependency chain.

Run the web process:

```bash
docker run --env-file .env.production -p 3000:3000 rise-translate
```

Run the worker process from the same image:

```bash
docker run --env-file .env.production rise-translate pnpm translation:worker
```

For a platform that supports process files, `Procfile` defines:

```text
web: pnpm start
worker: pnpm translation:worker
```

## Platform notes

- Vercel is suitable for the web app, but the LiveKit Node translation worker still needs a separate long-running service such as Render, Railway, Fly.io, a VM, or Docker host.
- Supabase Edge Functions and Cloudflare Pages/Workers are not suitable for the `livekit-node` worker because the worker needs long-lived Node/WebRTC/native media runtime behavior.
- If using separate providers for web and worker, set identical Supabase, LiveKit, OpenAI, recording, and `INTERNAL_WORKER_TOKEN` values in both places.

## Required live acceptance evidence

Before using the app with buyers, fill `.scratch/realtime-translation-meeting-app/qa/LIVE-QA-CHECKLIST.md` with:

- successful host and guest join from the deployed HTTPS link,
- server worker visible in LiveKit but hidden from the human participants UI,
- Korean ↔ target-language interpreted audio heard on the listener device,
- no duplicate browser/server translation audio,
- captions and transcript persistence,
- recording start/stop and storage object creation,
- Markdown notes generated from the transcript,
- meeting-end cleanup and blocked guest re-entry.

## Runtime smoke evidence

Local container checks performed for this deployment artifact:

- `docker build -t rise-translate:codex-smoke .` passed.
- `docker run --rm rise-translate:codex-smoke pnpm --version` returned `10.30.3`.
- Worker smoke inside the container passed with `TRANSLATION_WORKER_MAX_ITERATIONS=1` and `errors=0`.
- Web smoke inside the container served `/login` with HTTP 200.

These checks prove the image starts locally. They do not replace production `pnpm production:check`, `pnpm liveqa:check`, or the two-device live QA checklist.
