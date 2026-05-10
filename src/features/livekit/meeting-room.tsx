"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ControlBar,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  TrackLoop,
  type TrackReferenceOrPlaceholder,
  useParticipants,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { RoomEvent, Track, type Participant } from "livekit-client";
import { CAPTION_FONT_SIZE_CLASS, type CaptionEvent, type CaptionFontSize } from "@/features/captions/caption-events";
import { getOperationalStatusTone, resolveCaptionConnectionStatus } from "@/features/livekit/operational-status";
import { SUPPORTED_LANGUAGES, isSupportedLanguage, type SupportedLanguageCode } from "@/lib/languages";
import {
  hasActiveBrowserTranslationMix,
  resolveRoomAudioVolume,
  shouldRunBrowserTranslationFallback,
} from "@/features/livekit/room-audio-mix";
import { useRemoteTranslation, type RealtimeTranslationStatus } from "@/features/livekit/realtime-translation";
import { getTranscriptDelta, shouldPersistTranscriptChunk } from "@/features/livekit/transcript-buffer";
import { TRANSLATION_TRACK_PREFIX, getTranslationTrackName } from "@/features/translation/config";
import {
  groupTracksForScreenShareLayout,
  resolveParticipantGridLayout,
  shouldUseScreenShareStage,
} from "@/features/livekit/screen-share-layout";

type LiveKitTokenResponse = {
  token: string;
  url: string;
  roomName: string;
};

type OperationalStatusResponse = {
  translation: { status: string; message: string };
  captions: { status: string; message: string };
  recording: { status: string; message: string };
  notes: { status: string; message: string };
};

type ChatMessage = {
  id: string;
  body: string;
  sentAt: string;
  senderName: string;
  senderCompany: string;
  role: string;
};

type RecordingRoomStatus = {
  status: string;
  message?: string;
};

type ParticipantTranslationSnapshot = {
  participantId: string;
  participantName: string;
  sourceLanguage: SupportedLanguageCode;
  targetLanguage: SupportedLanguageCode;
  hasSourceTrack: boolean;
  enabled: boolean;
  status: RealtimeTranslationStatus;
  error: string | null;
  sourceSubtitle: string;
  translatedSubtitle: string;
  hasOutputAudio: boolean;
  reconnectAttempt: number;
};

type MeetingParticipantMetadata = {
  role: "host" | "guest" | string;
  meetingId: string | null;
  participantId: string | null;
};

type TranslationServerReadiness = {
  ready: boolean;
  mode: "dry-run" | "livekit-node" | "unavailable";
  message: string;
};

type InRoomTranslationSession = {
  id: string;
  source_identity: string;
  source_language: string;
  target_language: string;
  status: string;
  last_error: string | null;
  updated_at: string;
  worker_heartbeat_at: string | null;
};

type InRoomTranslationStatusPayload = {
  serverReadiness: TranslationServerReadiness;
  sessions: InRoomTranslationSession[];
};

const ACTIVE_SERVER_TRANSLATION_STATUSES = new Set(["starting", "connected", "reconnecting"]);
// Keep interpretation audio on the server bridge only. The browser fallback opens
// separate Realtime sessions per listener and can produce a different voice than
// the server-published interpretation track, which sounds like the interpreter
// voice changes mid-meeting.
const SERVER_BRIDGE_TRANSLATION_AUDIO_ONLY = true;

export function MeetingRoom({ publicToken }: { publicToken: string }) {
  const [connection, setConnection] = useState<LiveKitTokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadToken() {
      try {
        const response = await fetch("/api/livekit/token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ publicToken }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error ?? "Unable to join meeting room.");
        }

        const payload = (await response.json()) as LiveKitTokenResponse;
        if (!cancelled) {
          setConnection(payload);
        }
      } catch (tokenError) {
        if (!cancelled) {
          setError(tokenError instanceof Error ? tokenError.message : "Unable to join meeting room.");
        }
      }
    }

    void loadToken();

    return () => {
      cancelled = true;
    };
  }, [publicToken]);

  if (error) {
    return (
      <RoomShell
        title="Unable to join"
        description={error}
        action={
          error === "Guest session is required"
            ? { label: "Go to guest join page", href: `/meeting/${publicToken}` }
            : undefined
        }
      />
    );
  }

  if (!connection) {
    return <RoomShell title="Preparing room" description="Creating your secure LiveKit connection..." />;
  }

  return (
    <LiveKitRoom
      token={connection.token}
      serverUrl={connection.url}
      connect
      video
      audio
      className="min-h-screen bg-slate-950"
    >
      <MeetingWorkspace publicToken={publicToken} />
    </LiveKitRoom>
  );
}

function MeetingWorkspace({ publicToken }: { publicToken: string }) {
  const room = useRoomContext();
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const visibleTracks = useMemo(() => tracks.filter((track) => !parseTranslationWorkerMetadata(track.participant.metadata)), [tracks]);
  const { screenShareTracks, cameraTracks } = useMemo(() => groupTracksForScreenShareLayout(visibleTracks), [visibleTracks]);
  const useScreenShareStage = useMemo(() => shouldUseScreenShareStage(visibleTracks), [visibleTracks]);
  const participants = useParticipants();
  const [refreshKey, setRefreshKey] = useState(0);
  const [screenShareError, setScreenShareError] = useState<string | null>(null);
  const [microphoneError, setMicrophoneError] = useState<string | null>(null);
  const [recordingStatus, setRecordingStatus] = useState<RecordingRoomStatus | null>(null);
  const [translationEnabled, setTranslationEnabled] = useState(true);
  const [translationPreferencePending, setTranslationPreferencePending] = useState(false);
  const [translationPreferenceError, setTranslationPreferenceError] = useState<string | null>(null);
  const [audioMuted, setAudioMuted] = useState(false);
  const [sourceAudioVolume, setSourceAudioVolume] = useState(0.18);
  const [translatedAudioVolume, setTranslatedAudioVolume] = useState(1);
  const [speakingLanguage, setSpeakingLanguage] = useState<SupportedLanguageCode>(() =>
    resolveMetadataLanguage(room.localParticipant.metadata, "speakingLanguage", "ko"),
  );
  const [listeningLanguage, setListeningLanguage] = useState<SupportedLanguageCode>(() =>
    resolveMetadataLanguage(room.localParticipant.metadata, "listeningLanguage", "ko"),
  );
  const [translationSnapshots, setTranslationSnapshots] = useState<Record<string, ParticipantTranslationSnapshot>>({});
  const localMeetingMetadata = useMemo(
    () => parseMeetingParticipantMetadata(room.localParticipant.metadata),
    [room.localParticipant.metadata],
  );

  useEffect(() => {
    const refresh = () => setRefreshKey((value) => value + 1);
    const handleDataReceived = (payload: Uint8Array, _participant?: unknown, _kind?: unknown, topic?: string) => {
      if (topic !== "recording-status") return;
      try {
        const event = JSON.parse(new TextDecoder().decode(payload)) as { type?: string; status?: string; message?: string };
        if (event.type === "recording_status" && event.status) {
          setRecordingStatus({ status: event.status, message: event.message });
        }
      } catch {
        // Ignore malformed room data events.
      }
    };
    const markLeft = () => {
      void fetch("/api/livekit/leave", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publicToken, identity: room.localParticipant.identity }),
        keepalive: true,
      });
    };
    room.on(RoomEvent.TrackPublished, refresh);
    room.on(RoomEvent.TrackUnpublished, refresh);
    room.on(RoomEvent.TrackMuted, refresh);
    room.on(RoomEvent.TrackUnmuted, refresh);
    room.on(RoomEvent.LocalTrackPublished, refresh);
    room.on(RoomEvent.LocalTrackUnpublished, refresh);
    room.on(RoomEvent.TrackSubscribed, refresh);
    room.on(RoomEvent.TrackUnsubscribed, refresh);
    room.on(RoomEvent.ParticipantConnected, refresh);
    room.on(RoomEvent.ParticipantDisconnected, refresh);
    room.on(RoomEvent.ParticipantMetadataChanged, refresh);
    room.on(RoomEvent.Disconnected, markLeft);
    room.on(RoomEvent.DataReceived, handleDataReceived);
    window.addEventListener("beforeunload", markLeft);

    return () => {
      room.off(RoomEvent.TrackPublished, refresh);
      room.off(RoomEvent.TrackUnpublished, refresh);
      room.off(RoomEvent.TrackMuted, refresh);
      room.off(RoomEvent.TrackUnmuted, refresh);
      room.off(RoomEvent.LocalTrackPublished, refresh);
      room.off(RoomEvent.LocalTrackUnpublished, refresh);
      room.off(RoomEvent.TrackSubscribed, refresh);
      room.off(RoomEvent.TrackUnsubscribed, refresh);
      room.off(RoomEvent.ParticipantConnected, refresh);
      room.off(RoomEvent.ParticipantDisconnected, refresh);
      room.off(RoomEvent.ParticipantMetadataChanged, refresh);
      room.off(RoomEvent.Disconnected, markLeft);
      room.off(RoomEvent.DataReceived, handleDataReceived);
      window.removeEventListener("beforeunload", markLeft);
    };
  }, [publicToken, room]);

  const activeSharer = useMemo(() => {
    void refreshKey;
    return participants.find((participant) => participant.isScreenShareEnabled);
  }, [participants, refreshKey]);

  useEffect(() => {
    const desiredTrackName = getTranslationTrackName(listeningLanguage);
    const translatedSourceIdentities = new Set<string>();

    for (const participant of room.remoteParticipants.values()) {
      const translationWorkerMetadata = parseTranslationWorkerMetadata(participant.metadata);
      for (const publication of participant.trackPublications.values()) {
        const trackName = publication.trackName;
        if (publication.kind !== Track.Kind.Audio || !trackName?.startsWith(`${TRANSLATION_TRACK_PREFIX}-`)) {
          continue;
        }

        const shouldSubscribe = trackName === desiredTrackName;
        if (shouldSubscribe && !publication.isMuted && translationWorkerMetadata?.sourceIdentity) {
          translatedSourceIdentities.add(translationWorkerMetadata.sourceIdentity);
        }
        publication.setSubscribed(shouldSubscribe);
      }
    }

    for (const participant of room.remoteParticipants.values()) {
      const participantSpeakingLanguage = resolveMetadataLanguage(participant.metadata, "speakingLanguage", "ko");
      for (const publication of participant.trackPublications.values()) {
        if (publication.kind !== Track.Kind.Audio || publication.trackName?.startsWith(`${TRANSLATION_TRACK_PREFIX}-`)) {
          continue;
        }

        const shouldHearOriginal =
          !translatedSourceIdentities.has(participant.identity) || participantSpeakingLanguage === listeningLanguage;
        publication.setSubscribed(shouldHearOriginal);
      }
    }
  }, [listeningLanguage, refreshKey, room]);

  const isLocalSharing = room.localParticipant.isScreenShareEnabled;
  const isMicrophoneEnabled = room.localParticipant.isMicrophoneEnabled;
  const sharingDisabled = Boolean(activeSharer && !isLocalSharing);
  const serverTranslatedSourceIdentities = useMemo(() => {
    void refreshKey;
    const desiredTrackName = getTranslationTrackName(listeningLanguage);
    const identities = new Set<string>();

    for (const participant of room.remoteParticipants.values()) {
      const translationWorkerMetadata = parseTranslationWorkerMetadata(participant.metadata);
      if (!translationWorkerMetadata?.sourceIdentity) continue;

      for (const publication of participant.trackPublications.values()) {
        if (
          publication.kind === Track.Kind.Audio &&
          publication.trackName === desiredTrackName &&
          !publication.isMuted
        ) {
          identities.add(translationWorkerMetadata.sourceIdentity);
        }
      }
    }

    return identities;
  }, [listeningLanguage, refreshKey, room]);
  const serverTranslationTrackActive = useMemo(() => {
    return serverTranslatedSourceIdentities.size > 0;
  }, [serverTranslatedSourceIdentities]);
  const browserTranslationMixActive = useMemo(
    () => hasActiveBrowserTranslationMix(Object.values(translationSnapshots)),
    [translationSnapshots],
  );
  const roomAudioVolume = resolveRoomAudioVolume({
    serverTranslationTrackActive,
    browserTranslationMixActive,
    translatedAudioVolume,
    sourceAudioVolume,
  });

  async function toggleMicrophone() {
    setMicrophoneError(null);

    try {
      await room.localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setMicrophoneError(error instanceof Error ? error.message : "Unable to update microphone.");
    }
  }

  async function toggleScreenShare() {
    setScreenShareError(null);
    if (sharingDisabled) {
      return;
    }

    try {
      await room.localParticipant.setScreenShareEnabled(!isLocalSharing);
    } catch (error) {
      setScreenShareError(error instanceof Error ? error.message : "Unable to update screen share.");
    }
  }

  const updateTranslationSnapshot = useCallback((snapshot: ParticipantTranslationSnapshot) => {
    setTranslationSnapshots((current) => ({ ...current, [snapshot.participantId]: snapshot }));
  }, []);

  const removeTranslationSnapshot = useCallback((participantId: string) => {
    setTranslationSnapshots((current) => {
      if (!current[participantId]) return current;
      const next = { ...current };
      delete next[participantId];
      return next;
    });
  }, []);

  const applyLocalTranslationPreferences = useCallback(
    async (nextSpeakingLanguage: SupportedLanguageCode, nextListeningLanguage: SupportedLanguageCode) => {
      setTranslationPreferencePending(true);
      setTranslationPreferenceError(null);

      try {
        const response = await fetch(`/api/public-meetings/${publicToken}/participants/preferences`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            identity: room.localParticipant.identity,
            speakingLanguage: nextSpeakingLanguage,
            listeningLanguage: nextListeningLanguage,
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error ?? "Unable to save translation preferences.");
        }

        const nextMetadata = buildLocalParticipantMetadata(room.localParticipant.metadata, {
          speakingLanguage: nextSpeakingLanguage,
          listeningLanguage: nextListeningLanguage,
        });

        await room.localParticipant.setMetadata(nextMetadata);
        setSpeakingLanguage(nextSpeakingLanguage);
        setListeningLanguage(nextListeningLanguage);
        setRefreshKey((value) => value + 1);
      } catch (error) {
        setTranslationPreferenceError(error instanceof Error ? error.message : "Unable to save translation preferences.");
      } finally {
        setTranslationPreferencePending(false);
      }
    },
    [publicToken, room.localParticipant],
  );

  const handleSpeakingLanguageChange = useCallback(
    (language: SupportedLanguageCode) => {
      void applyLocalTranslationPreferences(language, listeningLanguage);
    },
    [applyLocalTranslationPreferences, listeningLanguage],
  );

  const handleListeningLanguageChange = useCallback(
    (language: SupportedLanguageCode) => {
      void applyLocalTranslationPreferences(speakingLanguage, language);
    },
    [applyLocalTranslationPreferences, speakingLanguage],
  );

  return (
    <main className="grid min-h-screen grid-rows-[1fr_auto] bg-slate-950 text-white lg:grid-cols-[1fr_360px] lg:grid-rows-[1fr_auto]">
      <section className="min-h-0 p-4 lg:col-start-1">
        {activeSharer ? (
          <div className="mb-3 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-50">
            {activeSharer.name ?? activeSharer.identity} is sharing their screen.
          </div>
        ) : null}
        {recordingStatus ? (
          <div className="mb-3 rounded-2xl border border-red-300/30 bg-red-300/10 px-4 py-3 text-sm text-red-50">
            Recording is {recordingStatus.status}. {recordingStatus.message ?? ""}
          </div>
        ) : null}
        {screenShareError ? (
          <div className="mb-3 rounded-2xl border border-red-300/30 bg-red-300/10 px-4 py-3 text-sm text-red-100">
            {screenShareError}
          </div>
        ) : null}
        {microphoneError ? (
          <div className="mb-3 rounded-2xl border border-red-300/30 bg-red-300/10 px-4 py-3 text-sm text-red-100">
            {microphoneError}
          </div>
        ) : null}
        {useScreenShareStage ? (
          <div className="grid h-[calc(100vh-180px)] min-h-[520px] grid-rows-[4fr_1fr] gap-3 rounded-3xl bg-slate-950/70 lg:grid-cols-[4fr_1fr] lg:grid-rows-1">
            <ParticipantTrackGrid
              tracks={screenShareTracks}
              label="Shared screen"
              className="min-h-0 overflow-hidden rounded-3xl bg-slate-900 p-2 ring-1 ring-cyan-300/30"
              tileClassName="min-h-0"
            />
            {cameraTracks.length > 0 ? (
              <ParticipantTrackGrid
                tracks={cameraTracks}
                label="Participants"
                compact
                className="min-h-0 overflow-hidden rounded-2xl bg-slate-900/80 p-2"
                tileClassName="min-h-[96px]"
              />
            ) : null}
          </div>
        ) : (
          <ParticipantTrackGrid
            tracks={cameraTracks}
            label="Participants"
            className="h-[calc(100vh-180px)] min-h-[420px] rounded-3xl bg-slate-900 p-3"
            tileClassName="min-h-[180px]"
          />
        )}
      </section>

      <aside className="min-h-0 border-t border-white/10 bg-slate-900/80 p-4 lg:col-start-2 lg:row-span-2 lg:border-l lg:border-t-0">
        <RoomSidePanel
          publicToken={publicToken}
          speakingLanguage={speakingLanguage}
          listeningLanguage={listeningLanguage}
          translationEnabled={translationEnabled}
          preferencePending={translationPreferencePending}
          preferenceError={translationPreferenceError}
          audioMuted={audioMuted}
          sourceAudioVolume={sourceAudioVolume}
          translatedAudioVolume={translatedAudioVolume}
          translationSnapshots={translationSnapshots}
          localMeetingMetadata={localMeetingMetadata}
          serverTranslatedSourceIdentities={serverTranslatedSourceIdentities}
          onSpeakingLanguageChange={handleSpeakingLanguageChange}
          onListeningLanguageChange={handleListeningLanguageChange}
          onTranslationEnabledChange={setTranslationEnabled}
          onAudioMutedChange={setAudioMuted}
          onSourceAudioVolumeChange={setSourceAudioVolume}
          onTranslatedAudioVolumeChange={setTranslatedAudioVolume}
        />
      </aside>

      <ParticipantTranslationLayer
        publicToken={publicToken}
        enabled={translationEnabled}
        targetLanguage={listeningLanguage}
        serverBridgePreferred={SERVER_BRIDGE_TRANSLATION_AUDIO_ONLY}
        serverTranslatedSourceIdentities={serverTranslatedSourceIdentities}
        translatedVolume={audioMuted ? 0 : translatedAudioVolume}
        onSnapshot={updateTranslationSnapshot}
        onRemoveSnapshot={removeTranslationSnapshot}
      />

      <footer className="flex flex-wrap items-center justify-center gap-3 border-t border-white/10 bg-slate-950 p-4 lg:col-start-1">
        <button
          type="button"
          onClick={toggleMicrophone}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            isMicrophoneEnabled ? "border border-white/15 text-white hover:bg-white/10" : "bg-red-300 text-slate-950 hover:bg-red-200"
          }`}
        >
          {isMicrophoneEnabled ? "Mute mic" : "Unmute mic"}
        </button>
        <button
          type="button"
          onClick={() => setAudioMuted((current) => !current)}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            audioMuted ? "bg-red-300 text-slate-950 hover:bg-red-200" : "border border-white/15 text-white hover:bg-white/10"
          }`}
        >
          {audioMuted ? "Unmute speakers" : "Mute speakers"}
        </button>
        <button
          type="button"
          disabled={sharingDisabled}
          onClick={toggleScreenShare}
          className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isLocalSharing ? "Stop sharing" : "Share screen"}
        </button>
        {sharingDisabled ? (
          <span className="text-xs text-slate-400">Screen sharing is locked while another participant is sharing.</span>
        ) : null}
        <ControlBar controls={{ screenShare: false }} />
      </footer>
      <RoomAudioRenderer
        muted={audioMuted}
        volume={roomAudioVolume}
      />
    </main>
  );
}

function ParticipantTrackGrid({
  tracks,
  label,
  compact = false,
  className,
  tileClassName,
}: {
  tracks: TrackReferenceOrPlaceholder[];
  label: string;
  compact?: boolean;
  className: string;
  tileClassName?: string;
}) {
  const layout = resolveParticipantGridLayout(tracks.length, { compact });

  return (
    <div className={className} aria-label={label}>
      <div
        className={`grid place-content-center gap-3 ${compact ? "overflow-y-auto" : "h-full"}`}
        style={{
          gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
          width: layout.width,
          height: layout.height,
          margin: "0 auto",
        }}
      >
        <TrackLoop tracks={tracks}>
          <ParticipantTile className={`overflow-hidden rounded-2xl bg-slate-950 ${tileClassName ?? ""}`} />
        </TrackLoop>
      </div>
    </div>
  );
}

function ParticipantTranslationLayer({
  publicToken,
  enabled,
  targetLanguage,
  serverBridgePreferred,
  serverTranslatedSourceIdentities,
  translatedVolume,
  onSnapshot,
  onRemoveSnapshot,
}: {
  publicToken: string;
  enabled: boolean;
  targetLanguage: SupportedLanguageCode;
  serverBridgePreferred: boolean;
  serverTranslatedSourceIdentities: Set<string>;
  translatedVolume: number;
  onSnapshot: (snapshot: ParticipantTranslationSnapshot) => void;
  onRemoveSnapshot: (participantId: string) => void;
}) {
  const room = useRoomContext();
  const participants = useParticipants();

  return (
    <div className="pointer-events-none fixed bottom-24 left-4 z-50 max-w-xl space-y-2">
      {participants
        .filter((participant) => participant.identity !== room.localParticipant.identity)
        .filter((participant) => !parseTranslationWorkerMetadata(participant.metadata))
        .filter((participant) =>
          shouldRunBrowserTranslationFallback({
            enabled,
            serverBridgePreferred,
            serverTranslatedSourceActive: serverTranslatedSourceIdentities.has(participant.identity),
          }),
        )
        .map((participant) => (
          <ParticipantTranslationBridge
            key={`${participant.identity}-${targetLanguage}-${enabled ? "on" : "off"}`}
            participant={participant}
            publicToken={publicToken}
            targetLanguage={targetLanguage}
            listenerIdentity={room.localParticipant.identity}
            translationEnabled={enabled}
            translatedVolume={translatedVolume}
            onSnapshot={onSnapshot}
            onRemoveSnapshot={onRemoveSnapshot}
          />
        ))}
    </div>
  );
}

function ParticipantTranslationBridge({
  participant,
  publicToken,
  targetLanguage,
  listenerIdentity,
  translationEnabled,
  translatedVolume,
  onSnapshot,
  onRemoveSnapshot,
}: {
  participant: Participant;
  publicToken: string;
  targetLanguage: SupportedLanguageCode;
  listenerIdentity: string;
  translationEnabled: boolean;
  translatedVolume: number;
  onSnapshot: (snapshot: ParticipantTranslationSnapshot) => void;
  onRemoveSnapshot: (participantId: string) => void;
}) {
  const sourceLanguage = resolveMetadataLanguage(participant.metadata, "speakingLanguage", "ko");
  const sourceTrack = getParticipantAudioMediaStreamTrack(participant);
  const enabled = Boolean(translationEnabled && sourceTrack && sourceLanguage !== targetLanguage);
  const translation = useRemoteTranslation({
    enabled,
    publicToken,
    sourceIdentity: participant.identity,
    listenerIdentity,
    sourceTrack,
    sourceLanguage,
    targetLanguage,
    sourceTranscriptionEnabled: true,
    noiseReductionEnabled: true,
    translatedVolume,
  });
  const lastPersistedRef = useRef({ sourceText: "", translatedText: "" });

  const postTranslationStatus = useCallback(
    (status: "starting" | "connected" | "reconnecting" | "failed" | "stopped", message?: string, heartbeat = false) => {
      void fetch(`/api/public-meetings/${publicToken}/translation-status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceIdentity: participant.identity,
          targetLanguage,
          status,
          message,
          heartbeat,
        }),
      });
    },
    [participant.identity, publicToken, targetLanguage],
  );

  useEffect(() => {
    if (!enabled) return;
    const status = mapRealtimeStatusToSessionStatus(translation.status);
    if (!status) return;
    postTranslationStatus(status, translation.error ?? undefined);
  }, [enabled, postTranslationStatus, translation.error, translation.status]);

  useEffect(() => {
    if (!enabled) return;
    return () => postTranslationStatus("stopped", "Browser translation bridge stopped.");
  }, [enabled, postTranslationStatus]);

  useEffect(() => {
    if (!enabled || !["connected", "reconnecting"].includes(translation.status)) return;

    const heartbeatTimer = window.setInterval(() => {
      const status = mapRealtimeStatusToSessionStatus(translation.status);
      if (status) {
        postTranslationStatus(status, undefined, true);
      }
    }, 15_000);

    return () => window.clearInterval(heartbeatTimer);
  }, [enabled, postTranslationStatus, translation.status]);

  useEffect(() => {
    onSnapshot({
      participantId: participant.identity,
      participantName: participant.name ?? participant.identity,
      sourceLanguage,
      targetLanguage,
      hasSourceTrack: Boolean(sourceTrack),
      enabled,
      status: translation.status,
      error: translation.error,
      sourceSubtitle: translation.sourceSubtitle,
      translatedSubtitle: translation.translatedSubtitle,
      hasOutputAudio: translation.hasOutputAudio,
      reconnectAttempt: translation.reconnectAttempt,
    });
  }, [
    enabled,
    onSnapshot,
    participant.identity,
    participant.name,
    sourceLanguage,
    sourceTrack,
    targetLanguage,
    translation.error,
    translation.hasOutputAudio,
    translation.reconnectAttempt,
    translation.sourceSubtitle,
    translation.status,
    translation.translatedSubtitle,
  ]);

  useEffect(() => {
    return () => onRemoveSnapshot(participant.identity);
  }, [onRemoveSnapshot, participant.identity]);

  useEffect(() => {
    if (!enabled || !translation.sourceTranscript.trim()) return;

    const sourceText = translation.sourceTranscript.trim();
    const translatedText = translation.translatedTranscript.trim();
    const sourceDelta = getTranscriptDelta(lastPersistedRef.current.sourceText, sourceText);
    const translatedDelta = getTranscriptDelta(lastPersistedRef.current.translatedText, translatedText);
    if (!shouldPersistTranscriptChunk({ sourceDelta, translatedDelta })) return;
    lastPersistedRef.current.sourceText = sourceText;
    lastPersistedRef.current.translatedText = translatedText;

    void fetch(`/api/public-meetings/${publicToken}/transcripts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceIdentity: participant.identity,
        sourceLanguage,
        targetLanguage,
        sourceText: sourceDelta,
        translatedText: translatedDelta || undefined,
        startedAt: new Date().toISOString(),
        isFinal: false,
      }),
    });
  }, [enabled, participant.identity, publicToken, sourceLanguage, targetLanguage, translation.sourceTranscript, translation.translatedTranscript]);

  if (
    !enabled ||
    (!translation.translatedSubtitle &&
      translation.status !== "connecting" &&
      translation.status !== "reconnecting" &&
      translation.status !== "error")
  ) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-cyan-300/30 bg-slate-950/90 p-4 text-sm text-white shadow-2xl backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">
        Live translation · {sourceLanguage} → {targetLanguage} · {translation.status}
      </p>
      {translation.sourceSubtitle ? <p className="mt-2 text-slate-400">{translation.sourceSubtitle}</p> : null}
      {translation.translatedSubtitle ? <p className="mt-1 text-lg font-semibold">{translation.translatedSubtitle}</p> : null}
      {translation.status === "reconnecting" ? (
        <p className="mt-2 text-amber-100">Reconnecting interpreter audio{translation.reconnectAttempt ? ` (attempt ${translation.reconnectAttempt})` : ""}...</p>
      ) : null}
      {translation.error ? <p className="mt-2 text-red-200">{formatTranslationError(translation.error)}</p> : null}
    </div>
  );
}


function mapRealtimeStatusToSessionStatus(status: RealtimeTranslationStatus) {
  if (status === "connecting") return "starting";
  if (status === "connected") return "connected";
  if (status === "reconnecting") return "reconnecting";
  if (status === "error") return "failed";
  return null;
}


function buildLocalParticipantMetadata(
  metadata: string | undefined,
  preferences: { speakingLanguage: SupportedLanguageCode; listeningLanguage: SupportedLanguageCode },
) {
  try {
    return JSON.stringify({
      ...(metadata ? (JSON.parse(metadata) as Record<string, unknown>) : {}),
      speakingLanguage: preferences.speakingLanguage,
      listeningLanguage: preferences.listeningLanguage,
    });
  } catch {
    return JSON.stringify(preferences);
  }
}

function resolveMetadataLanguage(
  metadata: string | undefined,
  key: "speakingLanguage" | "listeningLanguage",
  fallback: SupportedLanguageCode,
): SupportedLanguageCode {
  if (!metadata) return fallback;

  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>;
    const language = parsed[key];
    return typeof language === "string" && isSupportedLanguage(language) ? language : fallback;
  } catch {
    return fallback;
  }
}

function parseTranslationWorkerMetadata(metadata: string | undefined) {
  if (!metadata) return null;

  try {
    const parsed = JSON.parse(metadata) as {
      role?: string;
      sourceIdentity?: string;
      targetLanguage?: string;
    };

    if (parsed.role !== "translation-worker" || !parsed.sourceIdentity || !parsed.targetLanguage) {
      return null;
    }

    return {
      sourceIdentity: parsed.sourceIdentity,
      targetLanguage: parsed.targetLanguage,
    };
  } catch {
    return null;
  }
}

function parseMeetingParticipantMetadata(metadata: string | undefined): MeetingParticipantMetadata {
  if (!metadata) {
    return { role: "guest", meetingId: null, participantId: null };
  }

  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>;
    return {
      role: typeof parsed.role === "string" ? parsed.role : "guest",
      meetingId: typeof parsed.meetingId === "string" ? parsed.meetingId : null,
      participantId: typeof parsed.participantId === "string" ? parsed.participantId : null,
    };
  } catch {
    return { role: "guest", meetingId: null, participantId: null };
  }
}

function getParticipantAudioMediaStreamTrack(participant: Participant) {
  const audioTrack = participant.getTrackPublication(Track.Source.Microphone)?.audioTrack ?? null;
  if (!audioTrack || typeof audioTrack !== "object") return null;
  const mediaStreamTrack = (audioTrack as { mediaStreamTrack?: unknown }).mediaStreamTrack;
  return mediaStreamTrack instanceof MediaStreamTrack ? mediaStreamTrack : null;
}


function RoomSidePanel({
  publicToken,
  speakingLanguage,
  listeningLanguage,
  translationEnabled,
  preferencePending,
  preferenceError,
  audioMuted,
  sourceAudioVolume,
  translatedAudioVolume,
  translationSnapshots,
  localMeetingMetadata,
  serverTranslatedSourceIdentities,
  onSpeakingLanguageChange,
  onListeningLanguageChange,
  onTranslationEnabledChange,
  onAudioMutedChange,
  onSourceAudioVolumeChange,
  onTranslatedAudioVolumeChange,
}: {
  publicToken: string;
  speakingLanguage: SupportedLanguageCode;
  listeningLanguage: SupportedLanguageCode;
  translationEnabled: boolean;
  preferencePending: boolean;
  preferenceError: string | null;
  audioMuted: boolean;
  sourceAudioVolume: number;
  translatedAudioVolume: number;
  translationSnapshots: Record<string, ParticipantTranslationSnapshot>;
  localMeetingMetadata: MeetingParticipantMetadata;
  serverTranslatedSourceIdentities: Set<string>;
  onSpeakingLanguageChange: (language: SupportedLanguageCode) => void;
  onListeningLanguageChange: (language: SupportedLanguageCode) => void;
  onTranslationEnabledChange: (enabled: boolean) => void;
  onAudioMutedChange: (muted: boolean) => void;
  onSourceAudioVolumeChange: (volume: number) => void;
  onTranslatedAudioVolumeChange: (volume: number) => void;
}) {
  const [activeTab, setActiveTab] = useState<"captions" | "chat" | "participants" | "translation">("translation");
  const participants = useParticipants();
  const visibleParticipants = participants.filter((participant) => !parseTranslationWorkerMetadata(participant.metadata));

  return (
    <div className="flex h-full min-h-[360px] flex-col">
      <div className="grid grid-cols-4 rounded-full bg-white/10 p-1 text-xs">
        {(["translation", "captions", "chat", "participants"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-full px-3 py-2 font-semibold capitalize transition ${
              activeTab === tab ? "bg-cyan-300 text-slate-950" : "text-slate-300 hover:bg-white/10"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <OperationalStatusStrip publicToken={publicToken} />

      <div className="mt-4 min-h-0 flex-1 overflow-hidden">
        {activeTab === "translation" ? (
          <TranslationControlPanel
            speakingLanguage={speakingLanguage}
            listeningLanguage={listeningLanguage}
            enabled={translationEnabled}
            preferencePending={preferencePending}
            preferenceError={preferenceError}
            audioMuted={audioMuted}
            sourceAudioVolume={sourceAudioVolume}
            translatedAudioVolume={translatedAudioVolume}
            snapshots={translationSnapshots}
            localMeetingMetadata={localMeetingMetadata}
            serverTranslatedSourceIdentities={serverTranslatedSourceIdentities}
            onSpeakingLanguageChange={onSpeakingLanguageChange}
            onListeningLanguageChange={onListeningLanguageChange}
            onEnabledChange={onTranslationEnabledChange}
            onAudioMutedChange={onAudioMutedChange}
            onSourceAudioVolumeChange={onSourceAudioVolumeChange}
            onTranslatedAudioVolumeChange={onTranslatedAudioVolumeChange}
          />
        ) : null}
        {activeTab === "chat" ? <ChatPanel publicToken={publicToken} /> : null}
        {activeTab === "captions" ? <CaptionPanel publicToken={publicToken} listeningLanguage={listeningLanguage} /> : null}
        {activeTab === "participants" ? (
          <div className="space-y-3 overflow-auto pr-1">
            {visibleParticipants.map((participant) => {
              const participantSpeakingLanguage = resolveMetadataLanguage(participant.metadata, "speakingLanguage", "ko");
              const participantListeningLanguage = resolveMetadataLanguage(participant.metadata, "listeningLanguage", "ko");
              return (
                <div key={participant.identity} className="rounded-2xl bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{participant.name ?? participant.identity}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        Speaks {labelLanguage(participantSpeakingLanguage)} · Listens {labelLanguage(participantListeningLanguage)}
                      </p>
                    </div>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200">
                      {participant.isMicrophoneEnabled ? "Mic on" : "Muted"}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300">
                    <span className="rounded-xl bg-slate-950/50 px-3 py-2">Camera {participant.isCameraEnabled ? "on" : "off"}</span>
                    <span className="rounded-xl bg-slate-950/50 px-3 py-2">Screen {participant.isScreenShareEnabled ? "sharing" : "off"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}


function TranslationControlPanel({
  speakingLanguage,
  listeningLanguage,
  enabled,
  preferencePending,
  preferenceError,
  audioMuted,
  sourceAudioVolume,
  translatedAudioVolume,
  snapshots,
  localMeetingMetadata,
  serverTranslatedSourceIdentities,
  onSpeakingLanguageChange,
  onListeningLanguageChange,
  onEnabledChange,
  onAudioMutedChange,
  onSourceAudioVolumeChange,
  onTranslatedAudioVolumeChange,
}: {
  speakingLanguage: SupportedLanguageCode;
  listeningLanguage: SupportedLanguageCode;
  enabled: boolean;
  preferencePending: boolean;
  preferenceError: string | null;
  audioMuted: boolean;
  sourceAudioVolume: number;
  translatedAudioVolume: number;
  snapshots: Record<string, ParticipantTranslationSnapshot>;
  localMeetingMetadata: MeetingParticipantMetadata;
  serverTranslatedSourceIdentities: Set<string>;
  onSpeakingLanguageChange: (language: SupportedLanguageCode) => void;
  onListeningLanguageChange: (language: SupportedLanguageCode) => void;
  onEnabledChange: (enabled: boolean) => void;
  onAudioMutedChange: (muted: boolean) => void;
  onSourceAudioVolumeChange: (volume: number) => void;
  onTranslatedAudioVolumeChange: (volume: number) => void;
}) {
  const participants = useParticipants();
  const snapshotList = Object.values(snapshots);
  const browserActiveCount = snapshotList.filter((snapshot) => snapshot.enabled && snapshot.status === "connected").length;
  const browserConnectingCount = snapshotList.filter((snapshot) => snapshot.enabled && ["connecting", "reconnecting"].includes(snapshot.status)).length;
  const errorCount = snapshotList.filter((snapshot) => snapshot.status === "error").length;
  const [serverControlError, setServerControlError] = useState<string | null>(null);
  const [serverControlBusyIdentity, setServerControlBusyIdentity] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<InRoomTranslationStatusPayload | null>(null);
  const [isServerControlPending, startServerControlTransition] = useTransition();
  const visibleParticipants = participants.filter((participant) => !parseTranslationWorkerMetadata(participant.metadata));
  const hostCanControlServerTranslation = localMeetingMetadata.role === "host" && Boolean(localMeetingMetadata.meetingId);
  const serverStartUnavailable = serverStatus?.serverReadiness.ready === false;
  const activeServerSourceIdentities = useMemo(
    () =>
      new Set(
        (serverStatus?.sessions ?? [])
          .filter((session) => ACTIVE_SERVER_TRANSLATION_STATUSES.has(session.status))
          .map((session) => session.source_identity),
      ),
    [serverStatus],
  );
  const serverAudibleCount = serverTranslatedSourceIdentities.size;
  const serverStartingCount = [...activeServerSourceIdentities].filter(
    (identity) => !serverTranslatedSourceIdentities.has(identity),
  ).length;
  const activeCount = browserActiveCount + serverAudibleCount;
  const connectingCount = browserConnectingCount + serverStartingCount;

  const loadServerStatus = useCallback(async () => {
    if (!hostCanControlServerTranslation || !localMeetingMetadata.meetingId) {
      return;
    }

    const response = await fetch(`/api/meetings/${localMeetingMetadata.meetingId}/translation/status`, {
      cache: "no-store",
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setServerControlError(payload.error ?? "Unable to load server translation status.");
      return;
    }

    setServerStatus((await response.json()) as InRoomTranslationStatusPayload);
  }, [hostCanControlServerTranslation, localMeetingMetadata.meetingId]);

  useEffect(() => {
    if (!hostCanControlServerTranslation) return;
    const initialTimer = window.setTimeout(() => void loadServerStatus(), 0);
    const interval = window.setInterval(() => void loadServerStatus(), 5000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [hostCanControlServerTranslation, loadServerStatus]);

  function startServerTranslation(participant: Participant) {
    const metadata = parseMeetingParticipantMetadata(participant.metadata);
    if (!localMeetingMetadata.meetingId || !metadata.participantId) {
      setServerControlError("Participant must rejoin before server translation can be started for them.");
      return;
    }
    if (serverStartUnavailable) {
      setServerControlError(serverStatus?.serverReadiness.message ?? "Server translation worker is not ready.");
      return;
    }

    setServerControlError(null);
    setServerControlBusyIdentity(participant.identity);
    startServerControlTransition(async () => {
      const response = await fetch(`/api/meetings/${localMeetingMetadata.meetingId}/translation/start-all`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceParticipantId: metadata.participantId }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setServerControlError(payload.error ?? "Unable to start server translation.");
      }
      await loadServerStatus();
      setServerControlBusyIdentity(null);
    });
  }

  function stopServerTranslation() {
    if (!localMeetingMetadata.meetingId) return;
    setServerControlError(null);
    setServerControlBusyIdentity("stop-all");
    startServerControlTransition(async () => {
      const response = await fetch(`/api/meetings/${localMeetingMetadata.meetingId}/translation/stop`, {
        method: "POST",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setServerControlError(payload.error ?? "Unable to stop server translation.");
      }
      await loadServerStatus();
      setServerControlBusyIdentity(null);
    });
  }

  return (
    <div className="space-y-4 overflow-auto pr-1">
      <section className={`rounded-2xl border p-4 text-sm ${
        serverTranslatedSourceIdentities.size > 0
          ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-50"
          : "border-amber-300/30 bg-amber-300/10 text-amber-50"
      }`}>
        <p className={`font-semibold ${serverTranslatedSourceIdentities.size > 0 ? "text-emerald-100" : "text-amber-100"}`}>
          {serverTranslatedSourceIdentities.size > 0 ? "Server interpretation active" : "Server interpretation pending"}
        </p>
        <p className="mt-2 leading-6 text-amber-50/80">
          {serverTranslatedSourceIdentities.size > 0
            ? "A server-published interpretation track is available for your listening language. The room will prioritize that audio and suppress duplicate browser fallback for the same speaker."
            : "This room uses the server interpretation path only, so listeners do not hear mixed browser/server interpreter voices. Start server interpretation for each speaker from Host server interpretation."}
        </p>
      </section>

      <section className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-white">Translation controls</h2>
            <p className="mt-1 text-xs leading-5 text-cyan-50/80">
              These controls stay inside the meeting room. Choose the language you want to hear.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onEnabledChange(!enabled)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              enabled ? "bg-emerald-300 text-slate-950" : "bg-white/10 text-slate-200"
            }`}
          >
            {enabled ? "On" : "Off"}
          </button>
        </div>

        {preferenceError ? <p className="mt-4 rounded-xl bg-red-300/10 px-3 py-2 text-sm text-red-100">{preferenceError}</p> : null}
        {preferencePending ? <p className="mt-4 rounded-xl bg-cyan-300/10 px-3 py-2 text-sm text-cyan-100">Saving language preferences...</p> : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
            Speak in
            <select
              value={speakingLanguage}
              disabled={preferencePending}
              onChange={(event) => onSpeakingLanguageChange(event.target.value as SupportedLanguageCode)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm normal-case tracking-normal text-white"
            >
              {SUPPORTED_LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
            Listen in
            <select
              value={listeningLanguage}
              disabled={preferencePending}
              onChange={(event) => onListeningLanguageChange(event.target.value as SupportedLanguageCode)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm normal-case tracking-normal text-white"
            >
              {SUPPORTED_LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Audio mix</p>
              <p className="mt-1 text-xs text-slate-400">Mute or reduce original audio while listening to interpretation.</p>
            </div>
            <button
              type="button"
              onClick={() => onAudioMutedChange(!audioMuted)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                audioMuted ? "bg-red-300 text-slate-950" : "bg-white/10 text-slate-200"
              }`}
            >
              {audioMuted ? "Unmute" : "Mute"}
            </button>
          </div>
          <VolumeSlider label="Original" value={sourceAudioVolume} onChange={onSourceAudioVolumeChange} />
          <VolumeSlider label="Interpreter" value={translatedAudioVolume} onChange={onTranslatedAudioVolumeChange} />
          <button
            type="button"
            onClick={() => {
              onAudioMutedChange(false);
              onSourceAudioVolumeChange(0.18);
              onTranslatedAudioVolumeChange(1);
            }}
            className="mt-3 w-full rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
          >
            Reset audio mix
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
          <StatusMetric label="Connected" value={activeCount} />
          <StatusMetric label="Starting" value={connectingCount} />
          <StatusMetric label="Errors" value={errorCount} />
        </div>
        {serverAudibleCount > 0 || serverStartingCount > 0 ? (
          <p className="mt-3 rounded-xl bg-emerald-300/10 px-3 py-2 text-xs text-emerald-50">
            Server interpretation: {serverAudibleCount} audible, {serverStartingCount} starting or waiting for track.
          </p>
        ) : null}
      </section>

      {hostCanControlServerTranslation ? (
        <section className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-white">Host server interpretation</h2>
              <p className="mt-1 text-xs leading-5 text-emerald-50/80">
                Start server-side channels from inside the room. Keep the worker running separately with
                <span className="font-mono"> TRANSLATION_WORKER_ADAPTER=livekit-node pnpm translation:worker</span>.
              </p>
            </div>
            <button
              type="button"
              disabled={isServerControlPending}
              onClick={stopServerTranslation}
              className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {serverControlBusyIdentity === "stop-all" ? "Stopping..." : "Stop all"}
            </button>
          </div>
          {serverStatus?.serverReadiness ? (
            <p className={`mt-3 rounded-xl px-3 py-2 text-xs ${
              serverStatus.serverReadiness.ready
                ? "bg-emerald-300/10 text-emerald-50"
                : "bg-red-300/10 text-red-100"
            }`}>
              Worker: {serverStatus.serverReadiness.mode}. {serverStatus.serverReadiness.message}
            </p>
          ) : (
            <p className="mt-3 rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-300">
              Checking server worker readiness...
            </p>
          )}
          {serverControlError ? <p className="mt-3 rounded-xl bg-red-300/10 px-3 py-2 text-red-100">{serverControlError}</p> : null}
          <div className="mt-3 space-y-2">
            {visibleParticipants.map((participant) => {
              const metadata = parseMeetingParticipantMetadata(participant.metadata);
              const speaking = resolveMetadataLanguage(participant.metadata, "speakingLanguage", "ko");
              const listening = resolveMetadataLanguage(participant.metadata, "listeningLanguage", "ko");
              const trackActiveForListener = serverTranslatedSourceIdentities.has(participant.identity);
              const sessionActiveForSpeaker = activeServerSourceIdentities.has(participant.identity);
              const disabled = isServerControlPending || !metadata.participantId || serverStartUnavailable;
              return (
                <div key={participant.identity} className="rounded-xl bg-slate-950/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{participant.name ?? participant.identity}</p>
                      <p className="mt-1 text-xs text-slate-300">
                        Speaks {labelLanguage(speaking)} · Listens {labelLanguage(listening)}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {trackActiveForListener
                          ? "Translation track is audible for your listening language."
                          : sessionActiveForSpeaker
                            ? "Server session is starting or connected; waiting for the matching audio track."
                            : "No active server interpretation session for this speaker."}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => startServerTranslation(participant)}
                      className="rounded-xl bg-cyan-300 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                      title={
                        serverStartUnavailable
                          ? serverStatus?.serverReadiness.message
                          : !metadata.participantId
                            ? "Participant must rejoin to expose a server participant id."
                            : undefined
                      }
                    >
                      {serverControlBusyIdentity === participant.identity
                        ? "Starting..."
                        : trackActiveForListener
                          ? "Active"
                          : sessionActiveForSpeaker
                            ? "Sync"
                          : "Start"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {(serverStatus?.sessions.length ?? 0) > 0 ? (
            <div className="mt-3 space-y-2">
              {serverStatus?.sessions.slice(0, 6).map((session) => (
                <div key={session.id} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300">
                  <div className="flex items-center justify-between gap-3">
                    <span>
                      {labelLanguage(session.source_language)} → {labelLanguage(session.target_language)}
                    </span>
                    <span className="rounded-full bg-white/10 px-2 py-1 font-semibold capitalize text-slate-100">
                      {session.status}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-slate-400">Source: {session.source_identity}</p>
                  {session.last_error ? <p className="mt-1 text-red-200">{session.last_error}</p> : null}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-3">
        {snapshotList.map((snapshot) => (
          <div key={snapshot.participantId} className="rounded-2xl bg-white/5 p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-white">{snapshot.participantName}</p>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold capitalize text-slate-200">
                {describeTranslationSnapshotStatus(snapshot, enabled)}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {snapshot.sourceLanguage} → {snapshot.targetLanguage}
            </p>
            <p className="mt-2 rounded-xl bg-slate-950/50 px-3 py-2 text-xs text-slate-300">
              {describeTranslationSnapshotDetail(snapshot, enabled)}
            </p>
            {snapshot.sourceSubtitle ? <p className="mt-2 text-slate-400">{snapshot.sourceSubtitle}</p> : null}
            {snapshot.translatedSubtitle ? <p className="mt-1 font-semibold text-slate-100">{snapshot.translatedSubtitle}</p> : null}
            {snapshot.error ? <p className="mt-2 text-red-200">{formatTranslationError(snapshot.error)}</p> : null}
          </div>
        ))}
        {snapshotList.length === 0 ? (
          <p className="rounded-2xl bg-white/5 p-4 text-sm text-slate-400">
            No remote speakers yet. Translation starts when another participant joins with their microphone.
          </p>
        ) : null}
      </section>
    </div>
  );
}



function VolumeSlider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
      <span className="flex items-center justify-between">
        <span>{label}</span>
        <span className="normal-case tracking-normal text-slate-400">{Math.round(value * 100)}%</span>
      </span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full accent-cyan-300"
      />
    </label>
  );
}

function describeTranslationSnapshotStatus(snapshot: ParticipantTranslationSnapshot, globalEnabled: boolean) {
  if (!globalEnabled) return "off";
  if (!snapshot.hasSourceTrack) return "no mic";
  if (snapshot.sourceLanguage === snapshot.targetLanguage) return "same language";
  return snapshot.status;
}

function describeTranslationSnapshotDetail(snapshot: ParticipantTranslationSnapshot, globalEnabled: boolean) {
  if (!globalEnabled) return "Translation is turned off for your room view.";
  if (!snapshot.hasSourceTrack) return "Waiting for this participant to unmute their microphone.";
  if (snapshot.sourceLanguage === snapshot.targetLanguage) return "Same language as your listening preference. You will hear original audio only.";
  if (snapshot.status === "reconnecting") return `Interpreter audio is reconnecting${snapshot.reconnectAttempt ? ` (attempt ${snapshot.reconnectAttempt})` : ""}. Original audio remains available.`;
  if (snapshot.status === "connecting") return "Interpreter audio is starting.";
  if (snapshot.status === "connected") return snapshot.hasOutputAudio ? "Interpreter audio is active." : "Connected; waiting for speech output.";
  if (snapshot.status === "error") return "Interpreter failed for this speaker. Use original audio or retry by toggling translation.";
  return "Waiting for translation.";
}

function formatTranslationError(error: string) {
  if (error.includes("Too many translation token requests")) {
    return "Translation is temporarily rate-limited. Please wait a minute, then toggle translation off and on.";
  }
  if (error.includes("listener preference")) {
    return "Your listening language is still saving. Please wait a moment or re-select your listening language.";
  }
  if (error.includes("same; translation is not required")) {
    return "This speaker uses your listening language, so translation is not required.";
  }
  if (error.includes("own microphone")) {
    return "Your own microphone is not translated back to you.";
  }
  return error;
}

function StatusMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-950/60 px-3 py-2">
      <p className="text-lg font-semibold text-white">{value}</p>
      <p className="text-slate-400">{label}</p>
    </div>
  );
}


function OperationalStatusStrip({ publicToken }: { publicToken: string }) {
  const [status, setStatus] = useState<OperationalStatusResponse | null>(null);

  const loadStatus = useCallback(async () => {
    const response = await fetch(`/api/public-meetings/${publicToken}/operational-status`, { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    setStatus((await response.json()) as OperationalStatusResponse);
  }, [publicToken]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void loadStatus(), 0);
    const interval = window.setInterval(() => void loadStatus(), 5000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [loadStatus]);

  if (!status) {
    return null;
  }

  return (
    <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
      <StatusPill label="Translation" status={status.translation.status} />
      <StatusPill label="Captions" status={status.captions.status} />
      <StatusPill label="Recording" status={status.recording.status} />
      <StatusPill label="Notes" status={status.notes.status} />
    </div>
  );
}

function StatusPill({ label, status }: { label: string; status: string }) {
  const tone = getOperationalStatusTone(status);
  const className = {
    ok: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
    warn: "border-amber-300/30 bg-amber-300/10 text-amber-100",
    danger: "border-red-300/30 bg-red-300/10 text-red-100",
    muted: "border-white/10 bg-white/5 text-slate-300",
  }[tone];

  return (
    <div className={`rounded-2xl border px-3 py-2 ${className}`}>
      <p className="font-semibold">{label}</p>
      <p className="mt-1 capitalize">{status}</p>
    </div>
  );
}

function CaptionPanel({ publicToken, listeningLanguage }: { publicToken: string; listeningLanguage: SupportedLanguageCode }) {
  const [captions, setCaptions] = useState<CaptionEvent[]>([]);
  const [fontSize, setFontSize] = useState<CaptionFontSize>("normal");
  const [status, setStatus] = useState<"connected" | "delayed" | "reconnecting" | "unavailable">("delayed");

  const loadCaptions = useCallback(async () => {
    const response = await fetch(
      `/api/public-meetings/${publicToken}/captions?listeningLanguage=${listeningLanguage}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      setStatus((current) =>
        resolveCaptionConnectionStatus({ fetchOk: false, previousStatus: current, captionCount: captions.length }),
      );
      return;
    }
    const payload = (await response.json()) as { captions: CaptionEvent[] };
    setCaptions(payload.captions);
    setStatus((current) =>
      resolveCaptionConnectionStatus({
        fetchOk: true,
        previousStatus: current,
        captionCount: payload.captions.length,
        newestCaptionAt: payload.captions.at(-1)?.startedAt,
      }),
    );
  }, [captions.length, listeningLanguage, publicToken]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void loadCaptions(), 0);
    const interval = window.setInterval(() => void loadCaptions(), 3000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [loadCaptions]);

  const currentCaption = captions.at(-1);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-white">Current caption</h2>
          <span className="rounded-full bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100">
            Captions {status}
          </span>
        </div>
        {currentCaption ? (
          <div className={`mt-4 space-y-2 ${CAPTION_FONT_SIZE_CLASS[fontSize]}`}>
            <p className="text-slate-400">{currentCaption.sourceText}</p>
            <p className="font-semibold text-white">{currentCaption.translatedText}</p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-400">No captions yet.</p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Listening</p>
          <p className="mt-1">{labelLanguage(listeningLanguage)}</p>
        </div>
        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
          Font size
          <select
            value={fontSize}
            onChange={(event) => setFontSize(event.target.value as CaptionFontSize)}
            className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm normal-case tracking-normal text-white"
          >
            <option value="small">Small</option>
            <option value="normal">Normal</option>
            <option value="large">Large</option>
            <option value="extra-large">Extra large</option>
          </select>
        </label>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto pr-1">
        {captions.map((caption) => (
          <div key={caption.id} className="rounded-2xl bg-white/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-white">
                {caption.speakerName} {caption.speakerCompany ? `(${caption.speakerCompany})` : ""}
              </p>
              <time className="text-xs text-slate-500">{formatTime(caption.startedAt)}</time>
            </div>
            <p className="mt-2 text-sm text-slate-400">{caption.sourceText}</p>
            <p className="mt-1 text-sm font-semibold text-slate-100">{caption.translatedText}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChatPanel({ publicToken }: { publicToken: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadMessages = useCallback(async () => {
    const response = await fetch(`/api/public-meetings/${publicToken}/chat`, { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as { messages: ChatMessage[] };
    setMessages(payload.messages);
  }, [publicToken]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void loadMessages(), 0);
    const interval = window.setInterval(() => void loadMessages(), 3000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [loadMessages]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setError(null);

    const response = await fetch(`/api/public-meetings/${publicToken}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: trimmed }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "Unable to send message.");
      return;
    }

    setBody("");
    await loadMessages();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-auto pr-1">
        {messages.map((message) => (
          <div key={message.id} className="rounded-2xl bg-white/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-white">
                {message.senderName} {message.senderCompany ? `(${message.senderCompany})` : ""}
              </p>
              <time className="text-xs text-slate-500">{formatTime(message.sentAt)}</time>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">{message.body}</p>
          </div>
        ))}
        {messages.length === 0 ? <p className="text-sm text-slate-400">No chat messages yet.</p> : null}
      </div>

      <form onSubmit={sendMessage} className="mt-4 space-y-3">
        {error ? <p className="rounded-xl bg-red-300/10 px-3 py-2 text-sm text-red-100">{error}</p> : null}
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={3}
          placeholder="Send a message..."
          className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none ring-cyan-300 transition placeholder:text-slate-500 focus:ring-2"
        />
        <button className="w-full rounded-xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200">
          Send
        </button>
      </form>
    </div>
  );
}

function RoomShell({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: { label: string; href: string };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
      <section className="max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-200">Meeting room</p>
        <h1 className="mt-3 text-3xl font-semibold">{title}</h1>
        <p className="mt-4 text-slate-300">{description}</p>
        {action ? (
          <Link
            href={action.href}
            className="mt-6 inline-flex rounded-xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
          >
            {action.label}
          </Link>
        ) : null}
      </section>
    </main>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}


function labelLanguage(code: string | null) {
  if (!code) return "Not set";
  return SUPPORTED_LANGUAGES.find((language) => language.code === code)?.label ?? code;
}
