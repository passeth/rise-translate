"use client";

import { useEffect, useRef, useState } from "react";
import { REALTIME_TRANSLATION_CALL_URL, buildSessionUpdate } from "@/lib/realtime-translation-config";
import { getTranslationReconnectDelayMs, shouldRetryTranslationConnection } from "@/features/livekit/translation-retry";
import { isNonRetryableTranslationTokenStatus, NonRetryableTranslationError } from "@/features/livekit/translation-errors";
import {
  DEFAULT_TRANSLATION_DISCONNECTED_GRACE_MS,
  shouldScheduleTranslationReconnectForConnectionState,
  shouldWaitBeforeReconnectForConnectionState,
} from "@/features/livekit/translation-connection-state";
import type { SupportedLanguageCode } from "@/lib/languages";

export type RealtimeTranslationStatus = "idle" | "connecting" | "reconnecting" | "connected" | "error";

type TranslationTokenResponse = {
  clientSecret: string;
  expiresAt: number | null;
};

type UseRemoteTranslationOptions = {
  enabled: boolean;
  publicToken: string;
  sourceIdentity: string;
  listenerIdentity: string;
  sourceTrack: MediaStreamTrack | null;
  sourceLanguage?: SupportedLanguageCode;
  targetLanguage: SupportedLanguageCode;
  sourceTranscriptionEnabled?: boolean;
  noiseReductionEnabled?: boolean;
  translatedVolume?: number;
};

export type UseRemoteTranslationResult = {
  status: RealtimeTranslationStatus;
  error: string | null;
  sourceTranscript: string;
  translatedTranscript: string;
  sourceSubtitle: string;
  translatedSubtitle: string;
  hasOutputAudio: boolean;
  reconnectAttempt: number;
};

type RealtimeEvent = {
  type?: unknown;
  delta?: unknown;
  transcript?: unknown;
  error?: unknown;
};

export function useRemoteTranslation({
  enabled,
  publicToken,
  sourceIdentity,
  listenerIdentity,
  sourceTrack,
  sourceLanguage,
  targetLanguage,
  sourceTranscriptionEnabled = true,
  noiseReductionEnabled = true,
  translatedVolume = 1,
}: UseRemoteTranslationOptions): UseRemoteTranslationResult {
  const [status, setStatus] = useState<RealtimeTranslationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [sourceTranscript, setSourceTranscript] = useState("");
  const [translatedTranscript, setTranslatedTranscript] = useState("");
  const [hasOutputAudio, setHasOutputAudio] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const translatedAudioRef = useRef<HTMLAudioElement | null>(null);
  const translatedVolumeRef = useRef(translatedVolume);
  const active = enabled && Boolean(sourceTrack);

  useEffect(() => {
    translatedVolumeRef.current = translatedVolume;
    if (translatedAudioRef.current) {
      translatedAudioRef.current.volume = translatedVolume;
    }
  }, [translatedVolume]);

  useEffect(() => {
    const dataChannel = dataChannelRef.current;
    if (!active || !dataChannel || dataChannel.readyState !== "open") {
      return;
    }

    dataChannel.send(
      JSON.stringify(
        buildSessionUpdate({
          language: targetLanguage,
          sourceLanguage,
          inputTranscriptionEnabled: sourceTranscriptionEnabled,
          noiseReductionEnabled,
        }),
      ),
    );
  }, [active, noiseReductionEnabled, sourceLanguage, sourceTranscriptionEnabled, targetLanguage]);

  useEffect(() => {
    if (!active || !sourceTrack) {
      return;
    }

    const activeSourceTrack = sourceTrack;
    let cancelled = false;
    let peerConnection: RTCPeerConnection | null = null;
    let dataChannel: RTCDataChannel | null = null;
    let translatedAudio: HTMLAudioElement | null = null;
    let retryTimer: number | null = null;
    let disconnectedTimer: number | null = null;

    function cleanupConnection() {
      dataChannel?.close();
      peerConnection?.close();

      if (translatedAudio) {
        translatedAudio.pause();
        translatedAudio.srcObject = null;
      }

      if (dataChannelRef.current === dataChannel) {
        dataChannelRef.current = null;
      }
      if (translatedAudioRef.current === translatedAudio) {
        translatedAudioRef.current = null;
      }

      dataChannel = null;
      peerConnection = null;
      translatedAudio = null;
    }

    function scheduleReconnect(attempt: number, message: string) {
      if (disconnectedTimer !== null) {
        window.clearTimeout(disconnectedTimer);
        disconnectedTimer = null;
      }
      if (cancelled || retryTimer !== null || !shouldRetryTranslationConnection({ attempt })) {
        setError(message);
        setStatus("error");
        return;
      }

      const nextAttempt = attempt + 1;
      setReconnectAttempt(nextAttempt);
      setError(`${message}. Reconnecting (${nextAttempt})...`);
      setStatus("reconnecting");
      cleanupConnection();
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        void connect(attempt + 1);
      }, getTranslationReconnectDelayMs({ attempt: attempt + 1 }));
    }

    async function connect(attempt = 0) {
      setStatus(attempt === 0 ? "connecting" : "reconnecting");
      setError(null);
      setSourceTranscript("");
      setTranslatedTranscript("");
      setHasOutputAudio(false);
      if (attempt === 0) setReconnectAttempt(0);

      try {
        const tokenResponse = await fetch("/api/realtime/translation-token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            publicToken,
            sourceIdentity,
            listenerIdentity,
            language: targetLanguage,
            sourceLanguage,
            inputTranscriptionEnabled: sourceTranscriptionEnabled,
            noiseReductionEnabled,
          }),
        });

        if (!tokenResponse.ok) {
          const payload = (await tokenResponse.json().catch(() => ({}))) as { error?: string };
          const message = payload.error ?? (await tokenResponse.text().catch(() => "Unable to create translation token."));
          if (isNonRetryableTranslationTokenStatus(tokenResponse.status)) {
            throw new NonRetryableTranslationError(message);
          }
          throw new Error(message);
        }

        const token = (await tokenResponse.json()) as TranslationTokenResponse;
        if (cancelled) return;

        peerConnection = new RTCPeerConnection();
        dataChannel = peerConnection.createDataChannel("oai-events");
        translatedAudio = new Audio();
        translatedAudio.autoplay = true;
        translatedAudio.setAttribute("playsinline", "");
        translatedAudio.volume = translatedVolumeRef.current;
        dataChannelRef.current = dataChannel;
        translatedAudioRef.current = translatedAudio;

        peerConnection.ontrack = ({ streams, track }) => {
          if (!translatedAudio) return;
          translatedAudio.srcObject = streams[0] ?? new MediaStream([track]);
          setHasOutputAudio(true);
          void translatedAudio.play().catch((audioError) => {
            setError(getErrorMessage(audioError));
          });
        };

        peerConnection.onconnectionstatechange = () => {
          if (!peerConnection || cancelled) return;
          const state = peerConnection.connectionState;
          if (shouldScheduleTranslationReconnectForConnectionState(state)) {
            scheduleReconnect(attempt, `Translation WebRTC connection ${state}`);
          }
          if (shouldWaitBeforeReconnectForConnectionState(state) && disconnectedTimer === null) {
            disconnectedTimer = window.setTimeout(() => {
              disconnectedTimer = null;
              if (!cancelled && peerConnection?.connectionState === "disconnected") {
                scheduleReconnect(attempt, "Translation WebRTC connection disconnected");
              }
            }, DEFAULT_TRANSLATION_DISCONNECTED_GRACE_MS);
          }
          if (state === "connected") {
            if (disconnectedTimer !== null) {
              window.clearTimeout(disconnectedTimer);
              disconnectedTimer = null;
            }
            setStatus("connected");
          }
        };

        dataChannel.onopen = () => {
          if (!dataChannel || cancelled) return;
          dataChannel.send(
            JSON.stringify(
              buildSessionUpdate({
                language: targetLanguage,
                sourceLanguage,
                inputTranscriptionEnabled: sourceTranscriptionEnabled,
                noiseReductionEnabled,
              }),
            ),
          );
        };
        dataChannel.onmessage = (event) => {
          if (cancelled) return;
          void handleRealtimeEvent(event.data, {
            onSessionReady: () => setStatus("connected"),
            onInputTranscript: (delta) => setSourceTranscript((current) => appendTranscriptDelta(current, delta)),
            onOutputAudio: () => setHasOutputAudio(true),
            onOutputTranscript: (delta) => setTranslatedTranscript((current) => appendTranscriptDelta(current, delta)),
            onError: (message) => {
              scheduleReconnect(attempt, message);
            },
          });
        };
        dataChannel.onerror = () => {
          if (!cancelled) {
            scheduleReconnect(attempt, "Translation data channel failed");
          }
        };

        peerConnection.addTrack(activeSourceTrack, new MediaStream([activeSourceTrack]));
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        const sdpResponse = await fetch(REALTIME_TRANSLATION_CALL_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token.clientSecret}`,
            "content-type": "application/sdp",
          },
          body: offer.sdp,
        });

        const answerSdp = await sdpResponse.text();
        if (!sdpResponse.ok) {
          throw new Error(answerSdp);
        }

        await peerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });
        if (!cancelled) {
          setStatus("connected");
        }
      } catch (connectError) {
        if (!cancelled) {
          if (connectError instanceof NonRetryableTranslationError) {
            setError(connectError.message);
            setStatus("error");
            return;
          }
          scheduleReconnect(attempt, getErrorMessage(connectError));
        }
      }
    }

    void connect();

    return () => {
      cancelled = true;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
      if (disconnectedTimer !== null) {
        window.clearTimeout(disconnectedTimer);
      }
      cleanupConnection();
    };
  }, [active, listenerIdentity, noiseReductionEnabled, publicToken, sourceIdentity, sourceLanguage, sourceTrack, sourceTranscriptionEnabled, targetLanguage]);

  return {
    status: active ? status : "idle",
    error: active ? error : null,
    sourceTranscript,
    translatedTranscript,
    sourceSubtitle: getSubtitle(sourceTranscript),
    translatedSubtitle: getSubtitle(translatedTranscript),
    hasOutputAudio: active ? hasOutputAudio : false,
    reconnectAttempt: active ? reconnectAttempt : 0,
  };
}

async function handleRealtimeEvent(
  payload: unknown,
  handlers: {
    onSessionReady: () => void;
    onInputTranscript: (delta: string) => void;
    onOutputAudio: () => void;
    onOutputTranscript: (delta: string) => void;
    onError: (message: string) => void;
  },
) {
  const text = typeof payload === "string" ? payload : payload instanceof Blob ? await payload.text() : null;
  if (!text) return;

  let event: RealtimeEvent;
  try {
    event = JSON.parse(text) as RealtimeEvent;
  } catch {
    return;
  }

  if (event.type === "session.updated") {
    handlers.onSessionReady();
    return;
  }

  if (event.type === "session.input_transcript.delta" || event.type === "conversation.item.input_audio_transcription.delta") {
    const delta = typeof event.delta === "string" ? event.delta : typeof event.transcript === "string" ? event.transcript : null;
    if (delta) handlers.onInputTranscript(delta);
    return;
  }

  if (event.type === "session.output_audio.delta" || event.type === "response.output_audio.delta" || event.type === "response.audio.delta") {
    handlers.onOutputAudio();
    return;
  }

  if (event.type === "session.output_transcript.delta" || event.type === "response.audio_transcript.delta") {
    const delta = typeof event.delta === "string" ? event.delta : typeof event.transcript === "string" ? event.transcript : null;
    if (delta) handlers.onOutputTranscript(delta);
    return;
  }

  if (event.type === "error") {
    const realtimeError = event.error;
    if (realtimeError && typeof realtimeError === "object" && !Array.isArray(realtimeError)) {
      const message = (realtimeError as Record<string, unknown>).message;
      handlers.onError(typeof message === "string" ? message : "Translation error");
      return;
    }
    handlers.onError("Translation error");
  }
}

function appendTranscriptDelta(current: string, delta: string) {
  if (!delta) return current;
  if (!current) return delta.replace(/^\s+/, "");
  if (/\s$/.test(current) || /^\s/.test(delta) || /^[,.;:!?%)}\]]/.test(delta)) {
    return `${current}${delta}`;
  }
  return `${current} ${delta}`;
}

function getSubtitle(transcript: string) {
  const normalized = transcript.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const sentenceStart = Math.max(normalized.lastIndexOf(". "), normalized.lastIndexOf("? "), normalized.lastIndexOf("! "));
  const latest = sentenceStart >= 0 ? normalized.slice(sentenceStart + 2) : normalized;
  return latest.length > 180 ? latest.slice(latest.length - 180) : latest;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Translation failed";
}
