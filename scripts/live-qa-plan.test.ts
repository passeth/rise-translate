import { describe, expect, it } from "vitest";
import { buildLiveQaPlan } from "./live-qa-plan";

describe("live QA plan", () => {
  it("normalizes the app URL and includes the required evidence categories", () => {
    const plan = buildLiveQaPlan({ appUrl: "https://meet.example.com/login?x=1" });

    expect(plan).toContain("App URL: https://meet.example.com");
    expect(plan).toContain("pnpm recording:storage:finalize");
    expect(plan).toContain("pnpm readiness:next");
    expect(plan).toContain("pnpm translation:worker:status");
    expect(plan).toContain("Korean ↔ English/Russian");
    expect(plan).toContain("no duplicate browser/server translation audio");
    expect(plan).toContain("does not mark any checklist item as passed");
    expect(plan).toContain("pnpm completion:audit");
  });

  it("uses custom participant profiles when supplied", () => {
    const plan = buildLiveQaPlan({
      appUrl: "https://meet.example.com",
      hostProfile: "Host: Korean / Russian",
      guestProfile: "Guest: Russian / Korean",
    });

    expect(plan).toContain("Host: Korean / Russian");
    expect(plan).toContain("Guest: Russian / Korean");
  });
});
