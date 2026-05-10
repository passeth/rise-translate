import { AccessToken } from "livekit-server-sdk";
import {
  AudioSource,
  AudioStream,
  AudioFrame,
  LocalAudioTrack,
  Room,
  RoomEvent,
  TrackPublishOptions,
  TrackKind,
  TrackSource,
  type LocalTrackPublication,
  type RemoteAudioTrack,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "@livekit/rtc-node";
import { requireEnv } from "@/lib/env";
import type { TranslationBridgeStartRequest } from "@/server/translation/bridge";
import type {
  LiveKitAudioSource,
  LiveKitMediaAdapter,
  LiveKitTranslatedAudioPublisher,
  PcmAudioFrame,
} from "@/server/translation/livekit-media-adapter";
import type { RealtimePcmFormat } from "@/server/translation/audio-format";

const WORKER_AUDIO_FORMAT: RealtimePcmFormat = { encoding: "pcm16", sampleRate: 24_000, channels: 1 };
const DEFAULT_WAIT_TIMEOUT_MS = 15_000;

type WaitOptions = { timeoutMs?: number };

export class LiveKitNodeMediaAdapter implements LiveKitMediaAdapter {
  private room?: Room;
  private publishedTracks: LocalTrackPublication[] = [];
  private audioSources: AudioSource[] = [];

  async attachToRoom(request: TranslationBridgeStartRequest): Promise<void> {
    if (this.room?.isConnected) return;

    const room = new Room();
    const token = new AccessToken(requireEnv("LIVEKIT_API_KEY"), requireEnv("LIVEKIT_API_SECRET"), {
      identity: buildTranslationWorkerIdentity(request.sessionId),
      name: `Translation ${request.sourceLanguage} to ${request.targetLanguage}`,
      metadata: JSON.stringify({
        role: "translation-worker",
        translationSessionId: request.sessionId,
        sourceIdentity: request.sourceParticipantIdentity,
        sourceLanguage: request.sourceLanguage,
        targetLanguage: request.targetLanguage,
        targetTrackName: request.targetTrackName,
      }),
      attributes: {
        role: "translation-worker",
        sourceIdentity: request.sourceParticipantIdentity,
        sourceLanguage: request.sourceLanguage,
        targetLanguage: request.targetLanguage,
      },
    });
    token.addGrant({
      room: request.livekitRoomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      hidden: false,
    });

    await room.connect(requireEnv("LIVEKIT_URL"), await token.toJwt(), { autoSubscribe: false, dynacast: false });
    this.room = room;
  }

  async subscribeToParticipantMicrophone(
    request: TranslationBridgeStartRequest,
  ): Promise<LiveKitAudioSource> {
    const room = this.requireRoom();
    const participant = await waitForParticipant(room, request.sourceParticipantIdentity);
    const track = await waitForMicrophoneTrack(room, participant);
    const stream = new AudioStream(track, {
      sampleRate: WORKER_AUDIO_FORMAT.sampleRate,
      numChannels: WORKER_AUDIO_FORMAT.channels,
      frameSizeMs: 20,
    });

    return {
      roomName: request.livekitRoomName,
      participantIdentity: request.sourceParticipantIdentity,
      trackSource: "microphone",
      format: WORKER_AUDIO_FORMAT,
      frames: audioStreamFrames(stream),
    };
  }

  async createTranslatedAudioPublisher(
    request: TranslationBridgeStartRequest,
    format: RealtimePcmFormat,
  ): Promise<LiveKitTranslatedAudioPublisher> {
    const room = this.requireRoom();
    if (!room.localParticipant) {
      throw new Error("LiveKit worker is not connected as a local participant.");
    }

    const audioSource = new AudioSource(format.sampleRate, format.channels, 1_000);
    const track = LocalAudioTrack.createAudioTrack(request.targetTrackName, audioSource);
    const publication = await room.localParticipant.publishTrack(track, new TrackPublishOptions({
      source: TrackSource.SOURCE_MICROPHONE,
    }));
    this.audioSources.push(audioSource);
    this.publishedTracks.push(publication);

    return {
      roomName: request.livekitRoomName,
      trackName: request.targetTrackName,
      format,
      publishFrame: async (frame) => {
        await audioSource.captureFrame(toLiveKitAudioFrame(frame));
      },
      close: async () => {
        await audioSource.waitForPlayout().catch(() => undefined);
      },
    };
  }

  async close(): Promise<void> {
    const room = this.room;
    if (!room) return;

    await Promise.allSettled(
      this.publishedTracks
        .map((publication) => publication.sid)
        .filter((sid): sid is string => Boolean(sid))
        .map((sid) => room.localParticipant?.unpublishTrack(sid, true)),
    );
    await Promise.allSettled(this.audioSources.map((source) => source.close()));
    await room.disconnect();
    this.room = undefined;
    this.publishedTracks = [];
    this.audioSources = [];
  }

  private requireRoom() {
    if (!this.room?.isConnected) {
      throw new Error("LiveKit worker is not attached to a room.");
    }
    return this.room;
  }
}

function buildTranslationWorkerIdentity(sessionId: string) {
  return `translation-worker-${sessionId}`;
}

async function waitForParticipant(room: Room, identity: string, options: WaitOptions = {}): Promise<RemoteParticipant> {
  const existing = room.remoteParticipants.get(identity);
  if (existing) return existing;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for participant ${identity}.`));
    }, options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS);

    const handler = (participant: RemoteParticipant) => {
      if (participant.identity !== identity) return;
      cleanup();
      resolve(participant);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      room.off(RoomEvent.ParticipantConnected, handler);
    };

    room.on(RoomEvent.ParticipantConnected, handler);
  });
}

export async function waitForMicrophoneTrack(
  room: Pick<Room, "on" | "off">,
  participant: Pick<RemoteParticipant, "identity" | "trackPublications">,
  options: WaitOptions = {},
): Promise<RemoteAudioTrack> {
  const existing = findMicrophoneTrack(participant);
  if (existing) return existing;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${participant.identity} microphone track.`));
    }, options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS);

    const handler = (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      trackParticipant: RemoteParticipant,
    ) => {
      if (trackParticipant.identity !== participant.identity) return null;
      if (!isMicrophonePublication(publication)) return null;
      if (!isRemoteAudioTrack(track)) return;
      cleanup();
      resolve(track);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      room.off(RoomEvent.TrackSubscribed, handler);
      room.off(RoomEvent.TrackPublished, trackPublishedHandler);
    };

    const trackPublishedHandler = (publication: RemoteTrackPublication, trackParticipant: RemoteParticipant) => {
      if (trackParticipant.identity === participant.identity && isMicrophonePublication(publication)) {
        publication.setSubscribed(true);
      }
    };

    room.on(RoomEvent.TrackSubscribed, handler);
    room.on(RoomEvent.TrackPublished, trackPublishedHandler);

    for (const publication of participant.trackPublications.values()) {
      if (isMicrophonePublication(publication)) {
        publication.setSubscribed(true);
      }
    }
  });
}

function findMicrophoneTrack(participant: Pick<RemoteParticipant, "trackPublications">): RemoteAudioTrack | null {
  for (const publication of participant.trackPublications.values()) {
    if (!isMicrophonePublication(publication)) continue;
    const track = publication.track;
    if (isRemoteAudioTrack(track)) return track;
  }

  return null;
}

function isMicrophonePublication(publication: RemoteTrackPublication) {
  return publication.kind === TrackKind.KIND_AUDIO && publication.source === TrackSource.SOURCE_MICROPHONE;
}

function isRemoteAudioTrack(track: RemoteTrack | undefined): track is RemoteAudioTrack {
  return Boolean(track && track.kind === TrackKind.KIND_AUDIO);
}

async function* audioStreamFrames(stream: AudioStream): AsyncIterable<PcmAudioFrame> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return;
      yield fromLiveKitAudioFrame(value);
    }
  } finally {
    reader.releaseLock();
    await stream.cancel().catch(() => undefined);
  }
}

function fromLiveKitAudioFrame(frame: AudioFrame): PcmAudioFrame {
  return {
    data: frame.data,
    sampleRate: frame.sampleRate,
    channels: frame.channels,
    samplesPerChannel: frame.samplesPerChannel,
  };
}

function toLiveKitAudioFrame(frame: PcmAudioFrame): AudioFrame {
  return new AudioFrame(frame.data, frame.sampleRate, frame.channels, frame.samplesPerChannel);
}
