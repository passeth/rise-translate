import { z } from "zod";

const emptyStringToUndefined = (value: unknown) => value === "" ? undefined : value;
const optionalUrl = () => z.preprocess(emptyStringToUndefined, z.string().url().optional());
const defaultedUrl = (fallback: string) => z.preprocess(emptyStringToUndefined, z.string().url().default(fallback));

const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: defaultedUrl("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
});

const serverEnvSchema = clientEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  LIVEKIT_URL: z.string().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  LIVEKIT_TOKEN_TTL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_TRANSLATION_MODEL: z.string().default("gpt-realtime-translate"),
  OPENAI_TRANSCRIPTION_MODEL: z.string().default("gpt-realtime-whisper"),
  OPENAI_NOTES_MODEL: z.string().optional(),
  APP_ENCRYPTION_KEY_BASE64: z.string().optional(),
  INTERNAL_WORKER_TOKEN: z.string().optional(),
  TRANSLATION_WORKER_ADAPTER: z.string().optional(),
  TRANSLATION_WORKER_DRY_RUN: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  DATABASE_POOLER_URL: z.string().optional(),
  LIVEKIT_RECORDING_S3_BUCKET: z.string().optional(),
  LIVEKIT_RECORDING_S3_ACCESS_KEY: z.string().optional(),
  LIVEKIT_RECORDING_S3_SECRET_KEY: z.string().optional(),
  LIVEKIT_RECORDING_S3_REGION: z.string().optional(),
  LIVEKIT_RECORDING_S3_ENDPOINT: optionalUrl(),
  LIVEKIT_RECORDING_S3_FORCE_PATH_STYLE: z.string().optional(),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getClientEnv(): ClientEnv {
  return clientEnvSchema.parse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

export function getServerEnv(): ServerEnv {
  return serverEnvSchema.parse(process.env);
}

export function requireEnv<K extends keyof ServerEnv>(key: K): NonNullable<ServerEnv[K]> {
  const value = getServerEnv()[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${String(key)}`);
  }

  return value as NonNullable<ServerEnv[K]>;
}
