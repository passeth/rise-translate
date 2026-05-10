import type { TranslationBridgeStartRequest } from "@/server/translation/bridge";
import type { RealtimePcmFormat } from "@/server/translation/audio-format";

export type PcmAudioFrame = {
  data: Int16Array;
  sampleRate: number;
  channels: number;
  samplesPerChannel: number;
};

export type LiveKitAudioSource = {
  roomName: string;
  participantIdentity: string;
  trackSource: "microphone";
  format: RealtimePcmFormat;
  frames?: AsyncIterable<PcmAudioFrame>;
};

export type LiveKitTranslatedAudioPublisher = {
  roomName: string;
  trackName: string;
  format: RealtimePcmFormat;
  publishFrame?: (frame: PcmAudioFrame) => Promise<void>;
  close?: () => Promise<void>;
};

export interface LiveKitMediaAdapter {
  attachToRoom(request: TranslationBridgeStartRequest): Promise<void>;
  subscribeToParticipantMicrophone(request: TranslationBridgeStartRequest): Promise<LiveKitAudioSource>;
  createTranslatedAudioPublisher(
    request: TranslationBridgeStartRequest,
    format: RealtimePcmFormat,
  ): Promise<LiveKitTranslatedAudioPublisher>;
  close?(): Promise<void>;
}

export class DryRunLiveKitMediaAdapter implements LiveKitMediaAdapter {
  async attachToRoom(): Promise<void> {
    return;
  }

  async subscribeToParticipantMicrophone(
    request: TranslationBridgeStartRequest,
  ): Promise<LiveKitAudioSource> {
    return {
      roomName: request.livekitRoomName,
      participantIdentity: request.sourceParticipantIdentity,
      trackSource: "microphone",
      format: { encoding: "pcm16", sampleRate: 24_000, channels: 1 },
    };
  }

  async createTranslatedAudioPublisher(
    request: TranslationBridgeStartRequest,
    format: RealtimePcmFormat,
  ): Promise<LiveKitTranslatedAudioPublisher> {
    return {
      roomName: request.livekitRoomName,
      trackName: request.targetTrackName,
      format,
    };
  }
}
