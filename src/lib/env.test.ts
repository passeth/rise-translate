import { describe, expect, it, vi } from "vitest";
import { getClientEnv, getServerEnv } from "./env";

describe("environment parsing", () => {
  it("treats blank optional URLs as unset", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("LIVEKIT_RECORDING_S3_ENDPOINT", "");

    expect(getClientEnv().NEXT_PUBLIC_SUPABASE_URL).toBeUndefined();
    expect(getServerEnv().LIVEKIT_RECORDING_S3_ENDPOINT).toBeUndefined();

    vi.unstubAllEnvs();
  });

  it("uses the localhost app URL default when the env var is blank", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");

    expect(getClientEnv().NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");

    vi.unstubAllEnvs();
  });
});
