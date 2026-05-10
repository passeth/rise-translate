# Production readiness runbook

Use this checklist before using the app for an internal buyer meeting.

## 1. Required environment

All production deployments must configure:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_ENCRYPTION_KEY_BASE64`
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `OPENAI_API_KEY`
- `OPENAI_TRANSLATION_MODEL=gpt-realtime-translate`
- `OPENAI_TRANSCRIPTION_MODEL=gpt-realtime-whisper`
- `INTERNAL_WORKER_TOKEN`
- `TRANSLATION_WORKER_ADAPTER=livekit-node`
- recording S3/Supabase Storage variables when recording is enabled:
  - `LIVEKIT_RECORDING_S3_BUCKET`
  - `LIVEKIT_RECORDING_S3_ACCESS_KEY`
  - `LIVEKIT_RECORDING_S3_SECRET_KEY`
  - optional `LIVEKIT_RECORDING_S3_ENDPOINT` (leave unset to derive the direct Supabase Storage S3 endpoint (`https://<project-ref>.storage.supabase.co/storage/v1/s3`))

Never commit these values to `docs/`, `.scratch/`, source files, or issue files.

Generate a 32-byte app encryption key with:

```bash
openssl rand -base64 32
```

`pnpm preflight` blocks missing, non-base64, or wrong-length encryption keys before hosts create encrypted meeting passwords.

### Deployment/provider setup notes

- `NEXT_PUBLIC_APP_URL` must be the externally reachable HTTPS app origin, for example the Vercel production URL or a custom domain. Do not leave it as `localhost` or plain `http://`; invitation links are generated from this value and browser media permissions require a secure origin.
- Apply all files in `supabase/migrations/` to the target Supabase project before live QA. All app-owned database objects must keep the `rt_` prefix. Then run `pnpm supabase:schema:smoke` against the same environment to verify the required `rt_*` tables and columns are visible to the service role.
- For Supabase Storage recording output, create or choose a private bucket, commonly `recordings`, then create S3-compatible access credentials in Supabase Storage settings. Use:
  - `LIVEKIT_RECORDING_S3_BUCKET=<bucket name>`
  - `LIVEKIT_RECORDING_S3_ACCESS_KEY=<S3 access key id>`
  - `LIVEKIT_RECORDING_S3_SECRET_KEY=<S3 secret access key>`
  - `LIVEKIT_RECORDING_S3_REGION=<region from the S3 configuration page; use auto only if your provider expects it>`
  - leave `LIVEKIT_RECORDING_S3_ENDPOINT` blank unless using a non-Supabase S3-compatible provider; the app derives the direct Supabase Storage S3 endpoint (`https://<project-ref>.storage.supabase.co/storage/v1/s3`).
- The Next.js app and the separate worker process must share the same production env values, especially Supabase, LiveKit, OpenAI, `INTERNAL_WORKER_TOKEN`, `TRANSLATION_WORKER_ADAPTER=livekit-node`, and recording storage settings.
- Use `docs/deployment.md` for web/worker deployment topology. The worker must be a long-running Node service, not a serverless or edge function.
- After creating Supabase S3 credentials, set `LIVEKIT_RECORDING_S3_ACCESS_KEY` and `LIVEKIT_RECORDING_S3_SECRET_KEY` in the current process environment and run `pnpm recording:storage:configure` to update `.env.local` without printing secret values. Run `pnpm recording:storage:finalize -- --dry-run` to inspect the post-credential promotion sequence. Run `pnpm vercel:env:sync` after changing deployment env vars; use `pnpm vercel:env:sync -- --apply` to update Vercel production env without trailing newline bugs, then redeploy. Run `pnpm preflight` after changing deployment env vars. It must have no blockers before a buyer meeting.

## 2. Pre-meeting smoke test

Run before a real buyer call. After production env vars are set, the one-command gate is:

```bash
pnpm production:check
```

If you want a complete status report even while some gates are failing, run:

```bash
pnpm readiness:next
pnpm liveqa:plan
pnpm cost:estimate -- --minutes=60 --lanes=2
pnpm vercel:env:sync
pnpm readiness:report
```

`pnpm readiness:next` is the fast local blocker summary. `pnpm liveqa:plan` prints the two-device human test script without marking anything passed. `pnpm cost:estimate` provides a quick OpenAI Realtime Translation audio estimate using the active translation lane count. Unlike `pnpm production:check`, `pnpm readiness:report` continues through every gate and prints a final failed-gate summary.
If an internal pilot is allowed to proceed with recording disabled until Supabase S3 keys are configured, run `pnpm pilot:check` as a narrower translation-meeting gate. It does not replace the full readiness gates below.
For a machine-readable completion audit, persist the report and map it back to product-readiness requirements:

```bash
pnpm readiness:report -- --json=/tmp/readiness-results.json
pnpm completion:audit /tmp/readiness-results.json
```

If it fails, run the checks individually to isolate the blocker:

1. `pnpm verify`
2. `pnpm preflight` and confirm it has no blockers. The command intentionally exits non-zero while blockers remain, including insecure public URLs, weak encryption key shape, or incomplete recording storage.
3. `pnpm deployment:smoke` and confirm the deployed HTTPS origin serves `/api/health` and `/login`.
4. `pnpm deployed:preflight` and confirm the deployed Vercel function reports no blockers.
5. `pnpm livekit:smoke` and confirm the configured LiveKit URL/key/secret can list rooms.
6. `pnpm openai:smoke` and confirm the configured OpenAI key can authenticate, create a Realtime Translation client secret, and receive a WebSocket `session.updated` acknowledgement.
7. `pnpm supabase:schema:smoke` and confirm all required `rt_*` tables pass after migrations.
8. `pnpm recording:storage:smoke` and confirm the configured recording bucket accepts S3 write/read/delete operations.
9. Open host dashboard and confirm Production preflight has no blockers.
10. Run bounded worker startup smoke:

   ```bash
   pnpm translation:worker:smoke
   pnpm translation:worker:start
   pnpm translation:worker:status
   ```

   Passing `translation:worker:smoke` means the worker starts, performs stale-session cleanup, and exits cleanly. `translation:worker:start/status/stop` supervises the long-running local worker used for Live QA. These checks do **not** prove live translation quality by themselves.

10. Create a test meeting with password.
11. Join as host in one browser and guest in another browser/device.
12. Start the long-running worker in a separate terminal/process:

   ```bash
   TRANSLATION_WORKER_ADAPTER=livekit-node pnpm translation:worker
   ```

13. Start server translation from the host dashboard or the in-room host Translation panel and confirm:
   - the translation worker joins the room as a visible LiveKit participant for track discovery,
   - the human Participants panel hides the translation worker,
   - it subscribes only to the active speaker microphone,
   - the listener hears the selected `translation-<language>` track,
   - original audio remains available for same-language speakers,
   - browser fallback does not duplicate server translation audio.
14. Confirm each participant sees the other participant's mic/camera state.
15. Confirm mic mute/unmute works.
16. Confirm speaker mute and audio mix reset work.
17. Confirm screen share works and only one participant can share at a time.
18. Confirm captions appear after speech and font size changes work.
19. Start/stop recording and confirm participant recording indicator.
20. End the meeting and generate Markdown notes.
21. Confirm guest cannot re-enter or access notes/recording after meeting end.

## 3. Server translation readiness rule

The production translation path uses a separate LiveKit Node worker:

- joins the LiveKit room as a `translation-worker` participant visible to LiveKit clients for track discovery but hidden from the human participant UI,
- subscribes to the requested source microphone track individually,
- streams PCM16 24kHz audio to OpenAI Realtime Translation,
- publishes translated audio back to LiveKit as target-language tracks,
- writes status heartbeats and Korean-compatible transcript segments centrally.

Dry-run mode is allowed only for bounded worker startup smoke tests. Host server-translation start APIs and the in-room readiness panel require live-media readiness and must reject dry-run mode.

Do not mark the system ready for buyer meetings until the two-device smoke test above has passed with the exact target language pair needed for the meeting. Use `pnpm liveqa:plan` to print the run script, record the results in `.scratch/realtime-translation-meeting-app/qa/LIVE-QA-CHECKLIST.md`, run `pnpm liveqa:check`, and keep blockers explicit. Use `pnpm readiness:report` while resolving blockers because it continues through every gate. The final go/no-go sequence is `pnpm readiness:report -- --json=/tmp/readiness-results.json`, `pnpm completion:audit /tmp/readiness-results.json`, and `pnpm readiness:check`; all must pass.

## 4. Incident checklist

If translation fails during a meeting:

1. Confirm original LiveKit audio still works.
2. Confirm `pnpm translation:worker` is still running.
3. Check Dashboard → Operations → Server translation worker preflight and recent `translation_worker_*` events.
4. Check Dashboard → Translation router heartbeat age.
6. Check the in-room Translation panel for fallback policy/rate-limit/reconnect errors.
7. Fall back to original audio plus human-paced speaking if server translation and browser fallback remain unavailable.

If recording fails:

1. Check Production preflight recording storage.
2. Check recent operational events for `recording_*` errors.
3. Verify LiveKit Egress credentials and storage S3 credentials (`LIVEKIT_RECORDING_S3_BUCKET`, `LIVEKIT_RECORDING_S3_ACCESS_KEY`, `LIVEKIT_RECORDING_S3_SECRET_KEY`; endpoint is optional for Supabase Storage).
4. Run `/api/cron/expire-recordings` only with `Authorization: Bearer $INTERNAL_WORKER_TOKEN`.
