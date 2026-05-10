import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/health", () => {
  it("returns a non-cacheable liveness response", async () => {
    const response = GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toMatchObject({
      service: "rise-translate",
      status: "ok",
    });
    expect(new Date(body.timestamp).toString()).not.toBe("Invalid Date");
  });
});
