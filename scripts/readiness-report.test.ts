import { describe, expect, it } from "vitest";
import packageJson from "../package.json";
import {
  formatReadinessSummary,
  getReadinessGates,
  serializeReadinessResults,
  summarizeReadinessResults,
  type ReadinessGateResult,
} from "./readiness-report";

describe("readiness report", () => {
  it("runs every buyer-meeting readiness gate instead of stopping at preflight", () => {
    expect(getReadinessGates().map((gate) => gate.id)).toEqual([
      "verify",
      "preflight",
      "web-env-check",
      "worker-env-check",
      "deployment-smoke",
      "deployed-preflight",
      "livekit-smoke",
      "openai-smoke",
      "supabase-schema-smoke",
      "recording-storage-smoke",
      "translation-worker-smoke",
      "translation-worker-status",
      "liveqa-check",
    ]);
  });

  it("does not load .env.local at the report level so verify keeps the normal test environment", () => {
    expect(packageJson.scripts["readiness:report"]).toBe("node --import tsx scripts/readiness-report.ts");
  });

  it("marks the report blocked when any required gate fails", () => {
    const results = [
      result("verify", "Code verification", 0),
      result("preflight", "Production preflight", 1),
      result("openai-smoke", "OpenAI Realtime smoke", 0),
    ];

    expect(summarizeReadinessResults(results)).toMatchObject({
      status: "blocked",
      total: 3,
      passed: 2,
      failed: [expect.objectContaining({ id: "preflight" })],
    });
    expect(formatReadinessSummary(results)).toContain("Production preflight");
  });

  it("marks the report ready only when all required gates pass", () => {
    expect(summarizeReadinessResults([result("verify", "Code verification", 0)])).toMatchObject({
      status: "ready",
      passed: 1,
    });
  });

  it("serializes machine-readable readiness results for completion audits", () => {
    const payload = JSON.parse(serializeReadinessResults([result("verify", "Code verification", 0)])) as {
      generatedAt?: string;
      results?: ReadinessGateResult[];
    };

    expect(payload.generatedAt).toBeTruthy();
    expect(payload.results?.[0]).toMatchObject({ id: "verify", exitCode: 0 });
  });
});

function result(id: string, label: string, exitCode: number): ReadinessGateResult {
  return {
    id,
    label,
    command: "pnpm",
    args: [id],
    required: true,
    exitCode,
    signal: null,
    durationMs: 100,
  };
}
