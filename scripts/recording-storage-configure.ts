import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

export type RecordingStorageCredentials = {
  accessKey: string;
  secretKey: string;
  region?: string;
  endpoint?: string;
};

export function getRecordingStorageCredentialsFromEnv(env: Record<string, string | undefined> = process.env): RecordingStorageCredentials | null {
  const accessKey = firstValue(env.LIVEKIT_RECORDING_S3_ACCESS_KEY, env.SUPABASE_S3_ACCESS_KEY_ID, env.S3_ACCESS_KEY_ID);
  const secretKey = firstValue(env.LIVEKIT_RECORDING_S3_SECRET_KEY, env.SUPABASE_S3_SECRET_ACCESS_KEY, env.S3_SECRET_ACCESS_KEY);

  if (!accessKey || !secretKey) return null;

  return {
    accessKey,
    secretKey,
    region: firstValue(env.LIVEKIT_RECORDING_S3_REGION, env.SUPABASE_S3_REGION, env.S3_REGION),
    endpoint: firstValue(env.LIVEKIT_RECORDING_S3_ENDPOINT, env.SUPABASE_S3_ENDPOINT, env.S3_ENDPOINT),
  };
}

export function upsertDotenvValues(text: string, values: Record<string, string | undefined>) {
  let result = text;

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value.trim() === "") continue;
    const line = `${key}=${escapeDotenvValue(value)}`;
    const pattern = new RegExp(`^${escapeRegExp(key)}=.*$`, "m");
    if (pattern.test(result)) {
      result = result.replace(pattern, line);
    } else {
      result += `${result.endsWith("\n") || result.length === 0 ? "" : "\n"}${line}\n`;
    }
  }

  return result;
}

export function buildRecordingStorageEnvPatch(credentials: RecordingStorageCredentials) {
  return {
    LIVEKIT_RECORDING_S3_BUCKET: "recordings",
    LIVEKIT_RECORDING_S3_ACCESS_KEY: credentials.accessKey,
    LIVEKIT_RECORDING_S3_SECRET_KEY: credentials.secretKey,
    LIVEKIT_RECORDING_S3_REGION: credentials.region,
    LIVEKIT_RECORDING_S3_ENDPOINT: credentials.endpoint,
    LIVEKIT_RECORDING_S3_FORCE_PATH_STYLE: "true",
  } satisfies Record<string, string | undefined>;
}

export function fingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function firstValue(...values: Array<string | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim();
}

function escapeDotenvValue(value: string) {
  if (/\s|#|"|'/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function main() {
  const envFileArg = process.argv.find((arg) => arg.startsWith("--env-file="));
  const envFile = envFileArg?.slice("--env-file=".length) || ".env.local";
  const credentials = getRecordingStorageCredentialsFromEnv();

  if (!credentials) {
    console.error(
      [
        "Recording S3 credentials were not found in the current process environment.",
        "Set LIVEKIT_RECORDING_S3_ACCESS_KEY and LIVEKIT_RECORDING_S3_SECRET_KEY, or aliases SUPABASE_S3_ACCESS_KEY_ID and SUPABASE_S3_SECRET_ACCESS_KEY, then rerun:",
        "  pnpm recording:storage:configure -- --env-file=.env.local",
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  const current = readFileSync(envFile, "utf8");
  const next = upsertDotenvValues(current, buildRecordingStorageEnvPatch(credentials));
  writeFileSync(envFile, next);

  console.log(`Recording storage env updated in ${envFile}.`);
  console.log(`- LIVEKIT_RECORDING_S3_BUCKET: recordings`);
  console.log(`- LIVEKIT_RECORDING_S3_ACCESS_KEY: present fp=${fingerprint(credentials.accessKey)}`);
  console.log(`- LIVEKIT_RECORDING_S3_SECRET_KEY: present fp=${fingerprint(credentials.secretKey)}`);
  if (credentials.region) console.log(`- LIVEKIT_RECORDING_S3_REGION: ${credentials.region}`);
  if (credentials.endpoint) console.log(`- LIVEKIT_RECORDING_S3_ENDPOINT: ${credentials.endpoint}`);
  console.log("Next: pnpm env:check web && pnpm recording:storage:smoke && pnpm vercel:env:sync -- --apply");
}

if (process.argv[1]?.endsWith("recording-storage-configure.ts")) {
  main();
}
