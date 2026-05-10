import { describe, expect, it } from "vitest";
import { deriveLiveKitProjectRegion, deriveSupabaseProject, fillLiveQaEvidence, formatLocalDate } from "./live-qa-evidence-init";

const checklist = `# Live QA checklist

Date: __________
Tester: __________
Environment URL: __________
Supabase project: __________
LiveKit project/region: __________

| Check | Expected evidence | Result | Notes |
| --- | --- | --- | --- |
| Translation | heard audio | ☐ Pass ☐ Fail | |
`;

describe("live QA evidence initializer", () => {
  it("fills metadata without marking checklist rows as passed", () => {
    const updated = fillLiveQaEvidence({
      markdown: checklist,
      date: "2026-05-10",
      tester: "QA",
      environmentUrl: "https://meet.example.com",
      supabaseUrl: "https://abc123.supabase.co",
      liveKitUrl: "wss://example.us.livekit.cloud",
      note: "User reported the live translation smoke test worked.",
      observedAt: "2026-05-10T01:00:00.000Z",
    });

    expect(updated).toContain("Date: 2026-05-10");
    expect(updated).toContain("Tester: QA");
    expect(updated).toContain("Environment URL: https://meet.example.com");
    expect(updated).toContain("Supabase project: abc123");
    expect(updated).toContain("LiveKit project/region: example.us.livekit.cloud");
    expect(updated).toContain("Manual observations");
    expect(updated).toContain("User reported the live translation smoke test worked.");
    expect(updated).toContain("| Translation | heard audio | ☐ Pass ☐ Fail | |");
  });

  it("derives provider identifiers from URLs", () => {
    expect(deriveSupabaseProject("https://ketyyrhkhfqecucsidfv.supabase.co")).toBe("ketyyrhkhfqecucsidfv");
    expect(deriveLiveKitProjectRegion("wss://project.region.livekit.cloud")).toBe("project.region.livekit.cloud");
  });

  it("formats the checklist date in local time instead of UTC slicing", () => {
    const lateLocalDate = new Date(2026, 4, 10, 0, 30);

    expect(formatLocalDate(lateLocalDate)).toBe("2026-05-10");
  });
});
