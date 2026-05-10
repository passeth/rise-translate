# Translation worker runtime

The translation system is split into two planes:

- **Control plane**: Next.js route handlers validate host access, create/reuse `rt_translation_sessions`, and expose status.
- **Media plane**: a long-lived worker owns one LiveKit microphone track, one OpenAI Realtime Translation session, and one translated LiveKit audio track.

Do **not** run long-lived audio loops inside Next.js route handlers.

## Worker commands

Production/live-media worker:

```bash
TRANSLATION_WORKER_ADAPTER=livekit-node pnpm translation:worker
```

Bounded startup smoke test:

```bash
TRANSLATION_WORKER_ADAPTER=livekit-node \
TRANSLATION_WORKER_MAX_ITERATIONS=1 \
TRANSLATION_WORKER_IDLE_DELAY_MS=10 \
pnpm translation:worker
```

Dry-run smoke testing remains available, but it is intentionally blocked from buyer-meeting server interpretation starts:

```bash
TRANSLATION_WORKER_DRY_RUN=true \
TRANSLATION_WORKER_MAX_ITERATIONS=1 \
TRANSLATION_WORKER_IDLE_DELAY_MS=10 \
pnpm translation:worker
```

Dry-run verifies loop/startup plumbing only. It does **not** forward LiveKit audio, does **not** publish translated audio, and must not be treated as production-ready.

The live worker requires `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and `OPENAI_API_KEY`.

## Current live runtime

`TranslationWorker` claims pending `rt_translation_sessions`, preflights the meeting/source participant, creates a fresh `TranslationBridge` per claimed session, persists status/heartbeats, and emits LiveKit `translation-status` data events.

`runTranslationWorkerLoop()` is the dedicated-process loop boundary: it repeatedly calls `TranslationWorker.runOnce()`, backs off when no sessions are available, and records loop errors without putting long-lived media work inside Next.js route handlers. Claimed sessions can be reclaimed after stale heartbeats so a crashed worker does not permanently strand a translation lane.

Set `TRANSLATION_WORKER_ADAPTER=livekit-node` to use the Node media adapter:

1. Join the LiveKit room as a visible `translation-worker` participant so clients can discover the translated audio track and lane metadata.
2. Hide that worker participant from the human participant UI.
3. Subscribe only to the requested participant's microphone track.
4. Resample/read PCM16 24kHz mono frames through `@livekit/rtc-node`.
5. Send frames to OpenAI Realtime Translation over a server WebSocket.
6. Publish translated PCM audio back into LiveKit as `targetTrackName` (`translation-<language>`).
7. Persist Korean-compatible transcript segments from server-side transcript events.

## Start policy

Host server-translation start APIs require live-media readiness (`allowDryRun: false`). This prevents dry-run sessions from looking connected in a real meeting.

`start-all` is listener scoped:

- reads active/joining participants' listening languages,
- excludes the source participant,
- deduplicates target languages,
- excludes the source language,
- starts only the needed target-language lanes,
- preserves an explicitly empty target-language list as a true no-op.

When no active listener needs translation, the API publishes `idle`/skipped status instead of `starting` and does not write a `translation_start` usage snapshot.

## Production adapter boundary

A production bridge must implement:

1. Attach to the LiveKit room with server credentials.
2. Selectively subscribe to `sourceParticipantIdentity` microphone audio only.
3. Convert/resample frames to OpenAI Realtime's PCM16 24kHz mono boundary.
4. Open the OpenAI Realtime Translation server WebSocket at `/v1/realtime/translations` with `Authorization: Bearer $OPENAI_API_KEY`.
5. Send the same translation session shape used by the browser fallback (`gpt-realtime-translate`, source language, target language, far-field noise reduction, transcription enabled).
6. Stream input audio with `session.input_audio_buffer.append`; server VAD commits speech turns automatically, and `session.close` is the supported shutdown event.
7. Parse OpenAI audio/transcript deltas through `parseRealtimeEvent()` because docs/examples vary between current translation events and older realtime response event names.
8. Publish translated PCM audio as `targetTrackName`, e.g. `translation-ko`, only after the first OpenAI audio frame arrives so clients do not suppress original audio for a silent interpreter track.
9. Update `rt_translation_sessions` and emit `translation-status` LiveKit data events.
10. Close/unpublish LiveKit resources when the pump stops or fails.

The original LiveKit room audio is never replaced; translation remains an additive layer. Clients subscribe to the matching `translation-<listeningLanguage>` track and suppress duplicate browser fallback only for the source speaker whose server lane is active.
