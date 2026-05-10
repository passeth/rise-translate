import { describe, expect, it } from "vitest";
import { formatPilotSummary, getPilotGates, scrubAppRuntimeEnv, summarizePilotResults, type PilotGateResult } from "./pilot-check";

describe("internal pilot readiness check", () => {
  it("checks translation-meeting pilot gates without recording storage or formal liveqa blockers", () => {
    expect(getPilotGates().map((gate) => gate.id)).toEqual([
      "verify",
      "deployment-smoke",
      "livekit-smoke",
      "openai-smoke",
      "supabase-schema-smoke",
      "translation-worker-smoke",
      "translation-worker-status",
    ]);
  });

  it("marks pilot-ready when all scoped gates pass", () => {
    const results = getPilotGates().map((gate) => result(gate.id, gate.label, 0));

    expect(summarizePilotResults(results)).toMatchObject({ status: "pilot-ready", passed: 7, total: 7 });
    expect(formatPilotSummary(results)).toContain("recording as disabled until Supabase S3 keys are configured");
  });

  it("stays blocked when any scoped gate fails", () => {
    const results = [result("verify", "Code verification", 0), result("openai-smoke", "OpenAI Realtime smoke", 1)];

    expect(summarizePilotResults(results)).toMatchObject({ status: "blocked", passed: 1, total: 2 });
    expect(formatPilotSummary(results)).toContain("OpenAI Realtime smoke");
  });

  it("scrubs app runtime env for verify so tests do not inherit production credentials", () => {
    const scrubbed = scrubAppRuntimeEnv({
      PATH: "/bin",
      NEXT_PUBLIC_APP_URL: "https://example.com",
      LIVEKIT_URL: "wss://example.livekit.cloud",
      OPENAI_API_KEY: "secret",
      SUPABASE_SERVICE_ROLE_KEY: "secret",
      TRANSLATION_WORKER_ADAPTER: "livekit-node",
    });

    expect(scrubbed.PATH).toBe("/bin");
    expect(scrubbed.NEXT_PUBLIC_APP_URL).toBeUndefined();
    expect(scrubbed.LIVEKIT_URL).toBeUndefined();
    expect(scrubbed.OPENAI_API_KEY).toBeUndefined();
    expect(scrubbed.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(scrubbed.TRANSLATION_WORKER_ADAPTER).toBeUndefined();
  });
});

function result(id: string, label: string, exitCode: number): PilotGateResult {
  return { id, label, command: ["pnpm", id], exitCode };
}
