import type { RecordingRow } from "@/server/recordings/repository";

export type StoppableRecording = RecordingRow & {
  status: "active" | "processing";
  livekit_egress_id: string;
};

export function shouldStopLiveKitRecording(
  recording: Pick<RecordingRow, "status" | "livekit_egress_id" | "stopped_at"> | null | undefined,
): recording is StoppableRecording {
  if (!recording?.livekit_egress_id) return false;
  if (recording.status === "active") return true;
  return recording.status === "processing" && !recording.stopped_at;
}
