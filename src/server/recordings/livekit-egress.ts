import {
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  EgressStatus,
  S3Upload,
  type EgressInfo,
} from "livekit-server-sdk";
import { getServerEnv, requireEnv } from "@/lib/env";
import { mapLiveKitEgressStatus, type RecordingStatus } from "@/features/recordings/status";

type StartRecordingInput = {
  roomName: string;
  meetingId: string;
  recordingId: string;
  objectKey: string;
};

export type RecordingEgressResult = {
  egressId: string;
  status: RecordingStatus;
  error?: string;
};

export type RecordingStorageConfig = {
  bucket: string;
  endpoint: string;
  region: string;
  accessKey: string;
  secret: string;
  forcePathStyle: boolean;
};

export type RecordingStorageReadiness = {
  configured: boolean;
  message: string;
  missingEnv: string[];
};

export function getRecordingStorageReadiness(): RecordingStorageReadiness {
  const env = getServerEnv();
  const requiredEnv = [
    ["LIVEKIT_RECORDING_S3_BUCKET", env.LIVEKIT_RECORDING_S3_BUCKET],
    ["LIVEKIT_RECORDING_S3_ACCESS_KEY", env.LIVEKIT_RECORDING_S3_ACCESS_KEY],
    ["LIVEKIT_RECORDING_S3_SECRET_KEY", env.LIVEKIT_RECORDING_S3_SECRET_KEY],
  ] as const;
  const missingEnv = requiredEnv.reduce<string[]>((missing, [key, value]) => {
    if (!value) missing.push(key);
    return missing;
  }, []);

  if (missingEnv.length > 0) {
    return {
      configured: false,
      missingEnv,
      message: `Recording storage is not configured. Missing: ${missingEnv.join(", ")}.`,
    };
  }

  return {
    configured: true,
    missingEnv: [],
    message: env.LIVEKIT_RECORDING_S3_ENDPOINT
      ? "Recording storage is configured with an explicit S3 endpoint."
      : "Recording storage is configured; Supabase Storage S3 endpoint will be derived from Supabase URL.",
  };
}

export function getRecordingStorageConfig(): RecordingStorageConfig | null {
  const env = getServerEnv();
  const bucket = env.LIVEKIT_RECORDING_S3_BUCKET;
  const accessKey = env.LIVEKIT_RECORDING_S3_ACCESS_KEY;
  const secret = env.LIVEKIT_RECORDING_S3_SECRET_KEY;

  if (!bucket || !accessKey || !secret) {
    return null;
  }

  return {
    bucket,
    accessKey,
    secret,
    region: env.LIVEKIT_RECORDING_S3_REGION ?? "auto",
    endpoint: env.LIVEKIT_RECORDING_S3_ENDPOINT ?? deriveSupabaseStorageS3Endpoint(requireEnv("NEXT_PUBLIC_SUPABASE_URL")),
    forcePathStyle: env.LIVEKIT_RECORDING_S3_FORCE_PATH_STYLE !== "false",
  };
}

export function deriveSupabaseStorageS3Endpoint(supabaseUrl: string) {
  const url = new URL(supabaseUrl);
  const path = "/storage/v1/s3";

  if (url.hostname.endsWith(".storage.supabase.co")) {
    url.pathname = path;
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  }

  if (url.hostname.endsWith(".supabase.co")) {
    const projectRef = url.hostname.slice(0, -".supabase.co".length);
    url.hostname = `${projectRef}.storage.supabase.co`;
  }

  url.pathname = path;
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function createRecordingObjectKey(meetingId: string, recordingId: string, startedAt = new Date()) {
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  return `meetings/${meetingId}/recordings/${stamp}-${recordingId}.mp4`;
}

export async function startRoomRecording(input: StartRecordingInput): Promise<RecordingEgressResult> {
  const storage = getRecordingStorageConfig();
  if (!storage) {
    throw new Error(
      "Recording storage is not configured. Set LIVEKIT_RECORDING_S3_BUCKET, LIVEKIT_RECORDING_S3_ACCESS_KEY, and LIVEKIT_RECORDING_S3_SECRET_KEY.",
    );
  }

  const client = new EgressClient(requireEnv("LIVEKIT_URL"), requireEnv("LIVEKIT_API_KEY"), requireEnv("LIVEKIT_API_SECRET"));
  const output = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: input.objectKey,
    output: {
      case: "s3",
      value: new S3Upload({
        bucket: storage.bucket,
        accessKey: storage.accessKey,
        secret: storage.secret,
        region: storage.region,
        endpoint: storage.endpoint,
        forcePathStyle: storage.forcePathStyle,
        metadata: {
          meetingId: input.meetingId,
          recordingId: input.recordingId,
          audioPolicy: "original-room-audio-only",
          captionsIncluded: "false",
          translationAudioIncluded: "false",
        },
      }),
    },
  });

  const info = await client.startRoomCompositeEgress(input.roomName, output, {
    layout: "grid",
    audioOnly: false,
    videoOnly: false,
  });

  return toRecordingEgressResult(info);
}

export async function stopRoomRecording(egressId: string): Promise<RecordingEgressResult> {
  const client = new EgressClient(requireEnv("LIVEKIT_URL"), requireEnv("LIVEKIT_API_KEY"), requireEnv("LIVEKIT_API_SECRET"));
  const info = await client.stopEgress(egressId);
  return toRecordingEgressResult(info);
}

export async function listRoomRecordingStatus(roomName: string, egressId?: string): Promise<RecordingEgressResult | null> {
  const client = new EgressClient(requireEnv("LIVEKIT_URL"), requireEnv("LIVEKIT_API_KEY"), requireEnv("LIVEKIT_API_SECRET"));
  const egresses = await client.listEgress(egressId ? { egressId } : { roomName });
  const info = egresses[0];
  return info ? toRecordingEgressResult(info) : null;
}

function toRecordingEgressResult(info: EgressInfo): RecordingEgressResult {
  return {
    egressId: info.egressId,
    status: mapLiveKitEgressStatus(info.status),
    error: info.status === EgressStatus.EGRESS_FAILED ? info.error || info.details || "LiveKit egress failed" : undefined,
  };
}
