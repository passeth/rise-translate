import { afterEach, describe, expect, it, vi } from "vitest";
import { runDeployedPreflight } from "./deployed-preflight";

describe("deployed preflight smoke", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("requires the internal worker token", async () => {
    await expect(runDeployedPreflight("https://meet.example.com", "")).rejects.toThrow("INTERNAL_WORKER_TOKEN");
  });

  it("calls the protected deployed preflight endpoint without exposing secrets", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          summary: { severity: "warning", message: "1 warning" },
          checks: [
            {
              id: "server-translation-worker",
              label: "Server translation worker",
              severity: "warning",
              message: "Run Live QA",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const payload = await runDeployedPreflight("https://meet.example.com", "token-value");

    expect(payload.summary?.severity).toBe("warning");
    expect(fetchMock).toHaveBeenCalledWith(new URL("https://meet.example.com/api/internal/preflight"), {
      cache: "no-store",
      headers: { authorization: "Bearer token-value" },
    });
  });

  it("fails closed when deployed preflight has blockers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            summary: { severity: "blocked", message: "blocked" },
            checks: [
              {
                id: "recording-storage",
                label: "Recording storage",
                severity: "blocked",
                message: "missing",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(runDeployedPreflight("https://meet.example.com", "token-value")).rejects.toThrow(
      "production readiness blockers",
    );
  });
});
