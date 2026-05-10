import { describe, expect, it } from "vitest";
import { RoomEvent, TrackKind, TrackSource, type RemoteAudioTrack, type RemoteTrackPublication } from "@livekit/rtc-node";
import { waitForMicrophoneTrack } from "./livekit-node-media-adapter";

type EventHandler = (...args: unknown[]) => void;

class FakeRoomEvents {
  private readonly handlers = new Map<unknown, Set<EventHandler>>();

  on(event: unknown, handler: EventHandler) {
    const handlers = this.handlers.get(event) ?? new Set<EventHandler>();
    handlers.add(handler);
    this.handlers.set(event, handlers);
    return this;
  }

  off(event: unknown, handler: EventHandler) {
    this.handlers.get(event)?.delete(handler);
    return this;
  }

  emit(event: unknown, ...args: unknown[]) {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(...args);
    }
  }
}

describe("LiveKit node media adapter microphone subscription", () => {
  it("listens for TrackSubscribed before requesting an existing microphone subscription", async () => {
    const room = new FakeRoomEvents();
    const audioTrack = { kind: TrackKind.KIND_AUDIO } as RemoteAudioTrack;
    const participant = buildParticipant("guest_1");
    const publication = buildMicrophonePublication(() => {
      room.emit(RoomEvent.TrackSubscribed, audioTrack, publication, participant);
    });
    participant.trackPublications.set("mic", publication);

    await expect(
      waitForMicrophoneTrack(room as never, participant as never, { timeoutMs: 25 }),
    ).resolves.toBe(audioTrack);
  });

  it("subscribes to a microphone publication that appears after the worker joins", async () => {
    const room = new FakeRoomEvents();
    const audioTrack = { kind: TrackKind.KIND_AUDIO } as RemoteAudioTrack;
    const participant = buildParticipant("guest_2");
    const publication = buildMicrophonePublication(() => {
      room.emit(RoomEvent.TrackSubscribed, audioTrack, publication, participant);
    });

    const pendingTrack = waitForMicrophoneTrack(room as never, participant as never, { timeoutMs: 25 });
    participant.trackPublications.set("mic", publication);
    room.emit(RoomEvent.TrackPublished, publication, participant);

    await expect(pendingTrack).resolves.toBe(audioTrack);
  });
});

function buildParticipant(identity: string) {
  return {
    identity,
    trackPublications: new Map<string, RemoteTrackPublication>(),
  };
}

function buildMicrophonePublication(onSubscribe: () => void) {
  return {
    kind: TrackKind.KIND_AUDIO,
    source: TrackSource.SOURCE_MICROPHONE,
    track: undefined,
    setSubscribed: (subscribed: boolean) => {
      if (subscribed) onSubscribe();
    },
  } as RemoteTrackPublication;
}
