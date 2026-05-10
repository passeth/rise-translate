import { createHmac, createHash } from "crypto";
import type { RecordingStorageConfig } from "@/server/recordings/livekit-egress";
import { getRecordingStorageConfig } from "@/server/recordings/livekit-egress";
import { getServerEnv } from "@/lib/env";

export type RecordingStorageSmokeResult = {
  bucket: string;
  endpoint: string;
  objectKey: string;
  putStatus: number;
  headStatus: number;
  deleteStatus: number;
};

type SignedRequestInput = {
  method: "PUT" | "HEAD" | "DELETE";
  url: URL;
  storage: RecordingStorageConfig;
  body?: Uint8Array;
  now?: Date;
};

export async function smokeRecordingStorage(objectKey = createSmokeObjectKey()): Promise<RecordingStorageSmokeResult> {
  const storage = getRecordingStorageConfig();
  if (!storage) {
    const env = getServerEnv();
    const missing = [
      ["LIVEKIT_RECORDING_S3_BUCKET", env.LIVEKIT_RECORDING_S3_BUCKET],
      ["LIVEKIT_RECORDING_S3_ACCESS_KEY", env.LIVEKIT_RECORDING_S3_ACCESS_KEY],
      ["LIVEKIT_RECORDING_S3_SECRET_KEY", env.LIVEKIT_RECORDING_S3_SECRET_KEY],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);
    throw new Error(
      `Recording storage is not configured. Set ${missing.length > 0 ? missing.join(", ") : "recording S3 credentials"}.`,
    );
  }

  const url = buildRecordingStorageObjectUrl(storage, objectKey);
  const body = new TextEncoder().encode(`rise-translate recording storage smoke ${new Date().toISOString()}\n`);
  let putStatus = 0;
  let headStatus = 0;
  let deleteStatus = 0;

  try {
    const put = await fetch(url, {
      method: "PUT",
      headers: signS3Request({ method: "PUT", url, storage, body }),
      body,
    });
    putStatus = put.status;
    if (!put.ok) {
      throw new Error(`Recording storage PUT smoke failed with HTTP ${put.status}.`);
    }

    const head = await fetch(url, {
      method: "HEAD",
      headers: signS3Request({ method: "HEAD", url, storage }),
    });
    headStatus = head.status;
    if (!head.ok) {
      throw new Error(`Recording storage HEAD smoke failed with HTTP ${head.status}.`);
    }
  } finally {
    const remove = await fetch(url, {
      method: "DELETE",
      headers: signS3Request({ method: "DELETE", url, storage }),
    }).catch((error: unknown) => {
      throw new Error(error instanceof Error ? error.message : "Recording storage DELETE smoke failed.");
    });
    deleteStatus = remove.status;
    if (putStatus >= 200 && putStatus < 300 && !remove.ok && remove.status !== 404) {
      throw new Error(`Recording storage DELETE smoke failed with HTTP ${remove.status}.`);
    }
  }

  return {
    bucket: storage.bucket,
    endpoint: storage.endpoint,
    objectKey,
    putStatus,
    headStatus,
    deleteStatus,
  };
}

export function createSmokeObjectKey(now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return `smoke/recording-storage-${stamp}.txt`;
}

export function buildRecordingStorageObjectUrl(storage: RecordingStorageConfig, objectKey: string) {
  const endpoint = new URL(storage.endpoint.endsWith("/") ? storage.endpoint : `${storage.endpoint}/`);
  const encodedKey = encodeObjectKey(objectKey);

  if (storage.forcePathStyle) {
    endpoint.pathname = joinUrlPath(endpoint.pathname, storage.bucket, encodedKey);
    return endpoint;
  }

  endpoint.hostname = `${storage.bucket}.${endpoint.hostname}`;
  endpoint.pathname = joinUrlPath(endpoint.pathname, encodedKey);
  return endpoint;
}

export function signS3Request({ method, url, storage, body, now = new Date() }: SignedRequestInput): Record<string, string> {
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body ?? new Uint8Array());
  const host = url.host;
  const canonicalUri = `${url.pathname || "/"}`;
  const canonicalQuery = [...url.searchParams.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  const canonicalHeaders = [
    ["host", host],
    ["x-amz-content-sha256", payloadHash],
    ["x-amz-date", amzDate],
  ] as const;
  const signedHeaders = canonicalHeaders.map(([key]) => key).join(";");
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders.map(([key, value]) => `${key}:${value}\n`).join(""),
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${storage.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = getSignatureKey(storage.secret, dateStamp, storage.region, "s3");
  const signature = hmacHex(signingKey, stringToSign);

  return {
    Authorization: `AWS4-HMAC-SHA256 Credential=${storage.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
}

function encodeObjectKey(objectKey: string) {
  return objectKey.split("/").map(encodeURIComponent).join("/");
}

function joinUrlPath(...parts: string[]) {
  return parts
    .flatMap((part) => part.split("/"))
    .filter(Boolean)
    .join("/")
    .replace(/^/, "/");
}

function toAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function sha256Hex(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: string | Uint8Array, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: string | Uint8Array, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function getSignatureKey(secret: string, dateStamp: string, regionName: string, serviceName: string) {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, regionName);
  const kService = hmac(kRegion, serviceName);
  return hmac(kService, "aws4_request");
}
