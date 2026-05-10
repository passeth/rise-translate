import { describe, expect, it } from "vitest";
import { assertLiveQaReady, evaluateLiveQaChecklist } from "./live-qa-check";

const completeChecklist = `# Live QA checklist

Date: 2026-05-09
Tester: QA
Environment URL: https://meet.example.com
Supabase project: project
LiveKit project/region: region

| Check | Expected evidence | Result | Notes |
| --- | --- | --- | --- |
| Verify | ok | ☑ Pass ☐ Fail | evidence |
| Translation | ok | ☑ Pass ☐ Fail | evidence |

## Readiness decision

- ☑ Ready for internal buyer pilot
- ☐ Not ready — blocker list below

Blockers:

1.
2.
`;

describe("live QA evidence checklist", () => {
  it("accepts a fully passed checklist with a ready decision", () => {
    const summary = evaluateLiveQaChecklist(completeChecklist);

    expect(summary.passedRows).toBe(2);
    expect(() => assertLiveQaReady(summary)).not.toThrow();
  });

  it("rejects pending rows and missing metadata", () => {
    const summary = evaluateLiveQaChecklist(
      completeChecklist
        .replace("Environment URL: https://meet.example.com", "Environment URL: __________")
        .replace("☑ Pass ☐ Fail", "☐ Pass ☐ Fail"),
    );

    expect(summary.metadataMissing).toContain("Environment URL");
    expect(summary.pendingRows).toContain("Verify");
    expect(() => assertLiveQaReady(summary)).toThrow("Pending checks");
  });

  it("rejects failed rows, not-ready decisions, and blockers", () => {
    const summary = evaluateLiveQaChecklist(
      completeChecklist
        .replace("| Translation | ok | ☑ Pass ☐ Fail | evidence |", "| Translation | ok | ☐ Pass ☑ Fail | broken |")
        .replace("- ☑ Ready for internal buyer pilot", "- ☐ Ready for internal buyer pilot")
        .replace("- ☐ Not ready — blocker list below", "- ☑ Not ready — blocker list below")
        .replace("1.", "1. Translation failed"),
    );

    expect(summary.failedRows).toContain("Translation");
    expect(summary.notReadySelected).toBe(true);
    expect(summary.blockers).toEqual(["Translation failed"]);
    expect(() => assertLiveQaReady(summary)).toThrow("Translation");
  });
});
